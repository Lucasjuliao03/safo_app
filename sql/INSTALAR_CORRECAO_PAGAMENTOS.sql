-- SAFO: execute o arquivo INTEIRO no SQL Editor do Supabase.
-- Use uma única aba, após instalar a correção de estudos. Não apaga compras.
-- Publique também api/, server/ e src/ atualizados.
BEGIN;
SET LOCAL lock_timeout = '2s';
-- Fail before DDL if the app/another installer is using an affected table.
DO $$ DECLARE target regclass; BEGIN
  IF NOT pg_try_advisory_xact_lock(208740901,2) THEN
    RAISE EXCEPTION USING ERRCODE='55P03', MESSAGE='Outra instalação de pagamentos está em execução.';
  END IF;
  FOR target IN SELECT c.oid::regclass FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='public' AND c.relname IN ('profiles','plans','payment_orders','user_access_periods'))
      OR (n.nspname='safo_payments' AND c.relkind='r')
      OR (n.nspname='safo_trial' AND c.relname IN ('study_trial_quota','study_trial_events','summary_read_events'))
    ORDER BY n.nspname,c.relname
  LOOP
    BEGIN EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE NOWAIT',target);
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION USING ERRCODE='55P03', MESSAGE='Instalação adiada: pagamentos em uso. Nenhuma alteração aplicada.',
        HINT='Feche o app e outras consultas. Aguarde e execute o arquivo inteiro novamente em uma única aba.';
    END;
  END LOOP;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_blocked boolean NOT NULL DEFAULT false;

CREATE SCHEMA IF NOT EXISTS safo_payments;
REVOKE ALL ON SCHEMA safo_payments FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA safo_payments TO service_role;

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,name text NOT NULL,description text,
  price_cents integer NOT NULL CHECK(price_cents>0),duration_days integer NOT NULL CHECK(duration_days>0),
  is_active boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),
  plan_id uuid NOT NULL REFERENCES public.plans(id),external_reference text UNIQUE NOT NULL,
  amount_cents integer NOT NULL,status text NOT NULL DEFAULT 'pending',mp_preference_id text,mp_payment_id text,
  mp_merchant_order_id text,checkout_url text,notification_payload jsonb,approved_at timestamptz,fulfilled_at timestamptz,
  created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_access_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),
  order_id uuid NOT NULL REFERENCES public.payment_orders(id),plan_id uuid NOT NULL REFERENCES public.plans(id),
  mp_payment_id text NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS duration_days integer,
  ADD COLUMN IF NOT EXISTS plan_name text,
  ADD COLUMN IF NOT EXISTS checkout_request_id uuid,
  ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_lease_token uuid,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
-- Historical terms cannot be reconstructed if an old plan was edited. Preserve
-- existing access timestamps; snapshot current terms only for missing snapshots.
UPDATE public.payment_orders o SET duration_days=COALESCE(o.duration_days,p.duration_days),
  plan_name=COALESCE(o.plan_name,p.name) FROM public.plans p WHERE p.id=o.plan_id
  AND (o.duration_days IS NULL OR o.plan_name IS NULL);
ALTER TABLE public.user_access_periods
  ADD COLUMN IF NOT EXISTS granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_seconds bigint;
-- The old model stored stacked ends but set every start to the payment time.
WITH history AS (
  SELECT id,ends_at-GREATEST(starts_at,COALESCE(lag(ends_at) OVER(PARTITION BY user_id ORDER BY created_at,id),starts_at)) AS duration
  FROM public.user_access_periods
) UPDATE public.user_access_periods a SET granted_at=COALESCE(a.granted_at,a.starts_at),
  duration_seconds=COALESCE(a.duration_seconds,CASE WHEN extract(epoch FROM h.duration)>0 THEN extract(epoch FROM h.duration)::bigint
    ELSE o.duration_days::bigint*86400 END)
