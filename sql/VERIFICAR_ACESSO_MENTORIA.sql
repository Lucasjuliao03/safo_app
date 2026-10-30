-- Somente leitura. As funções listadas devem retornar true nas verificações.
SELECT
  to_regprocedure('public.can_access_subject(bigint)') IS NOT NULL AS regra_de_materia_existe,
  to_regprocedure('public.can_access_study_content(bigint,bigint)') IS NOT NULL AS regra_de_conteudo_existe;

SELECT p.oid::regprocedure AS funcao,
  p.prorettype='pg_catalog.bool'::regtype AS retorna_somente_booleano,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS aluno_pode_usar_a_regra,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS servidor_pode_usar_a_regra,
  NOT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_continua_bloqueado
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('can_access_subject','can_access_study_content');

-- As restrições globais da mentoria devem continuar ativas.
SELECT c.relname AS tabela,c.relrowsecurity AS rls_ativo,
  EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='app_access_required' AND NOT p.polpermissive) AS bloqueio_global_preservado
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('mentoria_alunos','mentoria_diagnosticos','mentoria_estrategias','mentoria_tarefas_diarias');
