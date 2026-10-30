// Read-only: never creates a preference, payment, refund or access grant.
import { existsSync, readFileSync } from 'node:fs';

const config = { ...process.env };
for (const path of ['.env', '.env.local', '.env.production.local']) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) config[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
const required = ['APP_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET', 'MERCADO_PAGO_COLLECTOR_ID'];
const report = { localConfiguration: Object.fromEntries(required.map(key => [key,
  !config[key] ? 'missing' : /^(your-|x{4}|0{4})/.test(config[key]) ? 'placeholder' : 'present'])),
  appOrigin: config.APP_URL, liveMode: config.MERCADO_PAGO_LIVE_MODE ?? 'production default', liveChecks: {} };
if (process.argv.includes('--live')) {
  const get = async (url, headers) => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  try {
    const identity = await get('https://api.mercadopago.com/users/me', { Authorization: `Bearer ${config.MERCADO_PAGO_ACCESS_TOKEN}` });
    report.liveChecks.mercadoPago = { status: identity.status, site: identity.body?.site_id,
      errorCode: identity.status >= 400 ? identity.body?.error ?? identity.body?.code : undefined,
      collectorId: identity.body?.id, testAccount: identity.body?.tags?.includes('test_user'),
      configuredCollectorMatches: String(identity.body?.id) === config.MERCADO_PAGO_COLLECTOR_ID };
    const schema = await get(`${config.SUPABASE_URL}/rest/v1/`, {
      apikey: config.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
    });
    report.liveChecks.database = { status: schema.status,
      functions: Object.fromEntries(['create_checkout_order', 'record_payment_state', 'get_study_access'].map(name =>
        [name, !!schema.body?.paths?.[`/rpc/${name}`]])),
      snapshotColumns: schema.body?.definitions?.payment_orders?.properties
        ? ['duration_days', 'plan_name', 'checkout_expires_at'].filter(name => name in schema.body.definitions.payment_orders.properties) : [] };
    const plans = await get(`${config.SUPABASE_URL}/rest/v1/plans?select=price_cents,duration_days&is_active=eq.true`, {
      apikey: config.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
    });
    report.liveChecks.plans = { status: plans.status, activeCount: Array.isArray(plans.body) ? plans.body.length : null,
      allTermsValid: Array.isArray(plans.body) && plans.body.length > 0
        && plans.body.every(plan => Number.isInteger(plan.price_cents) && plan.price_cents > 0
          && Number.isInteger(plan.duration_days) && plan.duration_days > 0) };
  } catch { report.liveChecks.error = 'Read-only connection check failed; no credentials logged.'; }
}
console.log(JSON.stringify(report, null, 2));
