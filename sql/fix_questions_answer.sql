-- ============================================
-- CORRIGIR GABARITO DE QUESTÕES IMPORTADAS INCORRETAMENTE
-- O bug convertia C->V para múltipla escolha (deveria só converter para true_false)
-- ============================================

-- 1. Corrige questões de múltipla escolha: V -> C (era para ser C mas virou V)
UPDATE questions 
SET correct_option = 'C'
WHERE format = 'multiple_choice' AND correct_option = 'V';

-- 2. Corrige questões de múltipla escolha: F -> E (era para ser E mas virou F)
UPDATE questions 
SET correct_option = 'E'
WHERE format = 'multiple_choice' AND correct_option = 'F';

-- Verificar resultado: mostrar todas as questões de múltipla escolha com gabarito
SELECT id, format, correct_option, 
       LEFT(statement, 40) as statement_preview,
       CASE 
         WHEN correct_option IN ('A','B','C','D','E') THEN 'OK'
         ELSE 'SEM GABARITO'
       END as status
FROM questions 
WHERE format = 'multiple_choice'
ORDER BY id DESC
LIMIT 30;