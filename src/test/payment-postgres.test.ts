// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';

describe('payment lifecycle in PostgreSQL', () => {
  let db: PGlite; let user: string; let plan: string; let tick = 0;
  const rows = async (sql: string, args: unknown[] = []) => (await db.query<Record<string, any>>(sql, args)).rows;
  const rpc = async (sql: string, args: unknown[]) => (await rows(sql, args))[0].result;
  const checkout = (request = randomUUID()) => rpc('select create_checkout_order($1,$2,$3) as result', [user, plan, request]);
  const record = (order: string, payment = '100', status = 'approved', refund = 0, timestamp?: string) =>
    rpc('select record_payment_state($1,$2,$3,$4,$5,$6) as result', [order, payment, status, 2990, refund,
      timestamp ?? new Date(Date.UTC(2026, 9, 29, 0, 0, ++tick)).toISOString()]);
  const profile = async () => (await rows('select is_active,active_until from profiles where id=$1', [user]))[0];
  beforeAll(async () => {
    db = new PGlite();
    for (const path of ['src/test/fixtures/trial-schema.sql', 'src/test/fixtures/study-progress-schema.sql',
      'sql/INSTALAR_CORRECAO_ESTUDOS.sql', 'sql/INSTALAR_CORRECAO_PAGAMENTOS.sql']) {
      await db.exec(readFileSync(path, 'utf8'));
    }
  }, 30_000);
  beforeEach(async () => {
    user = randomUUID(); plan = randomUUID();
    await rows('insert into profiles(id) values($1)', [user]);
    await rows("insert into plans(id,code,name,price_cents,duration_days) values($1,$2,'Mensal',2990,30)", [plan, plan]);
  });
  afterAll(async () => { await db?.close(); });

  it('snapshots checkout terms and reuses the same order after a provider failure', async () => {
    const request = randomUUID(); const first = await checkout(request);
    expect(first).toMatchObject({ amount_cents: 2990, duration_days: 30, plan_name: 'Mensal', reused: false });
    expect((await checkout(request)).error).toBe('checkout_busy');
    await rows('update payment_orders set checkout_lease_until=null where id=$1', [first.id]);
    await rows("update plans set duration_days=90,price_cents=9990,name='Novo plano' where id=$1", [plan]);
    expect(await checkout(request)).toMatchObject({ id: first.id, duration_days: 30, amount_cents: 2990 });
    await record(first.id, String(++tick + 12000));
    const period = (await rows('select duration_seconds from user_access_periods where order_id=$1', [first.id]))[0];
    expect(period.duration_seconds).toBe(30 * 86400);
  });
  it('commits payment and access once across competing duplicate notifications', async () => {
    const order = await checkout(); const id = String(++tick + 1000);
    const timestamp = new Date().toISOString();
    await Promise.all(Array.from({ length: 20 }, () => record(order.id, id, 'approved', 0, timestamp)));
    expect(await rows('select order_id from user_access_periods where user_id=$1', [user])).toEqual([{ order_id: order.id }]);
    expect((await profile()).is_active).toBe(true);
    const before = (await profile()).active_until;
    await record(order.id, id);
    expect((await profile()).active_until).toEqual(before);
  });
  it('does not grant access for pending, authorized or rejected attempts, and accepts a later successful attempt', async () => {
    const o = await checkout(); const id = String(++tick + 2000);
    for (const status of ['pending', 'authorized', 'rejected']) await record(o.id, id, status);
    expect((await profile()).is_active).toBe(false);
    await record(o.id, String(++tick + 3000));
    expect((await profile()).is_active).toBe(true);
    await record(o.id, id, 'cancelled');
    expect((await profile()).is_active).toBe(true);
  });
  it('keeps access after a partial refund and blocks after a full refund without restoring the free trial', async () => {
    const o = await checkout(); const id = String(++tick + 4000);
    await record(o.id, id); const end = (await profile()).active_until;
    await record(o.id, id, 'approved', 1000);
    expect(await profile()).toEqual({ is_active: true, active_until: end });
    await record(o.id, id, 'refunded', 2990);
    expect((await profile()).is_active).toBe(false);
    const access = await rpc('select get_study_access($1) as result', [user]);
    expect(access).toMatchObject({ entitled: false, expired: true });
    await record(o.id, id);
    expect((await profile()).is_active).toBe(false);
  });
  it('removes refunded unused time from stacked renewals instead of retaining the old cumulative end', async () => {
    const first = await checkout(); const id = String(++tick + 5000); await record(first.id, id);
    const second = await checkout(); const other = String(++tick + 6000); await record(second.id, other);
    const stacked = Date.parse((await profile()).active_until);
    expect(stacked - Date.now()).toBeGreaterThan(59 * 86400_000);
    await record(first.id, id, 'refunded', 2990);
    const remaining = Date.parse((await profile()).active_until);
    expect(remaining - Date.now()).toBeLessThanOrEqual(30 * 86400_000 + 1000);
    expect(remaining - Date.now()).toBeGreaterThan(29 * 86400_000);
  });
  it('rejects stale statuses and cancels access on chargeback', async () => {
    const o = await checkout(); const id = String(++tick + 7000);
    await record(o.id, id, 'approved', 0, '2026-10-29T02:00:00Z');
    expect((await record(o.id, id, 'pending', 0, '2026-10-29T01:00:00Z')).replayed).toBe(true);
    expect((await profile()).is_active).toBe(true);
    await record(o.id, id, 'charged_back', 0, '2026-10-29T03:00:00Z');
    expect((await profile()).is_active).toBe(false);
  });
  it('records a second actual approval for review without fulfilling the same purchase twice', async () => {
    const o = await checkout(); await record(o.id, String(++tick + 8000)); const end = (await profile()).active_until;
    expect((await record(o.id, String(++tick + 9000))).needsReview).toBe(true);
    expect((await profile()).active_until).toEqual(end);
  });
  it('does not revoke an existing manual grant when an unrelated unpaid attempt is cancelled', async () => {
    await rows("update profiles set is_active=true,active_until=now()+interval '10 days' where id=$1", [user]);
    const before = await profile(); const o = await checkout(); await record(o.id, String(++tick + 10000), 'cancelled');
    expect(await profile()).toEqual(before);
  });
  it('rolls back the entire transaction if granting access fails', async () => {
    const o = await checkout(); const id = String(++tick + 11000);
    await db.exec('alter table profiles add constraint fail_paid check(is_active=false) not valid');
    try { await expect(record(o.id, id)).rejects.toThrow(); }
    finally { await db.exec('alter table profiles drop constraint fail_paid'); }
    expect(await rows('select * from safo_payments.transactions where payment_id=$1', [id])).toEqual([]);
    expect(await rows('select * from user_access_periods where order_id=$1', [o.id])).toEqual([]);
    expect((await rows('select status from payment_orders where id=$1', [o.id]))[0].status).toBe('pending');
  });
  it('never lifts an administrative hold on approval and prevents study or another checkout', async () => {
    const o = await checkout();
    await rows('update profiles set access_blocked=true,is_active=false where id=$1', [user]);
    await record(o.id, String(++tick + 13000));
    expect((await profile()).is_active).toBe(false);
    expect((await rpc('select get_study_access($1) as result', [user])).blocked).toBe(true);
    expect((await checkout()).error).toBe('account_blocked');
    await expect(rpc("select complete_study_use($1,$2,'questions',1,'a') as result", [user, randomUUID()])).rejects.toThrow('account_blocked');
    expect((await rpc('select get_study_access($1) as result', [user])).used).toBe(0);
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec('set role authenticated');
    try {
      await expect(rows('update profiles set access_blocked=false where id=$1', [user])).rejects.toThrow();
      expect(await rows('select * from questions')).toEqual([]);
    } finally { await db.exec('reset role'); }
  });
  it('keeps active plans publicly readable while hiding inactive ones', async () => {
    await db.exec('set role anon');
    try { expect((await rows('select id from plans where id=$1', [plan]))).toEqual([{ id: plan }]); }
    finally { await db.exec('reset role'); }
  });
  it('blocks a full refund received before its approval notification without granting any period', async () => {
    const o = await checkout(); await record(o.id, String(++tick + 14000), 'refunded', 2990);
    expect((await rpc('select get_study_access($1) as result', [user]))).toMatchObject({ entitled: false, expired: true });
    expect(await rows('select id from user_access_periods where order_id=$1', [o.id])).toEqual([]);
  });
  it('can rerun the installer without changing a fulfilled purchase or access deadline', async () => {
    const o = await checkout(); await record(o.id, String(++tick + 15000)); const before = await profile();
    await db.exec(readFileSync('sql/INSTALAR_CORRECAO_PAGAMENTOS.sql', 'utf8'));
    expect(await profile()).toEqual(before);
    const checks = await db.exec(readFileSync('sql/VERIFICAR_CORRECAO_PAGAMENTOS.sql', 'utf8'));
    const flags = checks.flatMap(check => check.rows.flatMap(row => Object.values(row).filter(value => typeof value === 'boolean')));
    expect(flags.every(Boolean)).toBe(true);
  });
  it('allows a real administrator to suspend and manually release the account without a later retry removing that release', async () => {
    const o = await checkout(); const payment = String(++tick + 16000); await record(o.id, payment);
    const admin = randomUUID(); await rows("insert into profiles(id,role) values($1,'admin')", [admin]);
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await db.exec('set role authenticated');
    try {
      await rows('update profiles set access_blocked=true,is_active=false where id=$1', [user]);
      await rows('update profiles set access_blocked=false,is_active=true,active_until=null where id=$1', [user]);
    } finally { await db.exec('reset role'); }
    await record(o.id, payment);
    expect(await profile()).toEqual({ is_active: true, active_until: null });
  });
  it('rejects direct browser financial writes, RPCs and access to another account orders', async () => {
    const o = await checkout(); await rows("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec('set role authenticated');
    try {
      expect(await rows('select id from payment_orders')).toEqual([{ id: o.id }]);
      await expect(record(o.id)).rejects.toMatchObject({ code: '42501' });
      await expect(rows("update payment_orders set status='approved' where id=$1", [o.id])).rejects.toMatchObject({ code: '42501' });
      await expect(rows('select * from safo_payments.transactions')).rejects.toMatchObject({ code: '42501' });
      await rows("select set_config('request.jwt.claim.sub',$1,false)", [randomUUID()]);
      expect(await rows('select id from payment_orders')).toEqual([]);
    } finally { await db.exec('reset role'); }
  });
});
