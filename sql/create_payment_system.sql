-- LEGADO: não reaplique sobre a versão atual. Use sql/INSTALAR_CORRECAO_PAGAMENTOS.sql.
-- Roteiro atualizado: docs/PAGAMENTOS_PRODUCAO.md.
-- ============================================================
-- SISTEMA DE PAGAMENTO — SAFO / Concurseiro Gil
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- 1. PLANOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text,
  price_cents   integer NOT NULL,
  duration_days integer NOT NULL,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ============================================================
-- 2. ORDENS DE PAGAMENTO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id               uuid NOT NULL REFERENCES public.plans(id),
  external_reference    text UNIQUE NOT NULL,
  amount_cents          integer NOT NULL,
  status                text NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected | cancelled | refunded | charged_back | expired
  mp_preference_id      text,
  mp_payment_id         text,
  mp_merchant_order_id  text,
  checkout_url          text,
  notification_payload  jsonb,
  approved_at           timestamptz,
  fulfilled_at          timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ============================================================
-- 3. PERÍODOS DE ACESSO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_access_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id      uuid NOT NULL REFERENCES public.payment_orders(id),
  plan_id       uuid NOT NULL REFERENCES public.plans(id),
  mp_payment_id text NOT NULL,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  -- active | expired | cancelled
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ============================================================
-- 4. TRIGGERS updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS plans_updated_at           ON public.plans;
DROP TRIGGER IF EXISTS payment_orders_updated_at  ON public.payment_orders;
DROP TRIGGER IF EXISTS user_access_updated_at     ON public.user_access_periods;

CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER payment_orders_updated_at
  BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER user_access_updated_at
  BEFORE UPDATE ON public.user_access_periods
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- 5. RLS
-- ============================================================
ALTER TABLE public.plans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_periods  ENABLE ROW LEVEL SECURITY;

-- plans: qualquer usuário autenticado pode ler planos ativos
DROP POLICY IF EXISTS "plans_read" ON public.plans;
CREATE POLICY "plans_read"
  ON public.plans FOR SELECT
  USING (is_active = true);

-- payment_orders: usuário só vê e cria as próprias ordens
DROP POLICY IF EXISTS "orders_self_read"   ON public.payment_orders;
DROP POLICY IF EXISTS "orders_self_insert" ON public.payment_orders;
CREATE POLICY "orders_self_read"
  ON public.payment_orders FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "orders_self_insert"
  ON public.payment_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- user_access_periods: usuário só lê os próprios períodos
DROP POLICY IF EXISTS "access_self_read" ON public.user_access_periods;
CREATE POLICY "access_self_read"
  ON public.user_access_periods FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 6. FUNÇÃO: apply_payment_approval
-- Chamada exclusivamente pelo backend (service_role) via RPC.
-- SECURITY DEFINER garante que bypassa RLS — nunca chame do frontend.
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_payment_approval(
  p_order_id     uuid,
  p_mp_payment   text,
  p_payload      jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order         record;
  v_current_end   timestamptz;
  v_new_end       timestamptz;
BEGIN
  -- Busca ordem e duração do plano
  SELECT po.id, po.user_id, po.plan_id, po.status, p.duration_days
  INTO v_order
  FROM public.payment_orders po
  JOIN public.plans p ON po.plan_id = p.id
  WHERE po.id = p_order_id AND po.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found or already processed', p_order_id;
  END IF;

  -- Calcular novo período (extensão inteligente: soma ao fim atual se ainda ativo)
  SELECT MAX(ends_at) INTO v_current_end
  FROM public.user_access_periods
  WHERE user_id = v_order.user_id
    AND status   = 'active'
    AND ends_at  > now();

  IF v_current_end IS NOT NULL THEN
    -- Estende a partir do fim do período atual
    v_new_end := v_current_end + (v_order.duration_days || ' days')::interval;
  ELSE
    -- Começa agora
    v_new_end := now() + (v_order.duration_days || ' days')::interval;
  END IF;

  -- Cria registro de período de acesso
  INSERT INTO public.user_access_periods
    (user_id, order_id, plan_id, mp_payment_id, starts_at, ends_at)
  VALUES
    (v_order.user_id, p_order_id, v_order.plan_id, p_mp_payment, now(), v_new_end);

  -- Marca ordem como aprovada
  UPDATE public.payment_orders SET
    status              = 'approved',
    mp_payment_id       = p_mp_payment,
    notification_payload = p_payload,
    approved_at         = now(),
    fulfilled_at        = now()
  WHERE id = p_order_id;

  -- Atualiza perfil: libera acesso e define expiração
  -- Reaproveita campos existentes: is_active e active_until (= active_until no authService.ts)
  UPDATE public.profiles SET
    is_active    = true,
    active_until = v_new_end
  WHERE id = v_order.user_id;
END;
$$;

-- ============================================================
-- 7. FUNÇÃO: get_active_order_for_user (helper leve para o frontend)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_order_for_user(p_user_id uuid)
RETURNS TABLE (
  order_id      uuid,
  order_status  text,
  checkout_url  text,
  plan_name     text,
  created_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT po.id, po.status, po.checkout_url, p.name, po.created_at
  FROM public.payment_orders po
  JOIN public.plans p ON po.plan_id = p.id
  WHERE po.user_id = p_user_id
  ORDER BY po.created_at DESC
  LIMIT 1;
END;
$$;

-- ============================================================
-- 8. SEED — Planos
-- ============================================================
INSERT INTO public.plans (code, name, description, price_cents, duration_days) VALUES
  ('monthly',   'Plano Mensal',     'Acesso completo por 30 dias. Questões ilimitadas, flashcards, resumos e ranking.', 2990, 30),
  ('quarterly', 'Plano Trimestral', 'Acesso completo por 90 dias com economia de 16%. O melhor custo-benefício.',        7490, 90)
ON CONFLICT (code) DO NOTHING;
