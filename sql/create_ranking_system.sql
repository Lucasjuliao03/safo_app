-- ============================================
-- MÓDULO DE RANKING - SAFO
-- Arquitetura Completa
-- ============================================

-- ============================================
-- 1. TABELAS PRINCIPAIS
-- ============================================

-- Tabela de ranking global (atualizada diariamente)
CREATE TABLE IF NOT EXISTS ranking_global (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id),
  period VARCHAR(20) NOT NULL, -- 'all', 'weekly', 'monthly'
  week_number INTEGER, -- semana do ano (1-53)
  month INTEGER, -- mês (1-12)
  year INTEGER, -- ano
  
  -- Métricas acumuladas
  questions_total INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  questions_wrong INTEGER DEFAULT 0,
  flashcards_total INTEGER DEFAULT 0,
  flashcards_reviewed INTEGER DEFAULT 0,
  summaries_read INTEGER DEFAULT 0,
  
  -- Scores calculados
  raw_score NUMERIC DEFAULT 0, -- soma simples
  quality_score NUMERIC DEFAULT 0, -- pontuação com pesos
  consistency_score NUMERIC DEFAULT 0, -- pontuação de consistência (0-100)
  final_score NUMERIC DEFAULT 0, -- score final ponderado
  
  -- Posição no ranking
  position INTEGER,
  position_previous INTEGER,
  position_change INTEGER DEFAULT 0, -- positivo = subiu, negativo = desceu
  
  -- Timestamps
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, course_id, period, week_number, month, year)
);

-- Tabela de disputas semanais
CREATE TABLE IF NOT EXISTS weekly_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  course_id INTEGER REFERENCES courses(id),
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- Metas da semana
  target_questions INTEGER DEFAULT 30,
  target_flashcards INTEGER DEFAULT 20,
  target_summaries INTEGER DEFAULT 3,
  min_accuracy NUMERIC DEFAULT 60, -- acurácia mínima %
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(course_id, week_number, year)
);

-- Participação em desafios semanais
CREATE TABLE IF NOT EXISTS challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES weekly_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Progresso da semana
  questions_done INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  flashcards_done INTEGER DEFAULT 0,
  summaries_done INTEGER DEFAULT 0,
  
  -- Scores
  weekly_score NUMERIC DEFAULT 0,
  accuracy NUMERIC DEFAULT 0,
  rank_position INTEGER,
  
  -- Badges conquistados
  badges JSONB DEFAULT '[]',
  
  -- Status
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(challenge_id, user_id)
);

-- Histórico de mudanças de posição (para notificações)
CREATE TABLE IF NOT EXISTS ranking_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id INTEGER,
  period VARCHAR(20) NOT NULL,
  week_number INTEGER,
  month INTEGER,
  year INTEGER,
  
  old_position INTEGER,
  new_position INTEGER,
  change_type VARCHAR(20), -- 'overtake', 'overtaken', 'podium_in', 'podium_out'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. ÍNDICES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ranking_global_period ON ranking_global(period, week_number, month, year);
CREATE INDEX IF NOT EXISTS idx_ranking_global_course ON ranking_global(course_id);
CREATE INDEX IF NOT EXISTS idx_ranking_global_score ON ranking_global(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_global_user ON ranking_global(user_id);

CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge ON challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user ON challenge_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_rank ON challenge_participants(weekly_score DESC);

-- ============================================
-- 3. POLÍTICAS RLS
-- ============================================

ALTER TABLE ranking_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_history ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver ranking
CREATE POLICY "Anyone can view ranking" ON ranking_global FOR SELECT USING (true);
CREATE POLICY "Anyone can view challenges" ON weekly_challenges FOR SELECT USING (true);
CREATE POLICY "Users can view own participation" ON challenge_participants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own history" ON ranking_history FOR SELECT USING (auth.uid() = user_id);

-- Admin pode tudo
CREATE POLICY "Admins manage ranking" ON ranking_global FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins manage challenges" ON weekly_challenges FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins manage participants" ON challenge_participants FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins manage history" ON ranking_history FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- 4. PERMISSÕES
-- ============================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ranking_global TO anon, authenticated;
GRANT ALL ON weekly_challenges TO anon, authenticated;
GRANT ALL ON challenge_participants TO anon, authenticated;
GRANT ALL ON ranking_history TO anon, authenticated;