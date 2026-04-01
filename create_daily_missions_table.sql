-- ============================================
-- TABELA: daily_missions
-- Sistema de Missão Diária
-- ============================================

CREATE TABLE IF NOT EXISTS daily_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_date DATE NOT NULL, -- YYYY-MM-DD
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  questions_count INTEGER DEFAULT 0,
  flashcards_count INTEGER DEFAULT 0,
  summary_count INTEGER DEFAULT 0,
  estimated_minutes INTEGER DEFAULT 0,
  question_ids JSONB DEFAULT '[]',
  flashcard_ids JSONB DEFAULT '[]',
  summary_ids JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Uma missão por usuário por dia
  UNIQUE(user_id, mission_date)
);

-- Índice para buscar missão do dia
CREATE INDEX IF NOT EXISTS idx_daily_missions_user_date 
ON daily_missions(user_id, mission_date DESC);

-- Índice para status
CREATE INDEX IF NOT EXISTS idx_daily_missions_status 
ON daily_missions(user_id, status);

-- ============================================
-- FUNÇÃO: get_or_create_today_mission
-- Retorna ou cria a missão do dia
-- ============================================

CREATE OR REPLACE FUNCTION get_or_create_today_mission(p_user_id UUID)
RETURNS SETOF daily_missions AS $$
DECLARE
  v_mission daily_missions;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Tentar pegar missão existente
  SELECT * INTO v_mission
  FROM daily_missions
  WHERE user_id = p_user_id 
    AND mission_date = v_today;
  
  -- Se não existir, criar nova
  IF v_mission IS NULL THEN
    INSERT INTO daily_missions (user_id, mission_date, status)
    VALUES (p_user_id, v_today, 'pending')
    RETURNING * INTO v_mission;
  END IF;
  
  RETURN NEXT v_mission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO: start_mission
-- Marca missão como em progresso
-- ============================================

CREATE OR REPLACE FUNCTION start_mission(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE daily_missions
  SET status = 'in_progress',
      started_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND mission_date = CURRENT_DATE
    AND status = 'pending';
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO: complete_mission
-- Marca missão como concluída
-- ============================================

CREATE OR REPLACE FUNCTION complete_mission(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE daily_missions
  SET status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND mission_date = CURRENT_DATE
    AND status IN ('pending', 'in_progress');
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HABILITAR RLS
-- ============================================

ALTER TABLE daily_missions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view own missions"
ON daily_missions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own missions"
ON daily_missions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own missions"
ON daily_missions FOR UPDATE
USING (auth.uid() = user_id);

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON daily_missions TO anon;
GRANT ALL ON daily_missions TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_today_mission TO anon;
GRANT EXECUTE ON FUNCTION get_or_create_today_mission TO authenticated;
GRANT EXECUTE ON FUNCTION start_mission TO anon;
GRANT EXECUTE ON FUNCTION start_mission TO authenticated;
GRANT EXECUTE ON FUNCTION complete_mission TO anon;
GRANT EXECUTE ON FUNCTION complete_mission TO authenticated;
