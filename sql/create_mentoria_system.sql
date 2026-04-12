-- ====================================================================================
-- MÓDULO DE MENTORIA - SISTEMA DE ACOMPANHAMENTO DE DESEMPENHO (SAFO)
-- Estrutura criada obedecendo princípios de isolamento e independência (Zero-breaking)
-- ====================================================================================

-- 1. Tabela: Status de Mentoria do Aluno
CREATE TABLE IF NOT EXISTS public.mentoria_alunos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    mentor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Admin responsável
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'finished')),
    started_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- 2. Tabela: Diagnóstico Inicial
CREATE TABLE IF NOT EXISTS public.mentoria_diagnosticos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    objective TEXT,                    -- Qual é o alvo/meta (ex: PF, PRF, TSE)
    exam_date TIMESTAMPTZ,             -- Previsão do concurso
    daily_available_minutes INTEGER,   -- Tempo líquido por dia (ex: 180 min)
    strong_subjects JSONB,             -- Array de matérias que domina
    weak_subjects JSONB,               -- Array de matérias críticas
    history_report TEXT,               -- Reprovações e Histórico (Redação)
    method_style TEXT,                 -- Estilo que o mentor recomendou ou constatou
    mentor_notes TEXT,                 -- Observações abertas e restritas ao admin
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela: Estratégia Modular (Versão macro do plano)
CREATE TABLE IF NOT EXISTS public.mentoria_estrategias (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    weekly_questions_target INTEGER DEFAULT 150,
    review_pattern TEXT DEFAULT '24h/7d',
    focus_areas JSONB,                -- {"Português": "prioridade 1", "Estatística": "manutenção"}
    simulate_frequency_days INTEGER DEFAULT 14,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela: Tarefas (A Execução Diária do Aluno)
-- Cada linha é uma tarefa num dia específico. O aluno visualiza as tarefas de 'hoje'.
CREATE TABLE IF NOT EXISTS public.mentoria_tarefas_diarias (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    planned_date DATE NOT NULL,
    task_type TEXT NOT NULL CHECK (task_type IN ('theory', 'questions', 'review', 'simulation', 'reading')),
    subject_id BIGINT REFERENCES public.subjects(id) ON DELETE SET NULL, -- Matéria (Opcional, pois pode ser revisão geral)
    title TEXT NOT NULL,               -- Texto de instrução principal (ex: "Ler Direitos Garantias Fundamentais")
    description TEXT,                  -- Instrução secundária do Mentor
    planned_minutes INTEGER,           -- Estimativa de tempo ideal
    
    -- Execução (Input do Aluno no Check-in)
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'delayed', 'skipped')),
    actual_minutes INTEGER,            -- Quantas horas deu na prática no cronômetro?
    actual_questions INTEGER,          -- Conseguiu fazer quantas?
    student_notes TEXT,                -- Dificuldade em executar?
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_mentor_tasks_user_date ON public.mentoria_tarefas_diarias(user_id, planned_date);

-- 5. Tabela: Alertas do Sistema (Background/Métricas)
CREATE TABLE IF NOT EXISTS public.mentoria_alertas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    alert_type TEXT NOT NULL,         -- 'streak_broken', 'bad_performance', 'delayed_tasks'
    description TEXT NOT NULL,        -- "Você caiu de 70% para 40% em Penal"
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_mentor_alertas_user ON public.mentoria_alertas(user_id, is_resolved);

-- 6. Tabela: Intervenções (Correções de Rota by Admin)
CREATE TABLE IF NOT EXISTS public.mentoria_intervencoes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    mentor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,              -- Qual desempenho gerou a ação?
    action_taken TEXT NOT NULL,        -- O que o mentor mudou na vida real do cronograma
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================
-- CONFIGURAÇÕES DE RLS (SEGURANÇA E ACESSOS ISOLADOS)
-- =========================================================

-- Habilitar RLS em todas
ALTER TABLE public.mentoria_alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoria_diagnosticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoria_estrategias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoria_tarefas_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoria_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentoria_intervencoes ENABLE ROW LEVEL SECURITY;

-- 1. Mentoria Alunos (Aluno se enxerga e pode aplicar; Admin enxerga geral)
CREATE POLICY "Aluno visualiza sua flag de mentoria" ON public.mentoria_alunos
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user());
CREATE POLICY "Aluno aplica para mentoria" ON public.mentoria_alunos
    FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Admins alteram controle de alunos" ON public.mentoria_alunos
    FOR ALL USING (public.is_admin_user());

-- 2. Diagnóstico & Estratégia (Aluno lê e preenche form basico, Admin total)
CREATE POLICY "Aluno lê diagnóstico" ON public.mentoria_diagnosticos
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user());
CREATE POLICY "Aluno preenche diagnostico" ON public.mentoria_diagnosticos
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manipulam diagnóstico" ON public.mentoria_diagnosticos
    FOR ALL USING (public.is_admin_user());
CREATE POLICY "Aluno lê estratégia" ON public.mentoria_estrategias
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user());
CREATE POLICY "Admins manipulam estratégia" ON public.mentoria_estrategias
    FOR ALL USING (public.is_admin_user());

-- 3. Tarefas Diárias (Aluno lê e faz update do seu checkin; Admin total)
CREATE POLICY "Aluno opera suas tarefas" ON public.mentoria_tarefas_diarias
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user());
CREATE POLICY "Aluno faz checkin na tarefa" ON public.mentoria_tarefas_diarias
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manipulam plano diário" ON public.mentoria_tarefas_diarias
    FOR ALL USING (public.is_admin_user());

-- 4. Alertas e Intervenções (Admin restrito para gravação)
CREATE POLICY "Leitura de acompanhamento" ON public.mentoria_alertas
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user());
CREATE POLICY "Admin controla alertas" ON public.mentoria_alertas
    FOR ALL USING (public.is_admin_user());
    
CREATE POLICY "Aluno lê logs do mentor" ON public.mentoria_intervencoes
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user());
CREATE POLICY "Admin adiciona intervencoes" ON public.mentoria_intervencoes
    FOR ALL USING (public.is_admin_user());

-- NOTA: O insert do aluno na Mentoria ocorrerá puramente pelo Painel Administrativo.
-- As queries de desempenho são feitas no frontend baseando em views ou cruzamentos locais.
