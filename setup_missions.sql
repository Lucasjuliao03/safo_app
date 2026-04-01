-- ============================================
-- TABELA: daily_missions
-- Sistema de Missão Diária - COMPLETO
-- ============================================

-- Criar tabela se não existir
CREATE TABLE IF NOT EXISTS daily_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  questions_count INTEGER DEFAULT 0,
  flashcards_count INTEGER DEFAULT 0,
  summary_count INTEGER DEFAULT 0,
  questions_completed INTEGER DEFAULT 0,
  flashcards_completed INTEGER DEFAULT 0,
  summary_completed INTEGER DEFAULT 0,
  estimated_minutes INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, mission_date)
);

-- Adicionar colunas se não existirem (para atualizações)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_missions' AND column_name = 'questions_completed') THEN
    ALTER TABLE daily_missions ADD COLUMN questions_completed INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_missions' AND column_name = 'flashcards_completed') THEN
    ALTER TABLE daily_missions ADD COLUMN flashcards_completed INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_missions' AND column_name = 'summary_completed') THEN
    ALTER TABLE daily_missions ADD COLUMN summary_completed INTEGER DEFAULT 0;
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_daily_missions_user_date ON daily_missions(user_id, mission_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_missions_status ON daily_missions(user_id, status);

-- Habilitar RLS
ALTER TABLE daily_missions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own missions" ON daily_missions;
DROP POLICY IF EXISTS "Users can insert own missions" ON daily_missions;
DROP POLICY IF EXISTS "Users can update own missions" ON daily_missions;

-- Políticas RLS
CREATE POLICY "Users can view own missions" ON daily_missions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own missions" ON daily_missions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own missions" ON daily_missions FOR UPDATE USING (auth.uid() = user_id);

-- Permissões
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON daily_missions TO anon, authenticated;
