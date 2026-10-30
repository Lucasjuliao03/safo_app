// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('atomic study persistence in PostgreSQL', () => {
  let db: PGlite;
  let user: string;
  const read = (file: string) => readFileSync(resolve(file), 'utf8');
  const rows = async <T = Record<string, any>>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows;
  const result = async (sql: string, args: unknown[]) => (await rows(sql, args))[0].result;
  const access = () => result('select public.get_study_access($1) as result', [user]);
  const answer = (id = 1, request = randomUUID(), option = 'a') => result('select public.complete_study_use($1,$2,$3,$4,$5) as result', [user, request, 'questions', id, option]);
  const reveal = (request: string) => result('select public.complete_study_use($1,$2,$3,$4,$5) as result', [user, request, 'flashcards', 1, '']);
  const review = (request: string, rating = 'good') => result('select public.record_study_review($1,$2,$3,$4) as result', [user, request, 1, rating]);
  const summary = (id: number, request = randomUUID()) => result('select public.record_summary_read($1,$2,$3) as result', [user, request, id]);
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(read('src/test/fixtures/trial-schema.sql'));
    await db.exec(read('src/test/fixtures/study-progress-schema.sql'));
    await db.exec('alter table user_flashcard_reviews drop constraint user_flashcard_reviews_pkey');
    // Test the exact single file the user will paste, not a hand-built approximation.
    await db.exec(read('sql/INSTALAR_CORRECAO_ESTUDOS.sql'));
  }, 30000);
  beforeEach(async () => {
    user = randomUUID();
    await rows('insert into profiles(id) values($1)', [user]);
  });
  afterAll(async () => { await db?.close(); });

  it('commits quota, attempt, statistics, XP, streak, mission and achievements together', async () => {
    await rows("insert into daily_missions(user_id,mission_date,questions_count) values($1,(now() AT TIME ZONE 'America/Sao_Paulo')::date,1)", [user]);
    const feedback = await answer();
    expect(feedback).toMatchObject({ used: 1, isCorrect: true, replayed: false });
    expect(feedback.unlockedAchievementIds).toContain('first_question');
    expect(feedback.unlockedAchievementIds).toContain('first_correct');
    expect(await rows('select total_attempts,total_correct from user_question_stats where user_id=$1',[user])).toEqual([{ total_attempts: 1, total_correct: 1 }]);
    expect(await rows('select attempt_number,is_correct from question_attempts where user_id=$1',[user])).toEqual([{ attempt_number: 1, is_correct: true }]);
    expect((await rows('select questions_answered,questions_correct,xp_earned from user_daily_productivity where user_id=$1',[user]))[0]).toMatchObject({ questions_answered:1, questions_correct:1, xp_earned:feedback.earnedXp });
    expect((await rows('select xp_total,streak_days from profiles where id=$1',[user]))[0]).toEqual({ xp_total:feedback.earnedXp,streak_days:1 });
    expect((await rows('select status from daily_missions where user_id=$1',[user]))[0].status).toBe('completed');
  });
  it('does not reward first_correct for an incorrect answer', async () => {
    const feedback = await answer(1,randomUUID(),'b');
    expect(feedback.isCorrect).toBe(false);
    expect(feedback.unlockedAchievementIds).not.toContain('first_correct');
  });
  it('rolls back the trial charge and every partial write if saving an attempt fails', async () => {
    await db.exec('alter table question_attempts add constraint simulated_failure check(question_id<>39)');
    try { await expect(answer(39)).rejects.toThrow(); }
    finally { await db.exec('alter table question_attempts drop constraint simulated_failure'); }
    expect((await access()).used).toBe(0);
    expect(await rows('select * from user_question_stats where user_id=$1',[user])).toEqual([]);
    expect(await rows('select * from safo_trial.study_trial_events where user_id=$1',[user])).toEqual([]);
    expect((await rows('select xp_total from profiles where id=$1',[user]))[0].xp_total).toBe(0);
  });
  it('does not duplicate attempts, quota, XP or rewards on a network retry', async () => {
    const request = randomUUID();
    const first = await answer(1,request);
    expect((await answer(1,request)).replayed).toBe(true);
    expect((await access()).used).toBe(1);
    expect((await rows('select count(*)::integer as count from question_attempts where user_id=$1',[user]))[0].count).toBe(1);
    expect((await rows('select xp_total from profiles where id=$1',[user]))[0].xp_total).toBe(first.earnedXp);
    expect((await answer(2,request)).error).toBe('request_conflict');
  });
  it('persists only ten of thirty competing answers', async () => {
    const feedback = await Promise.all(Array.from({length:30},(_,index)=>answer(index+1)));
    expect(feedback.filter(item=>!item.error)).toHaveLength(10);
    expect((await rows('select count(*)::integer as count from question_attempts where user_id=$1',[user]))[0].count).toBe(10);
    expect((await access()).used).toBe(10);
  });
  it('saves the tenth flashcard review after its reveal used the last trial use', async () => {
    for(let i=0;i<9;i++) await answer();
    const request = randomUUID();
    expect((await reveal(request)).remaining).toBe(0);
    expect(await review(request)).toMatchObject({ used:10,remaining:0,replayed:false });
    expect((await review(request)).replayed).toBe(true);
    expect((await review(request,'wrong')).error).toBe('request_conflict');
    expect((await rows('select total_reviews from user_flashcard_reviews where user_id=$1',[user]))[0].total_reviews).toBe(1);
    expect((await rows('select flashcards_reviewed from user_daily_productivity where user_id=$1',[user]))[0].flashcards_reviewed).toBe(1);
  });
  it('rejects a review without an authorized reveal and another account cannot reuse it', async () => {
    const request = randomUUID();
    expect((await review(request)).error).toBe('reveal_required');
    await reveal(request);
    user = randomUUID(); await rows('insert into profiles(id) values($1)',[user]);
    expect((await review(request)).error).toBe('reveal_required');
  });
  it('limits summaries separately and records rereads without duplication on retries', async () => {
    for(let i=0;i<10;i++) await answer();
    const request = randomUUID();
    expect(await summary(1,request)).toMatchObject({ readCount:1,replayed:false });
    expect((await summary(1,request)).replayed).toBe(true);
    expect((await summary(2)).readCount).toBe(1);
    expect((await summary(3)).error).toBe('summary_limit');
    expect((await summary(1)).readCount).toBe(2);
    expect((await summary(4)).error).toBe('content_not_allowed');
    expect((await access()).used).toBe(10);
  });
  it('permits the server role and rejects direct browser writes', async () => {
    await db.exec('set role service_role');
    try { expect((await answer()).used).toBe(1); } finally { await db.exec('reset role'); }
    await db.exec('set role authenticated');
    try {
      await expect(answer()).rejects.toMatchObject({ code:'42501' });
      await expect(rows('insert into question_attempts(user_id,question_id,selected_option,is_correct) values($1,1,\'a\',true)',[user])).rejects.toMatchObject({ code:'42501' });
    } finally { await db.exec('reset role'); }
  });
  it('can be rerun without resetting consumed trial quota or study history', async () => {
    await answer();
    await db.exec(read('sql/INSTALAR_CORRECAO_ESTUDOS.sql'));
    expect((await access()).used).toBe(1);
    expect((await rows('select count(*)::integer as count from question_attempts where user_id=$1',[user]))[0].count).toBe(1);
    const checks = await db.exec(read('sql/VERIFICAR_CORRECAO_ESTUDOS.sql'));
    const flags = checks.flatMap(check => check.rows.flatMap(row => Object.values(row).filter(value => typeof value === 'boolean')));
    expect(flags.length).toBeGreaterThan(10);
    expect(flags.every(Boolean)).toBe(true);
  });
  it.each(['installer', 'table'])('aborts before changing history when the %s preflight lock is unavailable', async kind => {
    await answer();
    const installer = read('sql/INSTALAR_CORRECAO_ESTUDOS.sql');
    // PGlite has one backend. Inject a refused lock at the PostgreSQL boundary
    // to exercise the failure/rollback path without claiming multi-session coverage.
    const refused = kind === 'installer'
      ? installer.replace('pg_catalog.pg_try_advisory_xact_lock(208740901, 1)', 'false')
      : installer.replace("EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE NOWAIT',target);", 'RAISE lock_not_available;');
    expect(refused).not.toBe(installer);
    await expect(db.exec(refused)).rejects.toMatchObject({ code: '55P03' });
    await db.exec('ROLLBACK');
    expect((await access()).used).toBe(1);
    expect((await rows('select count(*)::integer as count from question_attempts where user_id=$1',[user]))[0].count).toBe(1);
    // A new complete attempt still succeeds after the aborted preflight.
    await db.exec(installer);
    expect((await access()).used).toBe(1);
  });
});
