-- =========================================================
-- CRON JOBS — Agendamento de Notificações Push
-- Execute no Supabase SQL Editor
-- =========================================================

-- 0. Habilitar extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Antes de agendar, grave um segredo forte no Vault (uma única vez):
-- SELECT vault.create_secret('valor-aleatorio-com-32-ou-mais-bytes', 'push_cron_secret');
-- Configure o mesmo valor como CRON_SECRET nas Edge Functions.

-- =========================================================
-- 1. LEMBRETE DIÁRIO DE ESTUDO — 09:00 BRT (12:00 UTC)
-- =========================================================
SELECT cron.schedule(
  'push-daily-reminder',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://melyesnqvbatmpxvotwc.supabase.co/functions/v1/check-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_cron_secret')
    ),
    body := '{"type": "daily_reminder"}'::jsonb
  ) AS request_id;
  $$
);

-- =========================================================
-- 2. MISSÃO DIÁRIA DISPONÍVEL — 08:00 BRT (11:00 UTC)
-- =========================================================
SELECT cron.schedule(
  'push-mission-available',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://melyesnqvbatmpxvotwc.supabase.co/functions/v1/check-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_cron_secret')
    ),
    body := '{"type": "mission_available"}'::jsonb
  ) AS request_id;
  $$
);

-- =========================================================
-- 3. MENSAGEM MOTIVACIONAL — 12:00 BRT (15:00 UTC)
-- =========================================================
SELECT cron.schedule(
  'push-motivational',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://melyesnqvbatmpxvotwc.supabase.co/functions/v1/check-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_cron_secret')
    ),
    body := '{"type": "motivational"}'::jsonb
  ) AS request_id;
  $$
);

-- =========================================================
-- 4. STREAK EM RISCO — 20:00 BRT (23:00 UTC)
-- =========================================================
SELECT cron.schedule(
  'push-streak-risk',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://melyesnqvbatmpxvotwc.supabase.co/functions/v1/check-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_cron_secret')
    ),
    body := '{"type": "streak_risk"}'::jsonb
  ) AS request_id;
  $$
);

-- =========================================================
-- COMANDOS ÚTEIS
-- =========================================================
-- Ver jobs agendados:
-- SELECT * FROM cron.job;
--
-- Ver execuções recentes:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
-- Pausar um job:
-- SELECT cron.unschedule('push-daily-reminder');
