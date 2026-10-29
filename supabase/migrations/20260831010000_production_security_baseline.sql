-- Production security baseline for SAFO.
-- Apply with Supabase CLI after testing in a staging project.

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared authorization helpers
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Profiles: private by default; only a safe projection is public.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', policy_record.policyname);
  END LOOP;
END $$;

CREATE POLICY profiles_read_own
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_all
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- SQL migrations and the service role must be able to manage subscriptions.
  IF auth.uid() IS NULL OR auth.role() = 'service_role' OR public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.active_until IS DISTINCT FROM OLD.active_until THEN
    RAISE EXCEPTION 'privileged profile fields cannot be changed directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_privileged_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

REVOKE ALL ON FUNCTION public.protect_profile_privileged_fields() FROM PUBLIC, anon, authenticated;

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
SELECT id, nickname, COALESCE(nickname, 'Usuário'), avatar::text, avatar_url, course_id
FROM public.profiles
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
  VALUES (NEW.id, NEW.nickname, COALESCE(NEW.nickname, 'Usuário'), NEW.avatar::text, NEW.avatar_url, NEW.course_id)
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

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_barrier = true, security_invoker = true)
AS
SELECT id, nickname, full_name, avatar, avatar_url, course_id
FROM public.public_profile_directory;

REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Commercial content: clients cannot query answer/content tables directly.
-- Students receive content through authenticated backend endpoints; admins keep
-- direct CRUD access for the existing dashboard.
-- ---------------------------------------------------------------------------

