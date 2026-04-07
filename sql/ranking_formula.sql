-- ============================================
-- FÓRMULA DE PONTUAÇÃO DO RANKING (Versão Simples)
-- ============================================

/*
==============================================================================
FÓRMULA FINAL DE SCORE:
qualityScore = acertos×10 + flashcards×8 + resumos×3 - erros×5
consistencyScore = dias únicos × 3
volumeScore = total atividades × 2
finalScore = quality + consistency + volume
==============================================================================
*/

-- Procedure para calcular score de um usuário
CREATE OR REPLACE FUNCTION calculate_user_score(
  p_user_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  quality_score NUMERIC,
  consistency_score NUMERIC,
  volume_score NUMERIC,
  final_score NUMERIC,
  questions_total INTEGER,
  questions_correct INTEGER,
  flashcards_total INTEGER,
  summaries_read INTEGER
) AS $$
DECLARE
  v_questions_total INTEGER := 0;
  v_questions_correct INTEGER := 0;
  v_questions_wrong INTEGER := 0;
  v_flashcards_total INTEGER := 0;
  v_summaries_read INTEGER := 0;
  v_days_studied INTEGER := 0;
  
  v_quality_score NUMERIC := 0;
  v_consistency_score NUMERIC := 0;
  v_volume_score NUMERIC := 0;
  v_final_score NUMERIC := 0;
BEGIN
  -- Buscar métricas do período
  SELECT 
    COALESCE(SUM(questions_answered), 0),
    COALESCE(SUM(questions_correct), 0),
    COALESCE(SUM(questions_wrong), 0),
    COALESCE(SUM(flashcards_reviewed), 0),
    COALESCE(SUM(summaries_read), 0),
    COUNT(DISTINCT productivity_date)
  INTO 
    v_questions_total,
    v_questions_correct,
    v_questions_wrong,
    v_flashcards_total,
    v_summaries_read,
    v_days_studied
  FROM user_daily_productivity
  WHERE user_id = p_user_id
    AND productivity_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL;
  
  -- Calcular quality_score (acertos×10 + flashcards×8 + resumos×3 - erros×5)
  v_quality_score := GREATEST(0, 
    (v_questions_correct * 10) + 
    (v_flashcards_total * 8) + 
    (v_summaries_read * 3) - 
    (v_questions_wrong * 5)
  );
  
  -- Calcular consistency_score (dias únicos × 3)
  v_consistency_score := v_days_studied * 3;
  
  -- Calcular volume_score (total atividades × 2)
  v_volume_score := (v_questions_total + v_flashcards_total + v_summaries_read) * 2;
  
  -- Calcular final_score (soma simples)
  v_final_score := v_quality_score + v_consistency_score + v_volume_score;
  
  RETURN QUERY SELECT 
    v_quality_score,
    v_consistency_score,
    v_volume_score,
    v_final_score,
    v_questions_total,
    v_questions_correct,
    v_flashcards_total,
    v_summaries_read;
END;
$$ LANGUAGE plpgsql;

-- View simples para ranking
CREATE OR REPLACE VIEW v_ranking AS
SELECT 
  r.user_id,
  r.course_id,
  r.questions_total,
  r.questions_correct,
  r.questions_wrong,
  r.flashcards_total,
  r.summaries_read,
  r.quality_score,
  r.consistency_score,
  r.final_score,
  CASE 
    WHEN r.questions_total > 0 
    THEN ROUND((r.questions_correct::NUMERIC / r.questions_total) * 100, 1)
    ELSE 0 
  END as accuracy,
  r.position
FROM ranking_global r
WHERE r.period = 'weekly'
  AND r.week_number = EXTRACT(WEEK FROM CURRENT_DATE)::INTEGER
  AND r.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
ORDER BY r.final_score DESC;