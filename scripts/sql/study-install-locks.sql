-- BEGIN STUDY INSTALL LOCK GUARD
-- Claim the strongest required locks before any reads or schema changes.
-- NOWAIT aborts cleanly if live traffic already owns an incompatible lock;
-- it does not queue behind that traffic while holding other table locks.
SET LOCAL lock_timeout = '2s';
DO $study_install_lock$
DECLARE target regclass;
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(208740901, 1) THEN
    RAISE EXCEPTION USING ERRCODE = '55P03',
      MESSAGE = 'Outra instalação de estudos já está em execução.',
      HINT = 'Aguarde a outra execução terminar e rode o arquivo inteiro novamente em uma única aba.';
  END IF;

  FOR target IN
    SELECT c.oid::regclass FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p') AND (
      (n.nspname = 'public' AND c.relname IN (
        'profiles','questions','flashcards','summaries','question_attempts','user_question_stats',
        'user_flashcard_reviews','flashcard_review_logs','user_daily_productivity',
        'user_xp_logs','user_summary_views','user_achievements','daily_missions'
      )) OR (n.nspname = 'safo_trial' AND c.relname IN (
        'study_trial_quota','study_trial_events','summary_read_events','achievement_rules'
      ))
    )
    ORDER BY n.nspname,c.relname
  LOOP
    BEGIN
      EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE NOWAIT',target);
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION USING ERRCODE = '55P03',
        MESSAGE = format('Instalação adiada: a tabela %s está em uso. Nenhuma alteração desta instalação foi aplicada.',target),
        HINT = 'Feche as abas do app e outras consultas SQL, aguarde alguns segundos e execute o arquivo inteiro novamente em uma única aba.';
    END;
  END LOOP;
END;
$study_install_lock$;
-- END STUDY INSTALL LOCK GUARD
