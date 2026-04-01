-- ============================================
-- ATUALIZAR TABELA: daily_missions
-- Adicionar campos de progresso
-- ============================================

-- Adicionar colunas de progresso se não existirem
ALTER TABLE daily_missions 
ADD COLUMN IF NOT EXISTS questions_completed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS flashcards_completed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS summary_completed INTEGER DEFAULT 0;

-- Atualizar função para criar missão com contadores
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
    INSERT INTO daily_missions (
      user_id, 
      mission_date, 
      status,
      questions_count,
      flashcards_count,
      summary_count,
      questions_completed,
      flashcards_completed,
      summary_completed,
      estimated_minutes
    )
    SELECT 
      p_user_id,
      v_today,
      'pending',
      COALESCE(q.count, 10)::INTEGER,
      COALESCE(f.count, 5)::INTEGER,
      1,
      0,
      0,
      0,
      20
    FROM 
      (SELECT COUNT(*) as count FROM questions WHERE is_active = true AND status = 'published' LIMIT 10) q,
      (SELECT COUNT(*) as count FROM flashcards WHERE is_active = true LIMIT 5) f
    RETURNING * INTO v_mission;
  END IF;
  
  RETURN NEXT v_mission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO: atualizar progresso da missão
-- ============================================
CREATE OR REPLACE FUNCTION update_mission_progress(
  p_user_id UUID,
  p_step VARCHAR,
  p_completed INTEGER
)
RETURNS VOID AS $$
BEGIN
  IF p_step = 'questions' THEN
    UPDATE daily_missions 
    SET questions_completed = p_completed,
        updated_at = NOW()
    WHERE user_id = p_user_id 
      AND mission_date = CURRENT_DATE;
      
  ELSIF p_step = 'flashcards' THEN
    UPDATE daily_missions 
    SET flashcards_completed = p_completed,
        updated_at = NOW()
    WHERE user_id = p_user_id 
      AND mission_date = CURRENT_DATE;
      
  ELSIF p_step = 'summary' THEN
    UPDATE daily_missions 
    SET summary_completed = p_completed,
        updated_at = NOW()
    WHERE user_id = p_user_id 
      AND mission_date = CURRENT_DATE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO: verificar se missão está completa
-- ============================================
CREATE OR REPLACE FUNCTION check_mission_complete(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_mission daily_missions;
BEGIN
  SELECT * INTO v_mission
  FROM daily_missions
  WHERE user_id = p_user_id 
    AND mission_date = CURRENT_DATE;
  
  IF v_mission IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar se todos os itens foram completados
  RETURN (
    (v_mission.questions_count <= v_mission.questions_completed OR v_mission.questions_count = 0) AND
    (v_mission.flashcards_count <= v_mission.flashcards_completed OR v_mission.flashcards_count = 0) AND
    (v_mission.summary_count <= v_mission.summary_completed OR v_mission.summary_count = 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Conceder permissões
-- ============================================
GRANT EXECUTE ON FUNCTION update_mission_progress TO anon;
GRANT EXECUTE ON FUNCTION update_mission_progress TO authenticated;
GRANT EXECUTE ON FUNCTION check_mission_complete TO anon;
GRANT EXECUTE ON FUNCTION check_mission_complete TO authenticated;
