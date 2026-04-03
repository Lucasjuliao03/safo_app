-- =========================================================================
-- SCRIPT DE RESET / LIMPEZA TOTAL (INICIAR O SISTEMA DO ZERO)
-- AVISO: Estas ações são IRREVERSÍVEIS. 
-- =========================================================================

-- 1. APAGAR CONTEÚDOS DE ESTUDO E ESTATÍSTICAS
-- O comando CASCADE apagará automaticamente todas as respostas, estatísticas 
-- e vínculos amarrados a essas questões, flashcards e resumos.
TRUNCATE TABLE 
  questions, 
  flashcards, 
  summaries 
RESTART IDENTITY CASCADE;

-- 2. ZERAR O PROGRESSO DE TODOS OS USUÁRIOS
-- Limpa todo o histórico de dor, acertos, erros e cliques dos alunos.
TRUNCATE TABLE 
  user_daily_productivity, 
  user_question_stats,
  question_attempts,
  user_xp_logs,
  user_achievements,
  user_flashcard_reviews,
  flashcard_review_logs
RESTART IDENTITY CASCADE;

-- 3. (OPCIONAL) APAGAR ALUNOS E SUAS CONTAS
-- Se quiser realmente excluir as contas dos alunos mantendo apenas o dos Administradores:
DELETE FROM profiles WHERE role != 'admin';
-- Obs: Para deletar os logins permanentemente, exclua-os visualmente pela aba "Authentication" do seu Supabase.

-- 4. (OPCIONAL) APAGAR MATÉRIAS, TEMAS E BANCAS
-- Só rode essas 3 linhas caso você TAMBÉM queira apagar toda a categorização (subjects, topics).
-- TRUNCATE TABLE topics RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE subjects RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE exam_boards RESTART IDENTITY CASCADE;

-- 5. ZERAR PATENTES E LEVEL
UPDATE profiles SET xp_total = 0, streak_days = 0, level_number = 1;
