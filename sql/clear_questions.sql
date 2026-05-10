-- ============================================
-- LIMPAR TODAS AS QUESTÕES DO BANCO
-- ============================================

-- Deletar todas as questões
DELETE FROM questions;

-- Opcional: Resetar o contador de ID para começar do 1 novamente
ALTER SEQUENCE questions_id_seq RESTART WITH 1;