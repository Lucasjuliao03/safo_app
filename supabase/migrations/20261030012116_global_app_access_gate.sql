BEGIN;
-- BEGIN STUDY INSTALL LOCK GUARD
-- Claim the strongest required locks before any reads or schema changes.
-- NOWAIT aborts cleanly if live traffic already owns an incompatible lock;
-- it does not queue behind that traffic while holding other table locks.
SET LOCAL lock_timeout = '2s';
DO $study_install_lock$
DECLARE target regclass;
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(208740901, 1) THEN
    RAISE EXCEPTION USING ERRCODE = '55P03',
      MESSAGE = 'Outra instalação de estudos já está em execução.',
      HINT = 'Aguarde a outra execução terminar e rode o arquivo inteiro novamente em uma única aba.';
  END IF;

  FOR target IN
    SELECT c.oid::regclass FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p','v') AND (
      (n.nspname = 'public' AND (c.relkind = 'v' OR c.relname IN (
        'profiles','questions','flashcards','summaries','question_attempts','user_question_stats',
        'user_flashcard_reviews','flashcard_review_logs','user_daily_productivity',
        'user_xp_logs','user_summary_views','user_achievements','daily_missions',
        'subjects','topics','subtopics','law_references','edicts','edict_subjects',
        'edital_law_references','exam_boards','ranking_global','ranking_history',
        'public_profile_directory','weekly_challenges','challenge_participants'
      ) OR c.relname LIKE 'mentoria\_%' ESCAPE '\'
        OR c.relname LIKE 'patrulhamento\_%' ESCAPE '\')) OR (n.nspname = 'safo_trial' AND c.relname IN (
        'study_trial_quota','study_trial_events','summary_read_events','achievement_rules'
      ))
    )
    ORDER BY n.nspname,c.relname
  LOOP
    BEGIN
      EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE NOWAIT',target);
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION USING ERRCODE = '55P03',
        MESSAGE = format('Instalação adiada: a tabela %s está em uso. Nenhuma alteração desta instalação foi aplicada.',target),
        HINT = 'Feche as abas do app e outras consultas SQL, aguarde alguns segundos e execute o arquivo inteiro novamente em uma única aba.';
    END;
  END LOOP;
END;
$study_install_lock$;
-- END STUDY INSTALL LOCK GUARD


-- This helper reveals only a boolean for the authenticated caller. The quota
-- tables stay private; profile roles/payment state are read from the database.
CREATE OR REPLACE FUNCTION safo_trial.can_use_app()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT
    p.role = 'admin' OR (
      (p.active_until IS NULL OR p.active_until > now())
      AND (COALESCE(p.is_active,false) OR COALESCE(q.used_count < 10,false))
    )
    FROM public.profiles p LEFT JOIN safo_trial.study_trial_quota q ON q.user_id = p.id
    WHERE p.id = (SELECT auth.uid()) AND (SELECT auth.uid()) IS NOT NULL),false);
$$;
REVOKE ALL ON FUNCTION safo_trial.can_use_app() FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA safo_trial TO authenticated;
GRANT EXECUTE ON FUNCTION safo_trial.can_use_app() TO authenticated,service_role;

-- Keep only the caller's profile available after the gate. Prevent recreating
-- a profile with elevated access, even if a legacy INSERT policy is permissive.
REVOKE INSERT ON public.profiles FROM anon,authenticated;
REVOKE SELECT ON public.profiles FROM anon;
DROP POLICY IF EXISTS app_profile_owner ON public.profiles;
CREATE POLICY app_profile_owner ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_admin_user()))
  WITH CHECK (id = (SELECT auth.uid()) OR (SELECT public.is_admin_user()));

