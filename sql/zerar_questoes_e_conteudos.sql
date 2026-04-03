-- ==============================================================================
-- ATENÇÃO: ESTE SCRIPT TEM O PODER DE DESTRUIR CONTEÚDOS!
-- PENSE DUAS VEZES ANTES DE RODAR NO BANCO DE PRODUÇÃO!
-- ==============================================================================

-- 1) Apaga APENAS todo o banco de Questões, Flashcards e Resumos e zera sua numeração.
-- Isso também apaga automaticamente em cascata (CASCADE) qualquer histórico
-- do aluno de acerto ou erro daquelas questões e views de resumos.
TRUNCATE TABLE questions CASCADE;
TRUNCATE TABLE flashcards CASCADE;
TRUNCATE TABLE summaries CASCADE;

-- Zera as contagens de ID para começarem do 1 novamente para os conteúdos
ALTER SEQUENCE questions_id_seq RESTART WITH 1;
ALTER SEQUENCE flashcards_id_seq RESTART WITH 1;
ALTER SEQUENCE summaries_id_seq RESTART WITH 1;

-- 2) Se você quiser apagar TAMBÉM as Matérias, Temas e Bancas para limpar
-- os nomes bagunçados antigos, desccomente e rode as linhas abaixo:
-- TRUNCATE TABLE topics CASCADE;
-- TRUNCATE TABLE subjects CASCADE;
-- TRUNCATE TABLE exam_boards CASCADE;
-- ALTER SEQUENCE topics_id_seq RESTART WITH 1;
-- ALTER SEQUENCE subjects_id_seq RESTART WITH 1;
-- ALTER SEQUENCE exam_boards_id_seq RESTART WITH 1;

-- 3) Zera a contagem/experiência/progressos puramente numéricos dos usuários
UPDATE profiles SET 
    xp_total = 0, 
    level_number = 1, 
    streak_days = 0;

-- 4) Apaga produtividade diária
TRUNCATE TABLE daily_missions CASCADE;
TRUNCATE TABLE user_daily_productivity CASCADE;
