// @vitest-environment node
import { createHmac } from 'node:crypto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import createPreference from '../../api/payments/create-preference';
import webhook from '../../api/payments/webhook';
import status from '../../api/payments/status';

const state = vi.hoisted(() => ({ user: { id: '00000000-0000-4000-8000-000000000001', email: 'buyer@example.test' } as { id: string; email: string } | null,
  create: vi.fn(), rpc: vi.fn(), fetch: vi.fn(), writes: [] as { table: string; payload: unknown }[],
  order: {} as Record<string, any>, profile: { is_active: true, active_until: '2099-01-01T00:00:00Z' },
  ownsOrder: true, databaseFailure: false,
}));
vi.mock('mercadopago', async importOriginal => ({ ...await importOriginal<object>(),
  Preference: class { create = state.create; }, MercadoPagoConfig: class {},
}));
vi.mock('../../server/supabaseAdmin.js', () => ({ authenticateBearer: async () => state.user,
  getSupabaseAdmin: () => ({ rpc: state.rpc, from: (table: string) => {
    const filters: Record<string, unknown> = {}; let updating = false;
    const query = { select: () => query, eq: (field: string, value: unknown) => { filters[field] = value; return query; },
      maybeSingle: () => query, single: () => query,
      update: (payload: unknown) => { updating = true; state.writes.push({ table, payload }); return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: table === 'profiles' ? state.profile
          : table === 'payment_orders' && (updating || (state.ownsOrder && (!filters.id || filters.id === state.order.id))) ? state.order : null,
        error: state.databaseFailure ? { code: '42501' } : null,
      }).then(resolve),
    }; return query;
  } }),
}));
const planId = '00000000-0000-4000-8000-000000000002';
const orderId = '00000000-0000-4000-8000-000000000003';
const requestId = '00000000-0000-4000-8000-000000000004';
const payment = () => ({ id: 12345, status: 'approved', external_reference: orderId,
  transaction_amount: 29.90, transaction_amount_refunded: 0, currency_id: 'BRL', collector_id: 987654,
  live_mode: true, date_last_updated: '2026-10-29T20:00:00Z',
  metadata: { order_id: orderId, plan_id: planId, user_id: state.user?.id } });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