-- AND this gate with existing ownership/course policies. Never add a broad
-- permissive policy: existing student/admin authorizations still apply.
DO $app_gate$
DECLARE item record;
BEGIN
  FOR item IN SELECT c.oid,c.relname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND (
      c.relname IN ('questions','flashcards','summaries','subjects','topics','subtopics',
        'law_references','edicts','edict_subjects','edital_law_references','exam_boards',
        'ranking_global','ranking_history','public_profile_directory','weekly_challenges',
        'challenge_participants','daily_missions','user_question_stats','question_attempts',
        'user_flashcard_reviews','flashcard_review_logs','user_daily_productivity',
        'user_xp_logs','user_summary_views','user_achievements')
      OR c.relname LIKE 'mentoria\_%' ESCAPE '\' OR c.relname LIKE 'patrulhamento\_%' ESCAPE '\')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.relname);
    EXECUTE format('DROP POLICY IF EXISTS app_access_required ON public.%I',item.relname);
    EXECUTE format('CREATE POLICY app_access_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT safo_trial.can_use_app())) WITH CHECK ((SELECT safo_trial.can_use_app()))',item.relname);
    EXECUTE format('DROP POLICY IF EXISTS app_access_no_anonymous ON public.%I',item.relname);
    EXECUTE format('CREATE POLICY app_access_no_anonymous ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)',item.relname);
  END LOOP;

  -- Views otherwise execute with their owner's permissions and bypass RLS.
  -- Include transitively dependent views, including public_profiles.
  FOR item IN WITH RECURSIVE protected(oid) AS (
    SELECT polrelid FROM pg_catalog.pg_policy WHERE polname = 'app_access_required'
    UNION
    SELECT r.ev_class FROM protected p JOIN pg_catalog.pg_depend d ON d.refobjid = p.oid
      AND d.classid = 'pg_catalog.pg_rewrite'::regclass
      JOIN pg_catalog.pg_rewrite r ON r.oid = d.objid WHERE r.ev_class <> p.oid
  ) SELECT DISTINCT c.relname,c.relkind FROM protected p
    JOIN pg_catalog.pg_class c ON c.oid = p.oid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
  LOOP
    IF item.relkind = 'v' THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)',item.relname);
    ELSE
      -- Materialized views cannot enforce row-level policies on cached rows.
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',item.relname);
    END IF;
  END LOOP;

  -- Retired elevated study/mentoring/ranking RPCs must not bypass table RLS.
  -- Only identity helpers and the owner-checked payment lookup remain callable.
  FOR item IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND (
      (p.prosecdef AND p.proname NOT IN ('is_admin_user','has_active_access','get_active_order_for_user')
        AND NOT (p.proname IN ('can_access_subject','can_access_study_content') AND p.prorettype='pg_catalog.bool'::regtype))
      OR p.proname IN ('get_study_questions','get_study_flashcards','get_study_summaries'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',item.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',item.signature);
  END LOOP;
END;
$app_gate$;

CREATE OR REPLACE FUNCTION public.record_summary_read(p_user_id uuid,p_request_id uuid,p_summary_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  p public.profiles; event safo_trial.summary_read_events; summary public.summaries;
  target_ids integer[]; edict bigint; distinct_reads integer; reads integer; feedback jsonb;
BEGIN
  IF p_request_id IS NULL OR p_summary_id IS NULL OR p_summary_id <= 0 THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','profile_not_found'); END IF;
  SELECT * INTO event FROM safo_trial.summary_read_events WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF event.summary_id <> p_summary_id THEN RETURN jsonb_build_object('error','request_conflict'); END IF;
    RETURN event.feedback || jsonb_build_object('replayed',true);
  END IF;
  IF COALESCE(p.role,'student') <> 'admin' AND p.active_until IS NOT NULL AND p.active_until <= now() THEN
    RETURN jsonb_build_object('error','access_expired');
  END IF;
  IF COALESCE(p.role,'student') <> 'admin' AND NOT COALESCE(p.is_active,false)
    AND NOT EXISTS(SELECT 1 FROM safo_trial.study_trial_quota WHERE user_id = p_user_id AND used_count < 10) THEN
    RETURN jsonb_build_object('error','trial_exhausted','used',10,'limit',10,'remaining',0,'entitled',false);
  END IF;
  SELECT * INTO summary FROM public.summaries WHERE id = p_summary_id AND is_active AND status = 'published';
  IF NOT FOUND THEN RETURN jsonb_build_object('error','content_not_found'); END IF;
  IF COALESCE(p.role,'student') <> 'admin' THEN
    IF p.course_id IS NULL THEN RETURN jsonb_build_object('error','course_required'); END IF;
    SELECT t.target_course_ids INTO target_ids FROM public.topics t WHERE t.id = summary.topic_id;
    IF cardinality(target_ids) > 0 AND NOT (p.course_id = ANY(target_ids)) THEN RETURN jsonb_build_object('error','content_not_allowed'); END IF;
    SELECT e.id INTO edict FROM public.edicts e WHERE e.course_id = p.course_id AND e.is_active
      AND (p.edital_id IS NULL OR e.id = p.edital_id) ORDER BY e.year DESC,e.id DESC LIMIT 1;
    IF p.edital_id IS NOT NULL AND edict IS NULL THEN RETURN jsonb_build_object('error','edict_not_allowed'); END IF;
    IF summary.law_reference_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.edital_law_references WHERE edital_id = edict)
      AND NOT EXISTS(SELECT 1 FROM public.edital_law_references WHERE edital_id = edict AND law_reference_id = summary.law_reference_id) THEN
      RETURN jsonb_build_object('error','content_not_allowed');
    END IF;
  END IF;
  IF COALESCE(p.role,'student') <> 'admin' AND NOT COALESCE(p.is_active,false) THEN
    SELECT count(DISTINCT summary_id) INTO distinct_reads FROM public.user_summary_views WHERE user_id = p_user_id;
    IF distinct_reads >= 2 AND NOT EXISTS(SELECT 1 FROM public.user_summary_views WHERE user_id = p_user_id AND summary_id = p_summary_id) THEN
      RETURN jsonb_build_object('error','summary_limit');
    END IF;
  END IF;
  INSERT INTO public.user_summary_views AS views(user_id,summary_id,viewed_date,read_count)
  VALUES(p_user_id,p_summary_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,1)
  ON CONFLICT(user_id,summary_id) DO UPDATE SET read_count = views.read_count + 1,viewed_date = EXCLUDED.viewed_date
  RETURNING read_count INTO reads;
  feedback := safo_trial.apply_study_progress(p_user_id,'summaries',p_summary_id)
    || jsonb_build_object('replayed',false,'readCount',reads);
  INSERT INTO safo_trial.summary_read_events VALUES(p_user_id,p_request_id,p_summary_id,feedback);
  RETURN feedback;
END;
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
