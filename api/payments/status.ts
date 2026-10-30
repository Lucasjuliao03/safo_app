import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applySameOriginCors, isUuid } from '../../server/httpSecurity.js';
import { authenticateBearer, getSupabaseAdmin } from '../../server/supabaseAdmin.js';
import { paymentConfig, reconcileOrder, PaymentError } from '../../server/mercadoPago.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!applySameOriginCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const user = await authenticateBearer(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Entre na conta que realizou o pagamento.' });
    const orderId = req.body?.orderId;
    if (!isUuid(orderId)) return res.status(400).json({ error: 'Pedido inválido' });
    const db = getSupabaseAdmin();
    const { data: owned, error } = await db.from('payment_orders').select('id').eq('id', orderId).eq('user_id', user.id).maybeSingle();
    if (error) throw new PaymentError('payment_database_unavailable');
    if (!owned) return res.status(404).json({ error: 'Pedido não encontrado nesta conta' });
    paymentConfig();
    const check = await db.rpc('claim_payment_check', { p_user_id: user.id, p_order_id: orderId });
    if (check.error) throw new PaymentError('payment_database_setup_required');
    if (check.data === true) await reconcileOrder(orderId);
    const [order, profile] = await Promise.all([
      db.from('payment_orders').select('id,status,plan_name,duration_days,fulfilled_at,needs_review').eq('id', orderId).eq('user_id', user.id).single(),
      db.from('profiles').select('is_active,active_until,access_blocked').eq('id', user.id).single(),
    ]);
    if (order.error || profile.error || !order.data || !profile.data) throw new PaymentError('payment_database_unavailable');
    const entitled = !profile.data.access_blocked && profile.data.is_active === true && (!profile.data.active_until || Date.parse(profile.data.active_until) > Date.now());
    return res.status(200).json({ order: order.data, access: { entitled, expiresAt: profile.data.active_until } });
  } catch (error) {
    const code = error instanceof PaymentError ? error.code : 'payment_unavailable';
    console.error('[payments/status]', { code });
    return res.status(503).json({ error: 'Não foi possível confirmar o pagamento agora. Tente novamente.', code });
  }
}
