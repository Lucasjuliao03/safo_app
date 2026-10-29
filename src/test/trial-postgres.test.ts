// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('lifetime quota in real embedded PostgreSQL', () => {
  let db: PGlite;
  let user: string;
  const historicalUser = randomUUID();
  async function sql<T = unknown>(query: string, args: unknown[] = []) { return (await db.query<T>(query, args)).rows; }
  async function consume(type = 'questions', id = 1, requestId = randomUUID(), answer = type === 'questions' ? 'a' : '') {
    const rows = await sql<{ result: Record<string, any> }>(
      'select public.consume_study_use($1,$2,$3,$4,$5) as result', [user, requestId, type, id, answer],
    );
    return rows[0].result;
  }
  async function access() {
    return (await sql<{ result: Record<string, any> }>('select public.get_study_access($1) as result', [user]))[0].result;
  }
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(readFileSync(resolve('src/test/fixtures/trial-schema.sql'), 'utf8'));
    await sql('insert into profiles(id) values ($1)', [historicalUser]);
    await sql('insert into user_daily_productivity values ($1,5,2)', [historicalUser]);
    await db.exec(readFileSync(resolve('supabase/migrations/20261029214747_enforce_lifetime_trial.sql'), 'utf8'));
  }, 30_000);
  beforeEach(async () => {
    user = randomUUID();
    await sql('insert into profiles(id) values ($1)', [user]);
  });
  afterAll(async () => { await db?.close(); });

  it('counts questions and card reveals together and rejects use number eleven', async () => {
    for (let i = 1; i <= 8; i++) expect((await consume('questions', i)).isCorrect).toBe(true);
    expect((await consume('flashcards', 1)).back).toBe('Verso protegido');
    expect((await consume('flashcards', 1)).remaining).toBe(0);
    const blocked = await consume('questions', 20);
    expect(blocked.error).toBe('trial_exhausted');
    expect(blocked).not.toHaveProperty('correctOption');
    expect(await access()).toMatchObject({ used: 10, remaining: 0, entitled: false });
  });
  it('accepts only ten of thirty competing requests', async () => {
    const replies = await Promise.all(Array.from({ length: 30 }, (_, i) => consume('questions', i + 1)));
    expect(replies.filter(r => !r.error)).toHaveLength(10);
    expect(replies.filter(r => r.error === 'trial_exhausted')).toHaveLength(20);
    expect((await access()).used).toBe(10);
  });
  it('retries the same request without charging twice, but cannot change its question or answer', async () => {
    const requestId = randomUUID();
    await consume('questions', 1, requestId);
    expect(await consume('questions', 1, requestId)).toMatchObject({ replayed: true, used: 1 });
    expect((await consume('questions', 2, requestId)).error).toBe('request_conflict');
    expect((await consume('questions', 1, requestId, 'b')).error).toBe('request_conflict');
    expect((await access()).used).toBe(1);
  });
  it('keeps the trial used up after productivity is changed or a new session queries status', async () => {
    for (let i = 0; i < 10; i++) await consume();
    await sql('delete from user_daily_productivity where user_id=$1', [user]);
    expect((await access()).remaining).toBe(0);
    expect((await consume()).error).toBe('trial_exhausted');
  });
  it('allows further questions only after administrator activation, preserving lifetime trial usage', async () => {
    for (let i = 0; i < 10; i++) await consume();
    await sql('update profiles set is_active=true where id=$1', [user]);
    expect(await consume('questions', 30)).toMatchObject({ entitled: true, used: 10, remaining: null });
    await sql('update profiles set is_active=false where id=$1', [user]);
    expect((await consume()).error).toBe('trial_exhausted');
  });
  it('does not let null role/activation fields bypass the trial', async () => {
    await sql('update profiles set role=null,is_active=null where id=$1', [user]);
    for (let i = 0; i < 10; i++) await consume();
    expect((await consume()).error).toBe('trial_exhausted');
  });
  it('rejects an expired account, another course and another edital law without consuming quota', async () => {
    expect((await consume('questions', 41)).error).toBe('content_not_allowed');
    expect((await consume('questions', 42)).error).toBe('content_not_allowed');
    expect((await access()).used).toBe(0);
    await sql("update profiles set active_until=now()-interval '1 day' where id=$1", [user]);
    expect((await consume()).error).toBe('access_expired');
  });
  it('does not trust isCorrect from the browser', async () => {
    expect(await consume('questions', 1, randomUUID(), 'b')).toMatchObject({ isCorrect: false, correctOption: 'a' });
  });
  it('backfills historical trial uses once', async () => {
    const rows = await sql<{ used_count: number }>('select used_count from safo_trial.study_trial_quota where user_id=$1', [historicalUser]);
    expect(rows[0].used_count).toBe(7);
  });
  it('blocks direct browser RPC calls, private quota reads, raw answers and self-activation', async () => {
    await db.exec('set role authenticated');
    try {
      await expect(consume()).rejects.toMatchObject({ code: '42501' });
      await expect(sql('select * from safo_trial.study_trial_quota')).rejects.toMatchObject({ code: '42501' });
      expect(await sql('select correct_option from questions')).toEqual([]);
      await expect(sql('update profiles set is_active=true where id=$1', [user])).rejects.toThrow('Access fields');
      const deleted = await sql('delete from profiles where id=$1 returning id', [user]);
      expect(deleted).toEqual([]);
    } finally { await db.exec('reset role'); }
  });
  it('runs successfully with service_role and cleans trial data when the test profile is deleted', async () => {
    await db.exec('set role service_role');
    try { expect((await consume()).used).toBe(1); }
    finally { await db.exec('reset role'); }
    await sql('delete from profiles where id=$1', [user]);
    expect(await sql('select * from safo_trial.study_trial_events where user_id=$1', [user])).toEqual([]);
  });
});
