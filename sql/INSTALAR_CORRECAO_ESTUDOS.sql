-- SAFO: executar este arquivo inteiro no SQL Editor do Supabase.
-- Instala acesso e persistência de estudo juntos, sem apagar histórico.
-- Use uma única aba. Se o banco estiver ocupado, a instalação aborta sem esperar.
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
    WHERE c.relkind IN ('r','p') AND (
      (n.nspname = 'public' AND c.relname IN (
        'profiles','questions','flashcards','summaries','question_attempts','user_question_stats',
        'user_flashcard_reviews','flashcard_review_logs','user_daily_productivity',
        'user_xp_logs','user_summary_views','user_achievements','daily_missions'
      )) OR (n.nspname = 'safo_trial' AND c.relname IN (
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

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_active_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR (
          p.is_active = true
          AND (p.active_until IS NULL OR p.active_until > now())
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_access() TO authenticated, service_role;


-- Lifetime trial: catalog browsing is free; server corrections/card reveals
-- are limited to 10 combined uses. Only server credentials can call the RPCs.

CREATE SCHEMA IF NOT EXISTS safo_trial;
REVOKE ALL ON SCHEMA safo_trial FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA safo_trial TO service_role;

CREATE TABLE IF NOT EXISTS safo_trial.study_trial_quota (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0)
);
CREATE TABLE IF NOT EXISTS safo_trial.study_trial_events (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('questions', 'flashcards')),
  content_id bigint NOT NULL,
  answer_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE safo_trial.study_trial_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE safo_trial.study_trial_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safo_trial.study_trial_quota, safo_trial.study_trial_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON safo_trial.study_trial_quota, safo_trial.study_trial_events TO service_role;

-- Freeze historical usage once; editing productivity later cannot reset trial.
INSERT INTO safo_trial.study_trial_quota (user_id, used_count)
SELECT p.id, GREATEST(0, COALESCE(SUM(COALESCE(d.questions_answered, 0) + COALESCE(d.flashcards_reviewed, 0)), 0))::integer
FROM public.profiles p LEFT JOIN public.user_daily_productivity d ON d.user_id = p.id
GROUP BY p.id
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION safo_trial.initialize_study_trial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO safo_trial.study_trial_quota (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION safo_trial.initialize_study_trial() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS initialize_study_trial ON public.profiles;
CREATE TRIGGER initialize_study_trial AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION safo_trial.initialize_study_trial();

CREATE OR REPLACE FUNCTION public.get_study_access(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE p public.profiles; used integer; entitled boolean;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  SELECT used_count INTO used FROM safo_trial.study_trial_quota WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'trial_not_initialized'; END IF;
  entitled := COALESCE(p.role, 'student') = 'admin' OR (COALESCE(p.is_active, false) AND (p.active_until IS NULL OR p.active_until > now()));
  RETURN jsonb_build_object('entitled', entitled, 'used', used, 'limit', 10,
    'expired', COALESCE(p.role, 'student') <> 'admin' AND p.active_until IS NOT NULL AND p.active_until <= now(),
    'remaining', CASE WHEN entitled THEN NULL ELSE GREATEST(0, 10 - used) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_study_use(
  p_user_id uuid, p_request_id uuid, p_content_type text, p_content_id bigint, p_answer_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  p public.profiles; used integer; entitled boolean; event safo_trial.study_trial_events;
  target_ids integer[]; law_id bigint; topic bigint; edict bigint;
  correct text; explanation text; back_text text; answer text; replay boolean := false;
BEGIN
  IF p_request_id IS NULL OR p_content_type IS NULL OR p_content_id IS NULL OR p_content_id <= 0
     OR p_content_type NOT IN ('questions', 'flashcards') OR p_answer_key IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_request');
  END IF;
  -- One row lock per account serializes requests from all tabs/devices/functions.
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'profile_not_found'); END IF;
  IF COALESCE(p.role, 'student') <> 'admin' AND p.course_id IS NULL THEN RETURN jsonb_build_object('error', 'course_required'); END IF;
  IF COALESCE(p.role, 'student') <> 'admin' AND p.active_until IS NOT NULL AND p.active_until <= now() THEN
    RETURN jsonb_build_object('error', 'access_expired');
  END IF;
  SELECT used_count INTO used FROM safo_trial.study_trial_quota WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'trial_not_initialized'; END IF;
  entitled := COALESCE(p.role, 'student') = 'admin' OR (COALESCE(p.is_active, false) AND (p.active_until IS NULL OR p.active_until > now()));

  IF p_content_type = 'questions' THEN
    SELECT q.topic_id, q.law_reference_id, lower(q.correct_option), q.explanation
    INTO topic, law_id, correct, explanation FROM public.questions q
    WHERE q.id = p_content_id AND q.is_active AND q.status = 'published';
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'content_not_found'); END IF;
    IF correct IS NULL OR correct NOT IN ('a','b','c','d','e','v','f') THEN
      RETURN jsonb_build_object('error', 'invalid_content');
    END IF;
    answer := lower(p_answer_key);
    IF answer NOT IN ('a','b','c','d','e','v','f') THEN RETURN jsonb_build_object('error', 'invalid_answer'); END IF;
  ELSE
    SELECT f.topic_id, f.law_reference_id, f.back_text INTO topic, law_id, back_text
    FROM public.flashcards f WHERE f.id = p_content_id AND f.is_active AND f.status = 'published';
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'content_not_found'); END IF;
    answer := '';
    IF p_answer_key <> '' THEN RETURN jsonb_build_object('error', 'invalid_answer'); END IF;
  END IF;
  IF COALESCE(p.role, 'student') <> 'admin' THEN
    SELECT t.target_course_ids INTO target_ids FROM public.topics t WHERE t.id = topic;
    IF cardinality(target_ids) > 0 AND NOT (p.course_id = ANY(target_ids)) THEN
      RETURN jsonb_build_object('error', 'content_not_allowed');
    END IF;
    IF p.edital_id IS NOT NULL THEN
      SELECT e.id INTO edict FROM public.edicts e WHERE e.id = p.edital_id AND e.course_id = p.course_id AND e.is_active;
      IF NOT FOUND THEN RETURN jsonb_build_object('error', 'edict_not_allowed'); END IF;
    ELSE
      SELECT e.id INTO edict FROM public.edicts e WHERE e.course_id = p.course_id AND e.is_active
      ORDER BY e.year DESC, e.id DESC LIMIT 1;
    END IF;
    IF law_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.edital_law_references l WHERE l.edital_id = edict)
       AND NOT EXISTS (SELECT 1 FROM public.edital_law_references l WHERE l.edital_id = edict AND l.law_reference_id = law_id) THEN
      RETURN jsonb_build_object('error', 'content_not_allowed');
    END IF;
  END IF;

  SELECT * INTO event FROM safo_trial.study_trial_events WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF event.content_type <> p_content_type OR event.content_id <> p_content_id OR event.answer_key <> answer THEN
      RETURN jsonb_build_object('error', 'request_conflict');
    END IF;
    replay := true;
  ELSE
    IF NOT entitled AND used >= 10 THEN
      RETURN jsonb_build_object('error', 'trial_exhausted', 'used', used, 'remaining', 0, 'limit', 10);
    END IF;
    INSERT INTO safo_trial.study_trial_events (user_id, request_id, content_type, content_id, answer_key)
    VALUES (p_user_id, p_request_id, p_content_type, p_content_id, answer);
    IF NOT entitled THEN
      UPDATE safo_trial.study_trial_quota SET used_count = used_count + 1 WHERE user_id = p_user_id RETURNING used_count INTO used;
    END IF;
  END IF;
  RETURN jsonb_build_object('entitled', entitled, 'used', used, 'limit', 10,
    'remaining', CASE WHEN entitled THEN NULL ELSE GREATEST(0, 10-used) END, 'replayed', replay)
    || CASE WHEN p_content_type = 'questions'
      THEN jsonb_build_object('correctOption', correct, 'explanation', COALESCE(explanation, ''), 'isCorrect', answer = correct)
      ELSE jsonb_build_object('back', back_text) END;
END;
$$;
REVOKE ALL ON FUNCTION public.get_study_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_study_use(uuid,uuid,text,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_study_use(uuid,uuid,text,bigint,text) TO service_role;

-- Restrictive policies add a second gate even when legacy permissive policies exist.
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trial_protect_answers ON public.questions;
CREATE POLICY trial_protect_answers ON public.questions AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.has_active_access());
DROP POLICY IF EXISTS trial_protect_card_answers ON public.flashcards;
CREATE POLICY trial_protect_card_answers ON public.flashcards AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.has_active_access());
REVOKE SELECT ON public.questions, public.flashcards FROM anon;

CREATE OR REPLACE FUNCTION safo_trial.protect_access_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') OR public.is_admin_user() THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.active_until IS DISTINCT FROM OLD.active_until OR NEW.plan_status IS DISTINCT FROM OLD.plan_status
    OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at THEN
    RAISE EXCEPTION 'Access fields may only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION safo_trial.protect_access_fields() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS study_protect_access_fields ON public.profiles;
CREATE TRIGGER study_protect_access_fields BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION safo_trial.protect_access_fields();
DROP POLICY IF EXISTS study_protect_profile_delete ON public.profiles;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY study_protect_profile_delete ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.is_admin_user());

-- Requires 20261029214747_enforce_lifetime_trial.sql. Client writes are replaced
-- by one server-only database transaction; failures also roll back trial usage.

-- Older installations may lack the composite keys used for atomic upserts.
-- Preserve every record: existing duplicate data causes a rollback, not deletion.
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('user_question_stats',ARRAY['user_id','question_id']),
    ('user_flashcard_reviews',ARRAY['user_id','flashcard_id']),
    ('user_daily_productivity',ARRAY['user_id','productivity_date']),
    ('user_summary_views',ARRAY['user_id','summary_id'])
  ) AS keys(table_name,columns) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index idx WHERE idx.indrelid = ('public.' || item.table_name)::regclass
        AND idx.indisunique AND idx.indisvalid AND idx.indpred IS NULL AND idx.indexprs IS NULL
        AND (SELECT array_agg(a.attname::text ORDER BY key.ord)
          FROM unnest(idx.indkey) WITH ORDINALITY AS key(attnum,ord)
          JOIN pg_attribute a ON a.attrelid=idx.indrelid AND a.attnum=key.attnum
          WHERE key.ord <= idx.indnkeyatts) = item.columns
    ) THEN
      EXECUTE format('CREATE UNIQUE INDEX %I ON public.%I (%s)',
        'study_unique_' || item.table_name,item.table_name,array_to_string(item.columns,','));
    END IF;
  END LOOP;
