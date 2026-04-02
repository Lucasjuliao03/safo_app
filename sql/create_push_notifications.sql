-- =========================================================
-- WEB PUSH NOTIFICATIONS — Tabelas, Policies e Índices
-- Execute no Supabase SQL Editor
-- =========================================================

-- =========================================================
-- 1. PUSH SUBSCRIPTIONS
-- Armazena as subscriptions de cada dispositivo/browser
-- =========================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_active
  ON public.push_subscriptions(user_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint
  ON public.push_subscriptions(endpoint);

COMMENT ON TABLE public.push_subscriptions IS 'Armazena push subscriptions Web Push por usuário/dispositivo';

-- =========================================================
-- 2. USER NOTIFICATION PREFERENCES (server-side)
-- Preferências salvas no banco (substitui localStorage)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_reminder BOOLEAN NOT NULL DEFAULT true,
  daily_reminder_time TIME NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  streak_alert BOOLEAN NOT NULL DEFAULT true,
  achievement_alert BOOLEAN NOT NULL DEFAULT true,
  motivational_messages BOOLEAN NOT NULL DEFAULT true,
  mission_alert BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

COMMENT ON TABLE public.user_notification_preferences IS 'Preferências de notificação push por usuário';

-- =========================================================
-- 3. NOTIFICATION LOGS
-- Registro de todas as notificações enviadas
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'daily_reminder', 'streak_risk', 'motivational', 'mission_available',
    'achievement', 'custom'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'expired_subscription')),
  error_message TEXT,
  push_subscription_id UUID REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  motivational_message_id INTEGER REFERENCES public.motivational_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_logs_user_date
  ON public.notification_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_logs_type_date
  ON public.notification_logs(notification_type, created_at DESC);

COMMENT ON TABLE public.notification_logs IS 'Log de todas as notificações push enviadas';

-- =========================================================
-- 4. RLS POLICIES
-- =========================================================

-- push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- user_notification_preferences
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON public.user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- notification_logs
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs"
  ON public.notification_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all logs"
  ON public.notification_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role pode inserir logs (Edge Functions usam service_role key)
CREATE POLICY "Service role can insert logs"
  ON public.notification_logs FOR INSERT
  WITH CHECK (true);

-- Service role pode ler subscriptions para envio
CREATE POLICY "Service role can read all subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (true);

CREATE POLICY "Service role can update subscriptions"
  ON public.push_subscriptions FOR UPDATE
  USING (true);

-- =========================================================
-- 5. GRANTS
-- =========================================================
GRANT ALL ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.user_notification_preferences TO authenticated;
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT ALL ON public.user_notification_preferences TO service_role;
