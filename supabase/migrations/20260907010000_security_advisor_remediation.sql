-- Resolve Supabase Security Advisor findings without exposing private profile data.
-- Safe to apply repeatedly after the production security baseline.

BEGIN;

-- ---------------------------------------------------------------------------
-- User achievements: only the owner may read or mutate their rows.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_achievements'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.user_achievements',
      policy_record.policyname
    );
  END LOOP;
END $$;

REVOKE ALL ON public.user_achievements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;

CREATE POLICY user_achievements_read_own
  ON public.user_achievements FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_achievements_insert_own
  ON public.user_achievements FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_achievements_update_own
  ON public.user_achievements FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Public profile projection: keep private profiles protected while allowing
-- ranking and nickname screens to read only the intentionally public fields.
-- A dedicated RLS-protected table lets public_profiles use security_invoker.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.public_profile_directory (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  nickname text,
  full_name text NOT NULL DEFAULT 'Usuário',
  avatar text,
  avatar_url text,
  course_id integer
);

ALTER TABLE public.public_profile_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_profile_directory_read ON public.public_profile_directory;
CREATE POLICY public_profile_directory_read
  ON public.public_profile_directory FOR SELECT TO anon, authenticated
  USING (true);

REVOKE ALL ON public.public_profile_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_profile_directory TO anon, authenticated;
GRANT ALL ON public.public_profile_directory TO service_role;

INSERT INTO public.public_profile_directory (id, nickname, full_name, avatar, avatar_url, course_id)
SELECT
  p.id,
  p.nickname,
  COALESCE(p.nickname, 'Usuário'),
  p.avatar::text,
  p.avatar_url,
  p.course_id
FROM public.profiles p
ON CONFLICT (id) DO UPDATE
SET nickname = EXCLUDED.nickname,
    full_name = EXCLUDED.full_name,
    avatar = EXCLUDED.avatar,
    avatar_url = EXCLUDED.avatar_url,
    course_id = EXCLUDED.course_id;

CREATE OR REPLACE FUNCTION public.sync_public_profile_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.public_profile_directory (id, nickname, full_name, avatar, avatar_url, course_id)
  VALUES (
    NEW.id,
    NEW.nickname,
    COALESCE(NEW.nickname, 'Usuário'),
    NEW.avatar::text,
    NEW.avatar_url,
    NEW.course_id
  )
  ON CONFLICT (id) DO UPDATE
  SET nickname = EXCLUDED.nickname,
      full_name = EXCLUDED.full_name,
      avatar = EXCLUDED.avatar,
      avatar_url = EXCLUDED.avatar_url,
      course_id = EXCLUDED.course_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_public_profile_directory() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_public_profile_directory_trigger ON public.profiles;
CREATE TRIGGER sync_public_profile_directory_trigger
  AFTER INSERT OR UPDATE OF nickname, avatar, avatar_url, course_id
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_public_profile_directory();

-- CREATE OR REPLACE cannot change an existing view column from varchar(30)
-- to text. The view stores no data, so recreating it is safe; the grants are
-- restored immediately below in the same transaction.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_barrier = true, security_invoker = true)
AS
SELECT id, nickname, full_name, avatar, avatar_url, course_id
FROM public.public_profile_directory;

REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read-only views must obey the grants and RLS policies of their base tables.
-- ---------------------------------------------------------------------------

ALTER VIEW public.v_course_active_laws SET (security_invoker = true);
ALTER VIEW public.v_ranking SET (security_invoker = true);

COMMIT;
