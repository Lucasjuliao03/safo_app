-- Lifetime trial: catalog browsing is free; server corrections/card reveals
-- are limited to 10 combined uses. Only server credentials can call the RPCs.
BEGIN;
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
COMMIT;
