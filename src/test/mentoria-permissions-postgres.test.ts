// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';

describe('mentoring curriculum policy permissions', () => {
  let db: PGlite;
  const user = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const rows = async (sql: string, args: unknown[] = []) => (await db.query<Record<string, any>>(sql, args)).rows;
  const sql = (path: string) => readFileSync(path, 'utf8');
  async function asStudent<T>(run: () => Promise<T>) {
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec('set role authenticated');
    try { return await run(); } finally { await db.exec('reset role'); }
  }
  const joinedTasks = () => rows('select t.title,s.name from mentoria_tarefas_diarias t left join subjects s on s.id=t.subject_id order by t.title');
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(sql('src/test/fixtures/trial-schema.sql'));
    await db.exec(sql('src/test/fixtures/study-progress-schema.sql'));
    await db.exec(`
      CREATE TABLE subjects(id bigint PRIMARY KEY,name text);
      INSERT INTO subjects VALUES(1,'Direito'),(2,'Outro curso');
      CREATE FUNCTION public.can_access_study_content(p_edict_id bigint,p_subject_id bigint)
        RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND course_id=p_subject_id)
        $$;
      CREATE FUNCTION public.can_access_subject(p_subject_id bigint) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
        SELECT public.can_access_study_content(NULL,p_subject_id)
        $$;
      CREATE FUNCTION public.can_access_subject(text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$SELECT 'private'$$;
      ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
      CREATE POLICY subjects_scope ON subjects FOR SELECT TO authenticated USING(public.can_access_subject(id));
      CREATE TABLE mentoria_tarefas_diarias(id integer PRIMARY KEY,user_id uuid,subject_id bigint REFERENCES subjects,title text);
      ALTER TABLE mentoria_tarefas_diarias ENABLE ROW LEVEL SECURITY;
      CREATE POLICY task_owner ON mentoria_tarefas_diarias FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
      GRANT SELECT ON subjects,mentoria_tarefas_diarias TO authenticated;
    `);
    await db.exec(sql('sql/INSTALAR_CORRECAO_ESTUDOS.sql'));
    await rows('insert into profiles(id,course_id) values($1,1),($2,2)', [user, other]);
    await rows("insert into mentoria_tarefas_diarias values(1,$1,1,'Minha tarefa'),(2,$2,2,'Tarefa de outro aluno')", [user, other]);
  }, 30_000);
  beforeEach(async () => {
    await rows('update profiles set is_active=false,active_until=null where id=$1', [user]);
    await rows('update safo_trial.study_trial_quota set used_count=0 where user_id=$1', [user]);
    await db.exec('REVOKE ALL ON FUNCTION public.can_access_subject(bigint),public.can_access_study_content(bigint,bigint) FROM PUBLIC,anon,authenticated');
  });
  afterAll(async () => { await db?.close(); });
  it('reproduces 42501 only on the subject join and restores it without recreating the plan or changing function bodies', async () => {
    const before = await rows("select pg_get_functiondef('public.can_access_subject(bigint)'::regprocedure) as body");
    expect(await asStudent(() => rows('select title from mentoria_tarefas_diarias'))).toEqual([{ title: 'Minha tarefa' }]);
    await expect(asStudent(joinedTasks)).rejects.toMatchObject({ code: '42501' });
    await db.exec(sql('sql/CORRIGIR_ACESSO_MENTORIA.sql'));
    expect(await asStudent(joinedTasks)).toEqual([{ title: 'Minha tarefa', name: 'Direito' }]);
    expect(await rows("select pg_get_functiondef('public.can_access_subject(bigint)'::regprocedure) as body")).toEqual(before);
    expect((await rows('select count(*)::int as count from mentoria_tarefas_diarias'))[0].count).toBe(2);
  });
  it('preserves the lifetime cap, expiration, paid access and student isolation after restoring helper execution', async () => {
    await db.exec(sql('sql/CORRIGIR_ACESSO_MENTORIA.sql'));
    await rows('update safo_trial.study_trial_quota set used_count=10 where user_id=$1', [user]);
    expect(await asStudent(joinedTasks)).toEqual([]);
    await rows('update profiles set is_active=true where id=$1', [user]);
    expect(await asStudent(joinedTasks)).toEqual([{ title: 'Minha tarefa', name: 'Direito' }]);
    await rows("update profiles set active_until=now()-interval '1 day' where id=$1", [user]);
    expect(await asStudent(joinedTasks)).toEqual([]);
  });
  it('keeps anonymous callers and non-boolean overloads restricted, including when the combined installer is rerun', async () => {
    await db.exec(sql('sql/INSTALAR_CORRECAO_ESTUDOS.sql'));
    expect(await asStudent(joinedTasks)).toEqual([{ title: 'Minha tarefa', name: 'Direito' }]);
    expect((await rows(`select
      has_function_privilege('authenticated','public.can_access_subject(bigint)','EXECUTE') as helper,
      has_function_privilege('anon','public.can_access_subject(bigint)','EXECUTE') as anonymous,
      has_function_privilege('authenticated','public.can_access_subject(text)','EXECUTE') as unsafe`))[0])
      .toEqual({ helper: true, anonymous: false, unsafe: false });
  });
});
