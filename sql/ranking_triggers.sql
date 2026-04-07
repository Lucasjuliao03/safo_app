-- ============================================
-- FUNÇÃO PARA ATUALIZAR RANKING (Nova Fórmula)
-- qualityScore = acertos×10 + flashcards×8 + resumos×3 - erros×5
-- consistencyScore = dias únicos × 3
-- volumeScore = total atividades × 2
-- finalScore = quality + consistency + volume
-- ============================================

CREATE OR REPLACE FUNCTION refresh_ranking()
RETURNS void AS $$
DECLARE
  v_week_number INTEGER := EXTRACT(WEEK FROM CURRENT_DATE)::INTEGER;
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  v_week_start DATE := CURRENT_DATE - INTERVAL '7 days';
  v_user RECORD;
BEGIN
  -- Para cada usuário ativo, calcular e atualizar ranking
  FOR v_user IN
    SELECT id, course_id FROM profiles WHERE role = 'user' AND id IS NOT NULL
  LOOP
    -- Inserir ou atualizar ranking semanal
    INSERT INTO ranking_global (
      user_id, 
      course_id, 
      period, 
      week_number, 
      year,
      questions_total, 
      questions_correct, 
      questions_wrong,
      flashcards_total, 
      summaries_read,
      quality_score, 
      raw_score, 
      consistency_score, 
      final_score,
      updated_at
    )
    SELECT 
      v_user.id,
      v_user.course_id,
      'weekly',
      v_week_number,
      v_year,
      
      COALESCE(SUM(questions_answered), 0),
      COALESCE(SUM(questions_correct), 0),
      COALESCE(SUM(questions_wrong), 0),
      COALESCE(SUM(flashcards_reviewed), 0),
      COALESCE(SUM(summaries_read), 0),
      
      -- quality_score: acertos×10 + flashcards×8 + resumos×3 - erros×5
      GREATEST(0, 
        COALESCE(SUM(questions_correct), 0) * 10 +
        COALESCE(SUM(flashcards_reviewed), 0) * 8 +
        COALESCE(SUM(summaries_read), 0) * 3 -
        COALESCE(SUM(questions_wrong), 0) * 5
      ),
      
      -- raw_score: total de atividades
      COALESCE(SUM(questions_answered), 0) +
      COALESCE(SUM(flashcards_reviewed), 0) +
      COALESCE(SUM(summaries_read), 0),
      
      -- consistency_score: dias únicos × 3
      COUNT(DISTINCT productivity_date) * 3,
      
      -- final_score: quality + consistency + volume
      GREATEST(0, 
        COALESCE(SUM(questions_correct), 0) * 10 +
        COALESCE(SUM(flashcards_reviewed), 0) * 8 +
        COALESCE(SUM(summaries_read), 0) * 3 -
        COALESCE(SUM(questions_wrong), 0) * 5
      ) +
      (COUNT(DISTINCT productivity_date) * 3) +
      ((COALESCE(SUM(questions_answered), 0) + COALESCE(SUM(flashcards_reviewed), 0) + COALESCE(SUM(summaries_read), 0)) * 2),
      
      NOW()
    FROM user_daily_productivity
    WHERE user_id = v_user.id
      AND productivity_date >= v_week_start
    ON CONFLICT (user_id, period, week_number, year)
    DO UPDATE SET
      questions_total = EXCLUDED.questions_total,
      questions_correct = EXCLUDED.questions_correct,
      questions_wrong = EXCLUDED.questions_wrong,
      flashcards_total = EXCLUDED.flashcards_total,
      summaries_read = EXCLUDED.summaries_read,
      quality_score = EXCLUDED.quality_score,
      raw_score = EXCLUDED.raw_score,
      consistency_score = EXCLUDED.consistency_score,
      final_score = EXCLUDED.final_score,
      updated_at = NOW();
  END LOOP;
  
  -- Atualizar posições
  UPDATE ranking_global r
  SET position = sub.position,
      position_change = COALESCE(r.position, 0) - sub.position
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY final_score DESC) as position
    FROM ranking_global
    WHERE period = 'weekly'
      AND week_number = v_week_number
      AND year = v_year
  ) sub
  WHERE r.id = sub.id;
  
  RAISE NOTICE 'Ranking atualizado com sucesso';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GATILHO PARA NOTIFICAÇÕES
-- ============================================

CREATE OR REPLACE FUNCTION notify_ranking_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_message TEXT;
BEGIN
  IF NEW.position_change < 0 AND OLD.position <= 3 AND NEW.position > 3 THEN
    v_user_id := NEW.user_id;
    v_message := 'Você saiu do pódio! Agora está na posição ' || NEW.position;
    INSERT INTO notifications (user_id, type, title, message, created_at)
    VALUES (v_user_id, 'ranking', 'Ranking', v_message, NOW())
    ON CONFLICT DO NOTHING;
  ELSIF NEW.position_change < 0 AND OLD.position > 3 AND NEW.position <= 3 THEN
    v_user_id := NEW.user_id;
    v_message := 'Parabéns! Você entrou no pódio! Está na posição ' || NEW.position;
    INSERT INTO notifications (user_id, type, title, message, created_at)
    VALUES (v_user_id, 'ranking', 'Ranking', v_message, NOW())
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ranking_change_trigger ON ranking_global;
CREATE TRIGGER ranking_change_trigger
AFTER UPDATE ON ranking_global
FOR EACH ROW
EXECUTE FUNCTION notify_ranking_changes();