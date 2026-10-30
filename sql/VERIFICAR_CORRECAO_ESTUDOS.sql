-- Somente leitura. Execute depois do instalador. Todos os resultados devem ser true.
SELECT
  to_regprocedure('public.get_study_access(uuid)') IS NOT NULL AS acesso_instalado,
  to_regprocedure('public.complete_study_use(uuid,uuid,text,bigint,text)') IS NOT NULL AS confirmacao_atomica_instalada,
  to_regprocedure('public.record_study_review(uuid,uuid,bigint,text)') IS NOT NULL AS revisao_flashcard_instalada,
  to_regprocedure('public.record_summary_read(uuid,uuid,bigint)') IS NOT NULL AS leitura_resumo_instalada,
  to_regclass('safo_trial.study_trial_quota') IS NOT NULL AS quota_privada_instalada;

SELECT p.proname AS funcao,
  NOT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_bloqueado,
  NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS chamada_direta_bloqueada,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS servidor_liberado
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN('get_study_access','complete_study_use','record_study_review','record_summary_read');

SELECT c.relname AS tabela,
  NOT has_table_privilege('authenticated',c.oid,'INSERT') AS gravacao_direta_bloqueada,
  has_table_privilege('service_role',c.oid,'INSERT') AS gravacao_pelo_servidor_liberada
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN('question_attempts','user_question_stats','user_flashcard_reviews','user_daily_productivity');

-- Comprova que todas as contas existentes têm quota, sem expor nomes ou dados pessoais.
SELECT NOT EXISTS (
  SELECT 1 FROM public.profiles p LEFT JOIN safo_trial.study_trial_quota q ON q.user_id=p.id WHERE q.user_id IS NULL
) AS todas_as_contas_com_quota;

SELECT
  to_regprocedure('safo_trial.can_use_app()') IS NOT NULL AS bloqueio_global_instalado,
  NOT has_table_privilege('authenticated','safo_trial.study_trial_quota','UPDATE') AS contador_protegido,
  NOT has_table_privilege('authenticated','profiles','INSERT') AS recriacao_de_perfil_bloqueada;

SELECT c.relname AS tabela,
  c.relrowsecurity AS rls_ativo,
  NOT p.polpermissive AS bloqueio_restritivo,
  pg_get_expr(p.polqual,p.polrelid) LIKE '%can_use_app%' AS verifica_quota_no_banco
FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND p.polname='app_access_required'
ORDER BY c.relname;