FROM history h,public.payment_orders o WHERE a.id=h.id AND o.id=a.order_id
  AND (a.granted_at IS NULL OR a.duration_seconds IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS payment_checkout_request_unique ON public.payment_orders(checkout_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_access_order_unique ON public.user_access_periods(order_id);
CREATE INDEX IF NOT EXISTS payment_orders_user_checkout_idx ON public.payment_orders(user_id,plan_id,created_at DESC);

CREATE TABLE IF NOT EXISTS safo_payments.transactions (
  payment_id text PRIMARY KEY,order_id uuid NOT NULL REFERENCES public.payment_orders(id),
  status text NOT NULL,amount_cents integer NOT NULL,refunded_cents integer NOT NULL DEFAULT 0,
  provider_updated_at timestamptz NOT NULL,payload jsonb NOT NULL DEFAULT '{}',updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_transactions_order_idx ON safo_payments.transactions(order_id);
CREATE TABLE IF NOT EXISTS safo_payments.access_baselines (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id),ends_at timestamptz,unlimited boolean NOT NULL DEFAULT false
);
-- Preserve manual/admin access that predates payment-managed periods.
INSERT INTO safo_payments.access_baselines(user_id,ends_at,unlimited)
  SELECT p.id,p.active_until,p.active_until IS NULL FROM public.profiles p WHERE p.is_active
    AND (p.active_until IS NULL OR p.active_until>now())
    AND NOT EXISTS(SELECT 1 FROM public.user_access_periods a WHERE a.user_id=p.id)
ON CONFLICT(user_id) DO NOTHING;
ALTER TABLE safo_payments.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safo_payments.access_baselines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA safo_payments FROM PUBLIC,anon,authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA safo_payments TO service_role;

-- Browser clients may read only their own financial records and active plans.
DO $$ DECLARE t text; item record; BEGIN
  FOREACH t IN ARRAY ARRAY['plans','payment_orders','user_access_periods'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    FOR item IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',item.policyname,t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;
GRANT SELECT ON public.plans TO anon;
GRANT INSERT,UPDATE,DELETE ON public.plans TO authenticated;
CREATE POLICY payment_plans_read ON public.plans FOR SELECT TO authenticated USING(is_active OR public.is_admin_user());
CREATE POLICY payment_plans_anonymous ON public.plans FOR SELECT TO anon USING(is_active);
CREATE POLICY payment_plans_admin ON public.plans FOR ALL TO authenticated
  USING(public.is_admin_user()) WITH CHECK(public.is_admin_user());
CREATE POLICY payment_orders_owner ON public.payment_orders FOR SELECT TO authenticated
  USING(user_id=(SELECT auth.uid()) OR public.is_admin_user());
CREATE POLICY payment_periods_owner ON public.user_access_periods FOR SELECT TO authenticated
  USING(user_id=(SELECT auth.uid()) OR public.is_admin_user());

-- Keep administrative suspension separate from subscription state. A payment
-- must never silently lift an administrator's explicit account hold.
UPDATE public.profiles p SET access_blocked=true WHERE NOT p.is_active AND p.active_until>now()
  AND EXISTS(SELECT 1 FROM public.user_access_periods a WHERE a.user_id=p.id AND a.status='active');
CREATE OR REPLACE FUNCTION safo_payments.protect_account_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.access_blocked IS DISTINCT FROM OLD.access_blocked
    AND current_user NOT IN ('postgres','service_role','supabase_admin') AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Administrative access fields cannot be changed directly';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payment_protect_account_hold ON public.profiles;
CREATE TRIGGER payment_protect_account_hold BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION safo_payments.protect_account_hold();

CREATE OR REPLACE FUNCTION public.has_active_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND (p.role='admin' OR (NOT p.access_blocked AND p.is_active AND (p.active_until IS NULL OR p.active_until>now()))));
$$;
REVOKE ALL ON FUNCTION public.has_active_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_active_access() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION safo_trial.can_use_app()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE((SELECT p.role='admin' OR (NOT p.access_blocked
    AND (p.active_until IS NULL OR p.active_until>now())
    AND (p.is_active OR COALESCE(q.used_count<10,false)))
    FROM public.profiles p LEFT JOIN safo_trial.study_trial_quota q ON q.user_id=p.id
    WHERE p.id=(SELECT auth.uid()) AND (SELECT auth.uid()) IS NOT NULL),false);
$$;
REVOKE ALL ON FUNCTION safo_trial.can_use_app() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION safo_trial.can_use_app() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_study_access(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.profiles; used integer; entitled boolean; blocked boolean;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  SELECT used_count INTO used FROM safo_trial.study_trial_quota WHERE user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'trial_not_initialized'; END IF;
  blocked:=p.access_blocked AND COALESCE(p.role,'student')<>'admin';
  entitled:=COALESCE(p.role,'student')='admin' OR (NOT blocked AND COALESCE(p.is_active,false) AND (p.active_until IS NULL OR p.active_until>now()));
  RETURN jsonb_build_object('entitled',entitled,'used',used,'limit',10,'blocked',blocked,'accessExpiresAt',p.active_until,
    'expired',COALESCE(p.role,'student')<>'admin' AND p.active_until IS NOT NULL AND p.active_until<=now(),
    'remaining',CASE WHEN entitled THEN NULL ELSE GREATEST(0,10-used) END);
END $$;
REVOKE ALL ON FUNCTION public.get_study_access(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_access(uuid) TO service_role;
CREATE OR REPLACE FUNCTION safo_payments.enforce_account_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND access_blocked AND role<>'admin') THEN
    RAISE EXCEPTION 'account_blocked';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payment_study_account_hold ON safo_trial.study_trial_events;
CREATE TRIGGER payment_study_account_hold BEFORE INSERT OR UPDATE ON safo_trial.study_trial_events
  FOR EACH ROW EXECUTE FUNCTION safo_payments.enforce_account_hold();
DROP TRIGGER IF EXISTS payment_summary_account_hold ON safo_trial.summary_read_events;
CREATE TRIGGER payment_summary_account_hold BEFORE INSERT ON safo_trial.summary_read_events
  FOR EACH ROW EXECUTE FUNCTION safo_payments.enforce_account_hold();
REVOKE ALL ON FUNCTION safo_payments.protect_account_hold() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION safo_payments.enforce_account_hold() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION safo_payments.protect_account_hold(),safo_payments.enforce_account_hold() TO service_role;

CREATE OR REPLACE FUNCTION safo_payments.rebuild_access(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cursor_end timestamptz; latest_end timestamptz; base safo_payments.access_baselines; item record; start_at timestamptz;
BEGIN
  -- Preserve an administrator's explicit unlimited release, including one
  -- performed after a payment. Provider retries must not replace it with a date.
  INSERT INTO safo_payments.access_baselines(user_id,ends_at,unlimited)
    SELECT id,NULL,true FROM public.profiles WHERE id=p_user_id AND is_active AND active_until IS NULL AND NOT access_blocked
    ON CONFLICT(user_id) DO UPDATE SET unlimited=true,ends_at=NULL;
  SELECT * INTO base FROM safo_payments.access_baselines WHERE user_id=p_user_id;
  cursor_end:=base.ends_at; latest_end:=base.ends_at;
  FOR item IN SELECT * FROM public.user_access_periods WHERE user_id=p_user_id AND status IN ('active','expired')
    ORDER BY granted_at,created_at,id
  LOOP
    start_at:=GREATEST(item.granted_at,COALESCE(cursor_end,item.granted_at));
    cursor_end:=start_at+make_interval(secs=>item.duration_seconds::double precision);
    UPDATE public.user_access_periods SET starts_at=start_at,ends_at=cursor_end,updated_at=now() WHERE id=item.id;
    latest_end:=GREATEST(latest_end,cursor_end);
  END LOOP;
  UPDATE public.profiles SET is_active=NOT access_blocked AND (COALESCE(base.unlimited,false) OR COALESCE(latest_end>now(),false)),
    active_until=CASE WHEN COALESCE(base.unlimited,false) THEN NULL ELSE COALESCE(latest_end,now()) END
  WHERE id=p_user_id AND COALESCE(role,'student')<>'admin';
END $$;

CREATE OR REPLACE FUNCTION public.create_checkout_order(p_user_id uuid,p_plan_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans; o public.payment_orders; recent integer; new_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_plan_id IS NULL OR p_request_id IS NULL THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','profile_not_found'); END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND access_blocked) THEN RETURN jsonb_build_object('error','account_blocked'); END IF;
  SELECT * INTO p FROM public.plans WHERE id=p_plan_id AND is_active AND price_cents>0 AND duration_days>0;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','plan_not_found'); END IF;
  SELECT * INTO o FROM public.payment_orders WHERE checkout_request_id=p_request_id;
  IF FOUND AND (o.user_id<>p_user_id OR o.plan_id<>p_plan_id) THEN RETURN jsonb_build_object('error','request_conflict'); END IF;
  IF NOT FOUND THEN
    SELECT * INTO o FROM public.payment_orders WHERE user_id=p_user_id AND plan_id=p_plan_id AND status='pending'
      AND amount_cents=p.price_cents AND duration_days=p.duration_days AND checkout_expires_at>now()
      ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF o.id IS NOT NULL AND (o.status<>'pending' OR o.checkout_expires_at<=now()) THEN
    RETURN jsonb_build_object('error','checkout_finished');
  END IF;
  IF o.id IS NOT NULL AND o.checkout_url IS NOT NULL THEN RETURN to_jsonb(o)||jsonb_build_object('reused',true); END IF;
  IF o.id IS NOT NULL AND o.checkout_lease_until>now() THEN RETURN jsonb_build_object('error','checkout_busy'); END IF;
  IF o.id IS NULL THEN
    SELECT count(*) INTO recent FROM public.payment_orders WHERE user_id=p_user_id AND created_at>now()-interval '10 minutes';
    IF recent>=5 THEN RETURN jsonb_build_object('error','checkout_rate_limited'); END IF;
    new_id:=gen_random_uuid();
    INSERT INTO public.payment_orders(id,user_id,plan_id,external_reference,amount_cents,duration_days,plan_name,
      checkout_request_id,checkout_expires_at) VALUES(new_id,p_user_id,p.id,new_id::text,p.price_cents,p.duration_days,p.name,
      p_request_id,now()+interval '24 hours') RETURNING * INTO o;
  END IF;
  UPDATE public.payment_orders SET checkout_lease_until=now()+interval '30 seconds',checkout_lease_token=p_request_id
    WHERE id=o.id RETURNING * INTO o;
  RETURN to_jsonb(o)||jsonb_build_object('reused',false);
END $$;

CREATE OR REPLACE FUNCTION public.claim_payment_check(p_user_id uuid,p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  UPDATE public.payment_orders SET last_checked_at=now() WHERE id=p_order_id AND user_id=p_user_id
    AND (last_checked_at IS NULL OR last_checked_at<now()-interval '15 seconds');
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.record_payment_state(p_order_id uuid,p_payment_id text,p_status text,
  p_amount_cents integer,p_refunded_cents integer,p_provider_updated_at timestamptz,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.payment_orders; t safo_payments.transactions; a public.user_access_periods; uid uuid; normalized text;
BEGIN
  IF p_payment_id IS NULL OR p_payment_id !~ '^[1-9][0-9]{0,18}$' OR p_provider_updated_at IS NULL
    OR p_status IS NULL OR p_status NOT IN ('approved','pending','in_process','in_mediation','authorized','rejected','cancelled','refunded','charged_back') THEN
    RETURN jsonb_build_object('error','invalid_payment_state');
  END IF;
  SELECT user_id INTO uid FROM public.payment_orders WHERE id=p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','payment_order_not_found'); END IF;
  -- One lock per account serializes different simultaneous purchases/renewals.
  PERFORM 1 FROM public.profiles WHERE id=uid FOR UPDATE;
  SELECT * INTO o FROM public.payment_orders WHERE id=p_order_id FOR UPDATE;
  IF p_amount_cents IS DISTINCT FROM o.amount_cents OR p_refunded_cents IS NULL
    OR p_refunded_cents<0 OR p_refunded_cents>p_amount_cents OR COALESCE(o.duration_days,0)<=0 THEN
    RETURN jsonb_build_object('error','payment_amount_mismatch');
  END IF;
  SELECT * INTO t FROM safo_payments.transactions WHERE payment_id=p_payment_id;
  IF FOUND THEN
    IF t.order_id<>p_order_id THEN RETURN jsonb_build_object('error','payment_order_conflict'); END IF;
    IF p_provider_updated_at<t.provider_updated_at OR t.status IN ('refunded','charged_back')
      OR (p_provider_updated_at=t.provider_updated_at AND t.status='approved' AND p_status IN ('pending','in_process','authorized','rejected')) THEN
      RETURN jsonb_build_object('replayed',true);
    END IF;
  END IF;
  INSERT INTO safo_payments.transactions(payment_id,order_id,status,amount_cents,refunded_cents,provider_updated_at,payload)
    VALUES(p_payment_id,p_order_id,p_status,p_amount_cents,p_refunded_cents,p_provider_updated_at,p_payload)
    ON CONFLICT(payment_id) DO UPDATE SET status=EXCLUDED.status,refunded_cents=EXCLUDED.refunded_cents,
      provider_updated_at=EXCLUDED.provider_updated_at,payload=EXCLUDED.payload,updated_at=now();

  SELECT * INTO a FROM public.user_access_periods WHERE order_id=p_order_id;
  IF a.id IS NOT NULL AND a.mp_payment_id<>p_payment_id THEN
    IF p_status='approved' AND p_refunded_cents<p_amount_cents THEN
      UPDATE public.payment_orders SET needs_review=true WHERE id=p_order_id;
      RETURN jsonb_build_object('needsReview',true);
    END IF;
    RETURN jsonb_build_object('ignoredAttempt',true);
  END IF;
  IF a.id IS NULL AND p_status='approved' AND p_refunded_cents<p_amount_cents THEN
    INSERT INTO safo_payments.access_baselines(user_id,ends_at,unlimited)
      SELECT id,active_until,active_until IS NULL FROM public.profiles WHERE id=uid AND is_active
        AND (active_until IS NULL OR active_until>now())
        AND NOT EXISTS(SELECT 1 FROM public.user_access_periods WHERE user_id=uid)
      ON CONFLICT(user_id) DO NOTHING;
    INSERT INTO public.user_access_periods(user_id,order_id,plan_id,mp_payment_id,starts_at,ends_at,status,granted_at,duration_seconds)
      VALUES(uid,o.id,o.plan_id,p_payment_id,now(),now()+make_interval(days=>o.duration_days),'active',now(),o.duration_days::bigint*86400)
      RETURNING * INTO a;
    UPDATE public.payment_orders SET approved_at=now(),fulfilled_at=now() WHERE id=o.id;
  END IF;
  normalized:=CASE WHEN p_status='charged_back' THEN 'charged_back' WHEN p_refunded_cents=p_amount_cents THEN 'refunded'
    WHEN p_status IN ('in_process','authorized','in_mediation') THEN 'pending' ELSE p_status END;
  -- An unsuccessful alternative attempt never downgrades a fulfilled order.
  IF a.id IS NULL THEN
    UPDATE public.payment_orders SET status=normalized,notification_payload=p_payload,updated_at=now() WHERE id=o.id AND fulfilled_at IS NULL;
    IF normalized IN ('refunded','charged_back') THEN
      INSERT INTO safo_payments.access_baselines(user_id,ends_at,unlimited)
        SELECT id,active_until,active_until IS NULL FROM public.profiles WHERE id=uid AND is_active
          AND (active_until IS NULL OR active_until>now())
          AND NOT EXISTS(SELECT 1 FROM public.user_access_periods WHERE user_id=uid)
        ON CONFLICT(user_id) DO NOTHING;
      PERFORM safo_payments.rebuild_access(uid);
    END IF;
  ELSE
    IF a.status='cancelled' THEN RETURN jsonb_build_object('replayed',true); END IF;
    IF p_status IN ('pending','in_process','authorized') THEN RETURN jsonb_build_object('ignoredAttempt',true); END IF;
    UPDATE public.user_access_periods SET status=CASE
      WHEN normalized IN ('refunded','charged_back','cancelled','rejected') THEN 'cancelled'
      WHEN p_status='in_mediation' THEN 'suspended' ELSE 'active' END,updated_at=now() WHERE id=a.id;
    UPDATE public.payment_orders SET status=normalized,mp_payment_id=p_payment_id,notification_payload=p_payload,
      mp_merchant_order_id=p_payload->>'merchant_order_id',updated_at=now() WHERE id=o.id;
    PERFORM safo_payments.rebuild_access(uid);
  END IF;
  RETURN jsonb_build_object('replayed',false,'status',normalized);
END $$;

-- Retire legacy elevated transitions. Old deployed callers fail safely until
-- the new API is published, instead of bypassing this transaction ledger.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('apply_payment_approval','apply_payment_reversal')
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;
REVOKE ALL ON FUNCTION safo_payments.rebuild_access(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION safo_payments.rebuild_access(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_checkout_order(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_payment_check(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_payment_state(uuid,text,text,integer,integer,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_order(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_payment_check(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_state(uuid,text,text,integer,integer,timestamptz,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
