import { getAppUrl, isUuid } from './httpSecurity.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

export class PaymentError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code); }
}

export function paymentConfig() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const collectorId = process.env.MERCADO_PAGO_COLLECTOR_ID;
  const production = process.env.VERCEL_ENV === 'production'
    || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');
  const liveMode = process.env.MERCADO_PAGO_LIVE_MODE !== 'false';
  const appUrl = getAppUrl();
  if (!accessToken || !secret || !collectorId || !/^\d+$/.test(collectorId)
    || /^0+$/.test(collectorId) || new URL(appUrl).protocol !== 'https:'
    || (production && (!liveMode || accessToken.startsWith('TEST-')))) {
    throw new PaymentError('payment_configuration_required');
  }
  return { accessToken, secret, collectorId, liveMode, appUrl };
}

export function isMercadoPagoCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && /^(?:[a-z0-9-]+\.)*mercadopago\.com(?:\.br)?$/i.test(url.hostname);
  } catch { return false; }
}

export interface ProviderPayment {
  id: number; status: string; external_reference: string; transaction_amount: number;
  currency_id: string; live_mode: boolean; collector_id: number; date_last_updated: string;
  transaction_amount_refunded?: number; date_approved?: string; status_detail?: string;
  metadata?: { order_id?: string; user_id?: string; plan_id?: string };
  order?: { id?: number | string };
}

async function providerGet<T>(path: string): Promise<T> {
  const { accessToken } = paymentConfig();
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new PaymentError(`payment_provider_${response.status}`);
  return response.json() as Promise<T>;
}

export async function getProviderPayment(id: string): Promise<ProviderPayment> {
  if (!/^[1-9]\d{0,18}$/.test(id)) throw new PaymentError('invalid_payment_id', 400);
  const payment = await providerGet<ProviderPayment>(`/v1/payments/${id}`);
  if (String(payment.id) !== id) throw new PaymentError('payment_id_mismatch', 422);
  return payment;
}

export async function syncProviderPayment(payment: ProviderPayment, expectedOrderId?: string) {
  const config = paymentConfig();
  if (!Number.isSafeInteger(payment.id) || payment.id <= 0 || !isUuid(payment.external_reference)
    || (expectedOrderId && payment.external_reference !== expectedOrderId)
    || payment.currency_id !== 'BRL' || payment.live_mode !== config.liveMode
    || String(payment.collector_id) !== config.collectorId
    || !Number.isFinite(Date.parse(payment.date_last_updated))) {
    throw new PaymentError('payment_identity_mismatch', 422);
  }
  const db = getSupabaseAdmin();
  const { data: order, error } = await db.from('payment_orders')
    .select('id,user_id,plan_id,amount_cents').eq('id', payment.external_reference).maybeSingle();
  if (error) throw new PaymentError('payment_database_unavailable');
  if (!order) throw new PaymentError('payment_order_not_found', 404);
  const cents = Math.round(payment.transaction_amount * 100);
  const refunded = Math.round((payment.transaction_amount_refunded ?? 0) * 100);
  if (!Number.isSafeInteger(cents) || cents !== order.amount_cents || !Number.isSafeInteger(refunded)
    || refunded < 0 || refunded > cents
    || (payment.metadata?.order_id && payment.metadata.order_id !== order.id)
    || (payment.metadata?.user_id && payment.metadata.user_id !== order.user_id)
    || (payment.metadata?.plan_id && payment.metadata.plan_id !== order.plan_id)) {
    throw new PaymentError('payment_amount_or_order_mismatch', 422);
  }
  // Store only reconciliation fields, never payer/card data or the access token.
  const payload = { id: payment.id, status: payment.status, status_detail: payment.status_detail,
    external_reference: payment.external_reference, currency_id: payment.currency_id,
    transaction_amount: payment.transaction_amount, transaction_amount_refunded: payment.transaction_amount_refunded ?? 0,
    live_mode: payment.live_mode, collector_id: payment.collector_id,
    merchant_order_id: payment.order?.id, date_approved: payment.date_approved,
    date_last_updated: payment.date_last_updated };
  const result = await db.rpc('record_payment_state', { p_order_id: order.id, p_payment_id: String(payment.id),
    p_status: payment.status, p_amount_cents: cents, p_refunded_cents: refunded,
    p_provider_updated_at: payment.date_last_updated, p_payload: payload });
  if (result.error) throw new PaymentError('payment_database_unavailable');
  if (result.data?.error) throw new PaymentError(String(result.data.error), 409);
  if (result.data?.needsReview) console.error('[payments] duplicate approved payment', { orderId: order.id, paymentId: payment.id });
  return result.data;
}

/** Provider read + the same atomic fulfillment used by webhooks. */
export async function reconcileOrder(orderId: string) {
  const result = await providerGet<{ results?: ProviderPayment[] }>(`/v1/payments/search?${new URLSearchParams({
    external_reference: orderId, sort: 'date_last_updated', criteria: 'desc', limit: '20',
  })}`);
  if (!Array.isArray(result.results)) throw new PaymentError('invalid_payment_search');
  for (const payment of [...result.results].sort((a, b) => Date.parse(a.date_last_updated) - Date.parse(b.date_last_updated))) {
    await syncProviderPayment(payment, orderId);
  }
}
