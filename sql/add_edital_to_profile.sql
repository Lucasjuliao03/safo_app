-- ====================================================================================
-- ADICIONA VÍNCULO EXPLÍCITO DO ALUNO AO EDITAL
-- ====================================================================================

-- 1. Adiciona a coluna na tabela principal de perfis
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS edital_id BIGINT REFERENCES public.edicts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.edital_id IS 'Edital atual que o aluno está focado. Define quais leis e normas aparecem no sistema.';

-- 2. Gatilho (Trigger) para auto-atribuir o edital quando o curso é mudado, caso o aluno não tenha um
CREATE OR REPLACE FUNCTION public.fn_auto_assign_recent_edital()
RETURNS TRIGGER AS $$
DECLARE
  v_recent_edital_id BIGINT;
BEGIN
  -- Se o curso mudou (ou foi definido agora) e o edital_id está nulo
  IF NEW.course_id IS NOT NULL AND (OLD.course_id IS NULL OR NEW.course_id <> OLD.course_id OR NEW.edital_id IS NULL) THEN
    -- Busca o edital ativo mais recente para este curso
    SELECT id INTO v_recent_edital_id
    FROM public.edicts
    WHERE course_id = NEW.course_id AND is_active = true
    ORDER BY year DESC
    LIMIT 1;
    
    IF FOUND THEN
      NEW.edital_id := v_recent_edital_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_assign_edital_on_course_change ON public.profiles;
CREATE TRIGGER trg_auto_assign_edital_on_course_change
  BEFORE INSERT OR UPDATE OF course_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_assign_recent_edital();