DO $$
DECLARE table_name text;
DECLARE policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['questions', 'flashcards', 'summaries']
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOR policy_record IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, table_name);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user())',
      table_name || '_admin_all',
      table_name
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Gamification RPCs: never accept anonymous cross-user mutations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_xp(user_id_arg uuid, xp_arg integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> user_id_arg THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF xp_arg < 0 OR xp_arg > 5000 THEN
    RAISE EXCEPTION 'invalid xp value';
  END IF;

  UPDATE public.profiles
  SET xp_total = COALESCE(xp_total, 0) + xp_arg
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_xp(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_xp(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_today_mission(p_user_id uuid)
RETURNS SETOF public.daily_missions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.daily_missions (user_id, mission_date, status)
  VALUES (auth.uid(), CURRENT_DATE, 'pending')
  ON CONFLICT (user_id, mission_date) DO NOTHING;

  RETURN QUERY
  SELECT * FROM public.daily_missions
  WHERE user_id = auth.uid() AND mission_date = CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_mission(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.daily_missions
  SET status = 'in_progress', started_at = now(), updated_at = now()
  WHERE user_id = auth.uid() AND mission_date = CURRENT_DATE AND status = 'pending';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_mission(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.daily_missions
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE user_id = auth.uid()
    AND mission_date = CURRENT_DATE
    AND status IN ('pending', 'in_progress');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_mission_progress(
  p_user_id uuid,
  p_step varchar,
  p_completed integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_completed < 0 OR p_step NOT IN ('questions', 'flashcards', 'summary') THEN
    RAISE EXCEPTION 'invalid mission progress';
  END IF;

  UPDATE public.daily_missions
  SET questions_completed = CASE WHEN p_step = 'questions' THEN p_completed ELSE questions_completed END,
      flashcards_completed = CASE WHEN p_step = 'flashcards' THEN p_completed ELSE flashcards_completed END,
      summary_completed = CASE WHEN p_step = 'summary' THEN p_completed ELSE summary_completed END,
      updated_at = now()
  WHERE user_id = auth.uid() AND mission_date = CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_mission_complete(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE mission public.daily_missions;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO mission FROM public.daily_missions
  WHERE user_id = auth.uid() AND mission_date = CURRENT_DATE;
  RETURN mission IS NOT NULL
    AND mission.questions_completed >= mission.questions_count
    AND mission.flashcards_completed >= mission.flashcards_count
    AND mission.summary_completed >= mission.summary_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_today_mission(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_mission(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_mission(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_mission_progress(uuid, varchar, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_mission_complete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_today_mission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_mission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_mission_progress(uuid, varchar, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_mission_complete(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Payments: constraints, idempotency and backend-only state transitions.
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_periods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_positive_price') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_positive_price CHECK (price_cents > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_positive_duration') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_positive_duration CHECK (duration_days > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_orders_valid_status') THEN
    ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_valid_status
      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back', 'expired'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_mp_payment_unique
  ON public.payment_orders (mp_payment_id)
  WHERE mp_payment_id IS NOT NULL AND mp_payment_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS user_access_periods_order_unique
  ON public.user_access_periods (order_id);
CREATE INDEX IF NOT EXISTS payment_orders_user_plan_status_created_idx
  ON public.payment_orders (user_id, plan_id, status, created_at DESC);

DO $$
DECLARE table_name text;
DECLARE policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['plans', 'payment_orders', 'user_access_periods']
  LOOP
    FOR policy_record IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, table_name);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY plans_public_read ON public.plans FOR SELECT
    USING (is_active = true);
CREATE POLICY plans_admin_all ON public.plans FOR ALL TO authenticated
  USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY orders_read_own ON public.payment_orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_user());
CREATE POLICY access_periods_read_own ON public.user_access_periods FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_user());

CREATE OR REPLACE FUNCTION public.apply_payment_approval(
  p_order_id uuid,
  p_mp_payment text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  payment_order record;
  current_end timestamptz;
  new_end timestamptz;
BEGIN
  SELECT po.id, po.user_id, po.plan_id, po.status, po.mp_payment_id, p.duration_days
  INTO payment_order
  FROM public.payment_orders po
  JOIN public.plans p ON p.id = po.plan_id
  WHERE po.id = p_order_id
  FOR UPDATE OF po;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment order not found';
  END IF;
  IF payment_order.status = 'approved' AND payment_order.mp_payment_id = p_mp_payment THEN
    RETURN;
  END IF;
  IF payment_order.status <> 'pending' THEN
    RAISE EXCEPTION 'payment order is not pending';
  END IF;

  SELECT MAX(ends_at) INTO current_end
  FROM public.user_access_periods
  WHERE user_id = payment_order.user_id AND status = 'active' AND ends_at > now();

  new_end := COALESCE(current_end, now()) + make_interval(days => payment_order.duration_days);

  INSERT INTO public.user_access_periods
    (user_id, order_id, plan_id, mp_payment_id, starts_at, ends_at, status)
  VALUES
    (payment_order.user_id, p_order_id, payment_order.plan_id, p_mp_payment, now(), new_end, 'active')
  ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.payment_orders
  SET status = 'approved', mp_payment_id = p_mp_payment,
      notification_payload = p_payload, approved_at = now(), fulfilled_at = now()
  WHERE id = p_order_id;

  UPDATE public.profiles
  SET is_active = true, active_until = new_end
  WHERE id = payment_order.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_payment_reversal(
  p_order_id uuid,
  p_status text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  payment_order record;
  remaining_end timestamptz;
BEGIN
  IF p_status NOT IN ('cancelled', 'refunded', 'charged_back') THEN
    RAISE EXCEPTION 'invalid reversal status';
  END IF;

  SELECT id, user_id INTO payment_order
  FROM public.payment_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment order not found'; END IF;

  UPDATE public.payment_orders
  SET status = p_status, notification_payload = p_payload
  WHERE id = p_order_id;
  UPDATE public.user_access_periods
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id;

  SELECT MAX(ends_at) INTO remaining_end
  FROM public.user_access_periods
  WHERE user_id = payment_order.user_id AND status = 'active' AND ends_at > now();

  UPDATE public.profiles
  SET is_active = (remaining_end IS NOT NULL), active_until = remaining_end
  WHERE id = payment_order.user_id AND role <> 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_order_for_user(p_user_id uuid)
RETURNS TABLE (
  order_id uuid, order_status text, checkout_url text,
  plan_name text, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT po.id, po.status, po.checkout_url, p.name, po.created_at
  FROM public.payment_orders po
  JOIN public.plans p ON p.id = po.plan_id
  WHERE po.user_id = p_user_id
    AND (p_user_id = auth.uid() OR public.is_admin_user())
  ORDER BY po.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.apply_payment_approval(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_payment_reversal(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_approval(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_reversal(uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.get_active_order_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_order_for_user(uuid) TO authenticated;

COMMIT;