END $$;

ALTER TABLE safo_trial.study_trial_events ADD COLUMN IF NOT EXISTS review_result text;
ALTER TABLE safo_trial.study_trial_events ADD COLUMN IF NOT EXISTS review_feedback jsonb;

CREATE TABLE IF NOT EXISTS safo_trial.summary_read_events (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  summary_id bigint NOT NULL,
  feedback jsonb NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE IF NOT EXISTS safo_trial.achievement_rules (
  id text PRIMARY KEY, metric text NOT NULL, target integer NOT NULL, xp integer NOT NULL
);
ALTER TABLE safo_trial.summary_read_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE safo_trial.achievement_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safo_trial.summary_read_events, safo_trial.achievement_rules FROM PUBLIC, anon, authenticated;
GRANT ALL ON safo_trial.summary_read_events, safo_trial.achievement_rules TO service_role;

INSERT INTO safo_trial.achievement_rules(id,metric,target,xp) VALUES
('first_question', 'questions', 1, 10),
('first_correct', 'correct', 1, 15),
('ten_questions', 'questions', 10, 25),
('fifty_questions', 'questions', 50, 50),
('hundred_questions', 'questions', 100, 100),
('two_hundred_questions', 'questions', 200, 150),
('five_hundred_questions', 'questions', 500, 250),
('thousand_questions', 'questions', 1000, 500),
('streak_3', 'streak', 3, 30),
('streak_7', 'streak', 7, 75),
('streak_14', 'streak', 14, 150),
('streak_30', 'streak', 30, 300),
('streak_60', 'streak', 60, 600),
('streak_100', 'streak', 100, 1000),
('streak_365', 'streak', 365, 3650),
('xp_100', 'xp', 100, 10),
('xp_500', 'xp', 500, 25),
('xp_1000', 'xp', 1000, 50),
('xp_5000', 'xp', 5000, 150),
('xp_10000', 'xp', 10000, 300),
('flashcard_first', 'flashcards', 1, 10),
('flashcard_10', 'flashcards', 10, 25),
('flashcard_50', 'flashcards', 50, 50),
('flashcard_100', 'flashcards', 100, 100),
('flashcard_500', 'flashcards', 500, 200),
('accuracy_10', 'correct', 10, 30),
('accuracy_50', 'correct', 50, 75),
('accuracy_100', 'correct', 100, 150),
('accuracy_500', 'correct', 500, 400),
('first_summary', 'summaries', 1, 15),
('summary_5', 'summaries', 5, 40),
('summary_10', 'summaries', 10, 100),
('rank_soldier', 'xp', 200, 0),
('rank_sergeant', 'xp', 900, 0),
('rank_captain', 'xp', 6500, 0),
('rank_colonel', 'xp', 18000, 0),
('rank_commander', 'xp', 25000, 500)
ON CONFLICT(id) DO UPDATE SET metric=EXCLUDED.metric,target=EXCLUDED.target,xp=EXCLUDED.xp;

CREATE OR REPLACE FUNCTION safo_trial.apply_study_progress(
  p_user_id uuid, p_kind text, p_content_id bigint,
  p_answer text DEFAULT '', p_correct boolean DEFAULT false, p_rating text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  already_studied boolean; consecutive boolean; attempts integer;
  gained integer := CASE p_kind WHEN 'questions' THEN CASE WHEN p_correct THEN 15 ELSE 3 END WHEN 'flashcards' THEN 5 ELSE 0 END;
  interval_days integer; unlocked jsonb := '[]'; rule record; value bigint;
  answered bigint; correct_count bigint; reviewed bigint; total_summaries bigint; xp bigint; streak integer;
BEGIN
  IF p_kind NOT IN ('questions', 'flashcards', 'summaries') THEN RAISE EXCEPTION 'invalid_progress_kind'; END IF;
  -- All callers acquire this same account lock before touching quota or progress.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_daily_productivity WHERE user_id = p_user_id AND productivity_date = day
    AND questions_answered + flashcards_reviewed + summaries_read > 0) INTO already_studied;
  SELECT EXISTS (SELECT 1 FROM public.user_daily_productivity WHERE user_id = p_user_id AND productivity_date = day - 1
    AND questions_answered + flashcards_reviewed + summaries_read > 0) INTO consecutive;

  IF p_kind = 'questions' THEN
    INSERT INTO public.user_question_stats AS stats
      (user_id,question_id,total_attempts,total_correct,total_wrong,first_answered_at,last_answered_at,last_selected_option,last_is_correct)
    VALUES (p_user_id,p_content_id,1,p_correct::integer,(NOT p_correct)::integer,now(),now(),upper(p_answer),p_correct)
    ON CONFLICT (user_id,question_id) DO UPDATE SET
      total_attempts = stats.total_attempts + 1,
      total_correct = stats.total_correct + p_correct::integer,
      total_wrong = stats.total_wrong + (NOT p_correct)::integer,
      last_answered_at = now(), last_selected_option = upper(p_answer), last_is_correct = p_correct
    RETURNING total_attempts INTO attempts;
    INSERT INTO public.question_attempts (user_id,question_id,selected_option,is_correct,attempt_number)
    VALUES (p_user_id,p_content_id,upper(p_answer),p_correct,attempts);
  ELSIF p_kind = 'flashcards' THEN
    IF p_rating IS NULL OR p_rating NOT IN ('wrong','hard','good','easy') THEN RAISE EXCEPTION 'invalid_rating'; END IF;
    interval_days := CASE p_rating WHEN 'wrong' THEN 1 WHEN 'hard' THEN 2 WHEN 'good' THEN 4 ELSE 7 END;
    INSERT INTO public.user_flashcard_reviews AS reviews
      (user_id,flashcard_id,total_reviews,total_correct,total_wrong,current_interval_days,last_review_result,
       last_reviewed_at,next_review_at,memory_stage,is_mastered)
    VALUES (p_user_id,p_content_id,1,(p_rating <> 'wrong')::integer,(p_rating = 'wrong')::integer,interval_days,
      p_rating::public.flashcard_review_enum,now(),now() + make_interval(days => interval_days),
      CASE WHEN p_rating = 'wrong' THEN 1 ELSE 2 END,false)
    ON CONFLICT (user_id,flashcard_id) DO UPDATE SET
      total_reviews = reviews.total_reviews + 1,
      total_correct = reviews.total_correct + (p_rating <> 'wrong')::integer,
      total_wrong = reviews.total_wrong + (p_rating = 'wrong')::integer,
      current_interval_days = interval_days, last_review_result = p_rating::public.flashcard_review_enum,
      last_reviewed_at = now(), next_review_at = now() + make_interval(days => interval_days),
      memory_stage = CASE WHEN p_rating = 'wrong' THEN 1 ELSE LEAST(reviews.memory_stage + 1,10) END,
      is_mastered = p_rating <> 'wrong' AND reviews.memory_stage >= 5, updated_at = now();
    INSERT INTO public.flashcard_review_logs (user_id,flashcard_id,review_result,interval_after)
    VALUES (p_user_id,p_content_id,p_rating::public.flashcard_review_enum,interval_days);
  END IF;

  INSERT INTO public.user_daily_productivity AS productivity
    (user_id,productivity_date,questions_answered,questions_correct,questions_wrong,flashcards_reviewed,summaries_read,xp_earned)
  VALUES (p_user_id,day,(p_kind = 'questions')::integer,(p_kind = 'questions' AND p_correct)::integer,
    (p_kind = 'questions' AND NOT p_correct)::integer,(p_kind = 'flashcards')::integer,(p_kind = 'summaries')::integer,gained)
  ON CONFLICT (user_id,productivity_date) DO UPDATE SET
    questions_answered = productivity.questions_answered + EXCLUDED.questions_answered,
    questions_correct = productivity.questions_correct + EXCLUDED.questions_correct,
    questions_wrong = productivity.questions_wrong + EXCLUDED.questions_wrong,
    flashcards_reviewed = productivity.flashcards_reviewed + EXCLUDED.flashcards_reviewed,
    summaries_read = productivity.summaries_read + EXCLUDED.summaries_read,
    xp_earned = productivity.xp_earned + EXCLUDED.xp_earned, updated_at = now();
  UPDATE public.profiles SET xp_total = xp_total + gained, last_access_at = now(),
    streak_days = CASE WHEN already_studied THEN GREATEST(streak_days,1)
      WHEN consecutive THEN streak_days + 1 ELSE 1 END
  WHERE id = p_user_id RETURNING xp_total,streak_days INTO xp,streak;
  IF gained > 0 THEN
    INSERT INTO public.user_xp_logs(user_id,source_type,source_id,xp_amount,description)
    VALUES(p_user_id,CASE p_kind WHEN 'questions' THEN 'question' ELSE 'flashcard' END,p_content_id,gained,'Atividade de estudo');
  END IF;

  UPDATE public.daily_missions SET
    questions_completed = COALESCE(questions_completed,0) + (p_kind = 'questions')::integer,
    flashcards_completed = COALESCE(flashcards_completed,0) + (p_kind = 'flashcards')::integer,
    summary_completed = COALESCE(summary_completed,0) + (p_kind = 'summaries')::integer,
    status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
    started_at = COALESCE(started_at,now()), updated_at = now()
  WHERE user_id = p_user_id AND mission_date = day AND status <> 'completed';
  UPDATE public.daily_missions SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE user_id = p_user_id AND mission_date = day AND status <> 'completed'
    AND COALESCE(questions_completed,0) >= COALESCE(questions_count,0)
    AND COALESCE(flashcards_completed,0) >= COALESCE(flashcards_count,0)
    AND COALESCE(summary_completed,0) >= COALESCE(summary_count,0);

  SELECT COALESCE(sum(total_attempts),0),COALESCE(sum(total_correct),0) INTO answered,correct_count
  FROM public.user_question_stats WHERE user_id = p_user_id;
  SELECT COALESCE(sum(total_reviews),0) INTO reviewed FROM public.user_flashcard_reviews WHERE user_id = p_user_id;
  SELECT COALESCE(sum(read_count),0) INTO total_summaries FROM public.user_summary_views WHERE user_id = p_user_id;
  FOR rule IN SELECT * FROM safo_trial.achievement_rules ORDER BY target,id LOOP
    value := CASE rule.metric WHEN 'questions' THEN answered WHEN 'correct' THEN correct_count
      WHEN 'flashcards' THEN reviewed WHEN 'streak' THEN streak WHEN 'xp' THEN xp WHEN 'summaries' THEN total_summaries ELSE 0 END;
    IF value >= rule.target AND NOT EXISTS (SELECT 1 FROM public.user_achievements WHERE user_id = p_user_id AND achievement_id = rule.id) THEN
      INSERT INTO public.user_achievements(user_id,achievement_id,unlocked_at,notification_shown) VALUES(p_user_id,rule.id,now(),false);
      unlocked := unlocked || jsonb_build_array(rule.id);
      IF rule.xp > 0 THEN
        UPDATE public.profiles SET xp_total = xp_total + rule.xp WHERE id = p_user_id;
        UPDATE public.user_daily_productivity SET xp_earned = xp_earned + rule.xp WHERE user_id = p_user_id AND productivity_date = day;
        INSERT INTO public.user_xp_logs(user_id,source_type,xp_amount,description) VALUES(p_user_id,'achievement',rule.xp,rule.id);
        xp := xp + rule.xp; gained := gained + rule.xp;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('earnedXp',gained,'unlockedAchievementIds',unlocked);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_study_use(
  p_user_id uuid,p_request_id uuid,p_content_type text,p_content_id bigint,p_answer_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE feedback jsonb;
BEGIN
  feedback := public.consume_study_use(p_user_id,p_request_id,p_content_type,p_content_id,p_answer_key);
  IF feedback ? 'error' OR (feedback->>'replayed')::boolean THEN RETURN feedback; END IF;
  IF p_content_type = 'questions' THEN
    feedback := feedback || safo_trial.apply_study_progress(p_user_id,'questions',p_content_id,p_answer_key,(feedback->>'isCorrect')::boolean);
  END IF;
  RETURN feedback;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_study_review(p_user_id uuid,p_request_id uuid,p_flashcard_id bigint,p_rating text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE event safo_trial.study_trial_events; feedback jsonb;
BEGIN
  IF p_rating IS NULL OR p_rating NOT IN ('wrong','hard','good','easy') THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','profile_not_found'); END IF;
  SELECT * INTO event FROM safo_trial.study_trial_events WHERE user_id = p_user_id AND request_id = p_request_id;
  IF NOT FOUND OR event.content_type <> 'flashcards' OR event.content_id <> p_flashcard_id THEN
    RETURN jsonb_build_object('error','reveal_required');
  END IF;
  IF event.review_result IS NOT NULL THEN
    IF event.review_result <> p_rating THEN RETURN jsonb_build_object('error','request_conflict'); END IF;
    RETURN event.review_feedback || jsonb_build_object('replayed',true);
  END IF;
  feedback := public.get_study_access(p_user_id) || safo_trial.apply_study_progress(p_user_id,'flashcards',p_flashcard_id,'',false,p_rating)
    || jsonb_build_object('replayed',false);
  UPDATE safo_trial.study_trial_events SET review_result = p_rating,review_feedback = feedback
  WHERE user_id = p_user_id AND request_id = p_request_id;
  RETURN feedback;
END;
$$;

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

-- Legacy before-insert guards may rely on auth.uid() from browser requests.
-- Their checks are now inside consume_study_use, in the same server transaction.
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT t.tgname,c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
      AND c.relname IN ('question_attempts','user_question_stats','user_flashcard_reviews','flashcard_review_logs','user_daily_productivity')
      AND pg_get_functiondef(t.tgfoid) LIKE '%assert_study_access%'
  LOOP EXECUTE format('DROP TRIGGER %I ON public.%I',item.tgname,item.relname); END LOOP;
END $$;

REVOKE ALL ON FUNCTION safo_trial.apply_study_progress(uuid,text,bigint,text,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_study_use(uuid,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_study_review(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_summary_read(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION safo_trial.apply_study_progress(uuid,text,bigint,text,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_study_use(uuid,uuid,text,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_study_review(uuid,uuid,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_summary_read(uuid,uuid,bigint) TO service_role;

REVOKE INSERT,UPDATE,DELETE ON public.question_attempts,public.user_question_stats,
  public.user_flashcard_reviews,public.flashcard_review_logs,public.user_daily_productivity,
  public.user_xp_logs,public.user_summary_views,public.user_achievements FROM PUBLIC,anon,authenticated;
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['question_attempts','user_question_stats','user_flashcard_reviews','flashcard_review_logs',
    'user_daily_productivity','user_xp_logs','user_summary_views','user_achievements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('DROP POLICY IF EXISTS study_read_own ON public.%I',item);
    EXECUTE format('CREATE POLICY study_read_own ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)',item);
  END LOOP;
END $$;
GRANT SELECT ON public.question_attempts,public.user_question_stats,public.user_flashcard_reviews,
  public.flashcard_review_logs,public.user_daily_productivity,public.user_xp_logs,public.user_summary_views,public.user_achievements TO authenticated;
GRANT ALL ON public.question_attempts,public.user_question_stats,public.user_flashcard_reviews,
  public.flashcard_review_logs,public.user_daily_productivity,public.user_xp_logs,public.user_summary_views,public.user_achievements,public.daily_missions,public.profiles TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
DO $$ BEGIN
  IF to_regprocedure('public.increment_xp(uuid,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.increment_xp(uuid,integer) FROM PUBLIC,anon,authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION safo_trial.protect_study_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') OR public.is_admin_user() THEN RETURN NEW; END IF;
  IF NEW.xp_total IS DISTINCT FROM OLD.xp_total OR NEW.streak_days IS DISTINCT FROM OLD.streak_days
    OR NEW.level_number IS DISTINCT FROM OLD.level_number THEN RAISE EXCEPTION 'Study progress is managed by the server'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION safo_trial.protect_study_fields() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS study_protect_progress ON public.profiles;
CREATE TRIGGER study_protect_progress BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION safo_trial.protect_study_fields();
NOTIFY pgrst,'reload schema';

COMMIT;
