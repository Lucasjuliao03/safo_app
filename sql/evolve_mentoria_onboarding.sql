-- ====================================================================================
-- EVOLUÇÃO DO MÓDULO MENTORIA — ONBOARDING INTELIGENTE + GERADOR DE PLANO
-- Execute este script UMA VEZ no Supabase SQL Editor
-- Zero-breaking: apenas ADDs, nenhuma coluna existente é alterada ou removida
-- ====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Novas colunas em mentoria_diagnosticos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mentoria_diagnosticos
  ADD COLUMN IF NOT EXISTS study_days_of_week       INTEGER[]    DEFAULT '{1,2,3,4,5}',
  -- Dias da semana disponíveis: 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb

  ADD COLUMN IF NOT EXISTS preferred_period         TEXT         DEFAULT 'variado'
    CHECK (preferred_period IN ('manha', 'tarde', 'noite', 'variado')),

  ADD COLUMN IF NOT EXISTS preparation_level        TEXT         DEFAULT 'intermediario'
    CHECK (preparation_level IN ('iniciante', 'intermediario', 'avancado', 'reta_final')),

  ADD COLUMN IF NOT EXISTS include_simulations      BOOLEAN      DEFAULT false,

  ADD COLUMN IF NOT EXISTS simulation_frequency_days INTEGER     DEFAULT 14,

  ADD COLUMN IF NOT EXISTS review_frequency         TEXT         DEFAULT 'semanal'
    CHECK (review_frequency IN ('diaria', 'dois_dias', 'semanal')),

  ADD COLUMN IF NOT EXISTS current_focus            TEXT         DEFAULT 'misto'
    CHECK (current_focus IN ('teoria', 'questoes', 'revisao', 'reta_final', 'misto')),

  ADD COLUMN IF NOT EXISTS schedule_notes           TEXT,

  ADD COLUMN IF NOT EXISTS plan_generated           BOOLEAN      DEFAULT false,
  -- true após o gerador ter rodado ao menos uma vez

  ADD COLUMN IF NOT EXISTS plan_version             INTEGER      DEFAULT 0,
  -- Incrementado a cada re-geração

  ADD COLUMN IF NOT EXISTS plan_generated_at        TIMESTAMPTZ;

COMMENT ON COLUMN public.mentoria_diagnosticos.study_days_of_week       IS '0=Dom,1=Seg,...,6=Sáb — dias que o aluno declarou estar disponível';
COMMENT ON COLUMN public.mentoria_diagnosticos.preferred_period         IS 'Período preferido de estudo';
COMMENT ON COLUMN public.mentoria_diagnosticos.preparation_level        IS 'Nível de preparação auto-declarado';
COMMENT ON COLUMN public.mentoria_diagnosticos.include_simulations      IS 'Deseja simulados no plano?';
COMMENT ON COLUMN public.mentoria_diagnosticos.simulation_frequency_days IS 'Intervalo em dias entre simulados';
COMMENT ON COLUMN public.mentoria_diagnosticos.review_frequency         IS 'Frequência de revisão espaçada';
COMMENT ON COLUMN public.mentoria_diagnosticos.current_focus            IS 'Foco principal do plano atual';
COMMENT ON COLUMN public.mentoria_diagnosticos.schedule_notes           IS 'Notas livres sobre rotina (turnos, plantões)';
COMMENT ON COLUMN public.mentoria_diagnosticos.plan_generated           IS 'Flag: plano já foi gerado automaticamente?';
COMMENT ON COLUMN public.mentoria_diagnosticos.plan_version             IS 'Versão do plano — incrementado a cada re-geração';
COMMENT ON COLUMN public.mentoria_diagnosticos.plan_generated_at        IS 'Timestamp da última geração automática';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Nova tabela: mentoria_plan_versions (histórico de re-gerações)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentoria_plan_versions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL DEFAULT 1,
  generated_at  TIMESTAMPTZ DEFAULT now(),
  reason        TEXT,         -- 'onboarding_inicial', 're_diagnostico', 'manual_admin'
  snapshot      JSONB         -- Snapshot das preferências no momento da geração
);

CREATE INDEX IF NOT EXISTS idx_plan_versions_user ON public.mentoria_plan_versions(user_id);

ALTER TABLE public.mentoria_plan_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aluno lê versões do plano" ON public.mentoria_plan_versions;
CREATE POLICY "Aluno lê versões do plano" ON public.mentoria_plan_versions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user());

DROP POLICY IF EXISTS "Aluno insere versão do plano" ON public.mentoria_plan_versions;
CREATE POLICY "Aluno insere versão do plano" ON public.mentoria_plan_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin gerencia versões do plano" ON public.mentoria_plan_versions;
CREATE POLICY "Admin gerencia versões do plano" ON public.mentoria_plan_versions
  FOR ALL USING (public.is_admin_user());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Nova policy RLS: aluno pode INSERIR tarefas durante o onboarding
--    (o gerador de plano roda no frontend como o usuário logado)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Aluno insere tarefas no onboarding" ON public.mentoria_tarefas_diarias;
CREATE POLICY "Aluno insere tarefas no onboarding" ON public.mentoria_tarefas_diarias
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Nova policy RLS: aluno pode ATUALIZAR seu próprio diagnóstico
--    (necessário para re-diagnóstico futuro)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Aluno atualiza seu diagnostico" ON public.mentoria_diagnosticos;
CREATE POLICY "Aluno atualiza seu diagnostico" ON public.mentoria_diagnosticos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Aluno pode DELETAR suas próprias tarefas PENDENTES futuras
--    (necessário para re-geração: limpa futuras sem tocar no histórico)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Aluno deleta tarefas pendentes futuras" ON public.mentoria_tarefas_diarias;
CREATE POLICY "Aluno deleta tarefas pendentes futuras" ON public.mentoria_tarefas_diarias
  FOR DELETE USING (
    auth.uid() = user_id
    AND status = 'pending'
    AND planned_date >= CURRENT_DATE
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM DA MIGRAÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
