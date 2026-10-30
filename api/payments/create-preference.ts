import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { applySameOriginCors, isUuid } from '../../server/httpSecurity.js';
import { authenticateBearer, getSupabaseAdmin } from '../../server/supabaseAdmin.js';
import { isMercadoPagoCheckoutUrl, paymentConfig, PaymentError } from '../../server/mercadoPago.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!applySameOriginCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
    const user = await authenticateBearer(req.headers.authorization);
    if (!user?.email) return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    const { planId, requestId } = (req.body ?? {}) as { planId?: unknown; requestId?: unknown };
    if (!isUuid(planId) || !isUuid(requestId)) return res.status(400).json({ error: 'Plano ou solicitação inválidos' });
    const config = paymentConfig();
    const db = getSupabaseAdmin();
    const { data: order, error } = await db.rpc('create_checkout_order', { p_user_id: user.id, p_plan_id: planId, p_request_id: requestId });
    if (error || !order) throw new PaymentError('payment_database_setup_required');
    if (order.error) {
      const busy = ['checkout_busy', 'checkout_rate_limited'].includes(order.error);
      if (busy) res.setHeader('Retry-After', order.error === 'checkout_busy' ? '3' : '600');
      return res.status(busy ? 429 : 409).json({ error: busy ? 'Aguarde alguns instantes antes de tentar novamente.'
        : 'Este pagamento não pode ser iniciado. Atualize os planos e tente novamente.', code: order.error });
    }
    if (order.reused) {
      if (!isMercadoPagoCheckoutUrl(order.checkout_url)) throw new PaymentError('invalid_checkout_url');
      return res.status(200).json({ initPoint: order.checkout_url, orderId: order.id });
    }
    try {
      const preference = await new Preference(new MercadoPagoConfig({ accessToken: config.accessToken,
        options: { timeout: 8_000, maxRetries: 0 } })).create({
        body: {
          items: [{ id: order.plan_id, title: order.plan_name, quantity: 1, unit_price: order.amount_cents / 100, currency_id: 'BRL' }],
          payer: { email: user.email }, external_reference: order.id,
          metadata: { order_id: order.id, plan_id: order.plan_id, user_id: user.id },
          back_urls: Object.fromEntries([['success', 'sucesso'], ['pending', 'pendente'], ['failure', 'falhou']]
            .map(([key, path]) => [key, `${config.appUrl}/pagamento/${path}?order_id=${order.id}`])),
          auto_return: 'approved', notification_url: `${config.appUrl}/api/payments/webhook`,
          expires: true, expiration_date_from: order.created_at, expiration_date_to: order.checkout_expires_at,
          statement_descriptor: 'SAFO ESTUDOS',
        }, requestOptions: { idempotencyKey: order.id },
      });
      const url = config.liveMode ? preference.init_point : preference.sandbox_init_point;
      if (!preference.id || !isMercadoPagoCheckoutUrl(url)) throw new PaymentError('invalid_checkout_url');
      const result = await db.from('payment_orders').update({ mp_preference_id: preference.id, checkout_url: url,
        checkout_lease_until: null, checkout_lease_token: null }).eq('id', order.id).eq('checkout_lease_token', requestId).select('id').maybeSingle();
      if (result.error || !result.data) throw new PaymentError('payment_preference_not_saved');
      return res.status(200).json({ initPoint: url, orderId: order.id });
    } catch (error) {
      // Preserve the order and stable provider idempotency key for retries.
      await db.from('payment_orders').update({ checkout_lease_until: null, checkout_lease_token: null })
        .eq('id', order.id).eq('checkout_lease_token', requestId);
      throw error;
    }
  } catch (error) {
    const code = error instanceof PaymentError ? error.code : 'payment_unavailable';
    console.error('[payments/create-preference]', { code });
    return res.status(503).json({ error: 'Não foi possível iniciar o pagamento. Tente novamente ou entre em contato com o suporte.', code });
  }
}