async function call(handler: typeof webhook, overrides: Partial<VercelRequest> = {}) {
  let code = 200; let body: Record<string, any> = {};
  const res = { setHeader: vi.fn(), status: (value: number) => { code = value; return res; },
    json: (value: Record<string, any>) => { body = value; return res; }, end: vi.fn() };
  await handler({ method: 'POST', query: {}, headers: { 'content-type': 'application/json' },
    body: { planId, requestId }, ...overrides } as VercelRequest, res as unknown as VercelResponse);
  return { code, body };
}
function signed(body = { type: 'payment', data: { id: '12345' } }) {
  const ts = '1793304000000';
  const hash = createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET!)
    .update(`id:12345;request-id:request-id;ts:${ts};`).digest('hex');
  return { body, query: { 'data.id': '12345', type: 'payment' }, headers: { 'x-signature': `ts=${ts},v1=${hash}`, 'x-request-id': 'request-id' } };
}
beforeEach(() => {
  vi.stubEnv('APP_URL', 'https://safo-app.vercel.app');
  vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', 'APP_USR-test-token');
  vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', 'test-secret');
  vi.stubEnv('MERCADO_PAGO_COLLECTOR_ID', '987654');
  vi.stubEnv('MERCADO_PAGO_LIVE_MODE', 'true');
  state.user = { id: '00000000-0000-4000-8000-000000000001', email: 'buyer@example.test' };
  state.ownsOrder = true; state.databaseFailure = false; state.writes = [];
  state.order = { id: orderId, user_id: state.user.id, plan_id: planId, plan_name: 'Mensal', amount_cents: 2990,
    duration_days: 30, created_at: '2026-10-29T00:00:00Z', checkout_expires_at: '2026-10-30T00:00:00Z',
    status: 'approved', fulfilled_at: '2026-10-29T00:00:00Z', reused: false };
  state.create.mockReset().mockResolvedValue({ id: 'preference', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=preference' });
  state.rpc.mockReset().mockImplementation(async (name: string) => ({ error: null, data:
    name === 'create_checkout_order' ? state.order : name === 'claim_payment_check' ? true : {} }));
  state.fetch.mockReset().mockImplementation(async (url: string) => json(url.includes('/search?') ? { results: [payment()] } : payment()));
  vi.stubGlobal('fetch', state.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('checkout configuration and order integrity', () => {
  it('uses authenticated ownership and snapshotted prices, ignoring forged client fields', async () => {
    expect((await call(createPreference, { body: { planId, requestId, userId: 'victim', price_cents: 1, duration_days: 900 } })).code).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith('create_checkout_order', { p_user_id: state.user!.id, p_plan_id: planId, p_request_id: requestId });
    expect(state.create.mock.calls[0][0]).toMatchObject({ body: { items: [{ quantity: 1, unit_price: 29.9 }],
      external_reference: orderId, back_urls: { success: `https://safo-app.vercel.app/pagamento/sucesso?order_id=${orderId}` }, expires: true },
    requestOptions: { idempotencyKey: orderId } });
  });
  it('does not initiate a charge without webhook configuration', async () => {
    vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', '');
    expect((await call(createPreference)).code).toBe(503);
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled();
  });
  it('requires authentication before creating an order', async () => {
    state.user = null; expect((await call(createPreference)).code).toBe(401);
    expect(state.create).not.toHaveBeenCalled();
  });
  it('reuses a valid checkout without issuing another provider request', async () => {
    state.order.reused = true; state.order.checkout_url = 'https://www.mercadopago.com.br/checkout';
    expect((await call(createPreference)).body.orderId).toBe(orderId);
    expect(state.create).not.toHaveBeenCalled();
  });
  it.each(['http://mercadopago.com.br/pay', 'https://mercadopago.com.br.evil.test/pay', 'https://name:pass@mercadopago.com.br/pay'])('rejects an unsafe checkout URL %s', async url => {
    state.create.mockResolvedValue({ id: 'preference', init_point: url });
    expect((await call(createPreference)).code).toBe(503);
    expect(state.writes.at(-1)?.payload).toEqual({ checkout_lease_until: null, checkout_lease_token: null });
  });
  it('preserves the reserved order and releases its lease after a provider failure', async () => {
    state.create.mockRejectedValue(new Error('provider unavailable'));
    expect((await call(createPreference)).code).toBe(503);
    expect(state.writes.at(-1)?.payload).toEqual({ checkout_lease_until: null, checkout_lease_token: null });
  });
});

describe('verified Mercado Pago notifications', () => {
  it('accepts signed query topics even when body.type is absent', async () => {
    const request = signed(); delete (request.body as { type?: string }).type;
    expect((await call(webhook, request)).code).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith('record_payment_state', expect.objectContaining({ p_order_id: orderId, p_payment_id: '12345', p_status: 'approved' }));
  });
  it('rejects a forged signature before querying Mercado Pago', async () => {
    const request = signed(); request.headers['x-signature'] += 'bad';
    expect((await call(webhook, request)).code).toBe(401); expect(state.fetch).not.toHaveBeenCalled();
  });
  it('rejects a body/query payment ID mismatch', async () => {
    const request = signed(); request.body.data.id = 'other';
    expect((await call(webhook, request)).code).toBe(400); expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each([{ currency_id: 'USD' }, { collector_id: 1 }, { transaction_amount: 0.01 }, { live_mode: false }])('does not grant access for mismatched provider data %j', async patch => {
    state.fetch.mockResolvedValue(json({ ...payment(), ...patch }));
    expect((await call(webhook, signed())).code).toBe(422);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('does not acknowledge failed database persistence as a completed notification', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: 'XX001' } });
    expect((await call(webhook, signed())).code).toBe(503);
  });
});

describe('payment return reconciliation', () => {
  it('checks order ownership before querying the provider, regardless of the requested status', async () => {
    state.ownsOrder = false;
    expect((await call(status, { body: { orderId, status: 'approved', user_id: state.user!.id } })).code).toBe(404);
    expect(state.fetch).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('recovers a verified approval through the same transaction used by webhooks', async () => {
    const result = await call(status, { body: { orderId } });
    expect(result.code).toBe(200); expect(result.body.access.entitled).toBe(true);
    expect(state.fetch.mock.calls[0][0]).toContain(`external_reference=${orderId}`);
    expect(state.rpc).toHaveBeenCalledWith('record_payment_state', expect.objectContaining({ p_order_id: orderId }));
  });
});
