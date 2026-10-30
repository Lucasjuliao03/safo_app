-- Somente leitura. Execute depois do instalador; os indicadores devem ser true.
SELECT
  to_regprocedure('public.create_checkout_order(uuid,uuid,uuid)') IS NOT NULL AS checkout_instalado,
  to_regprocedure('public.record_payment_state(uuid,text,text,integer,integer,timestamptz,jsonb)') IS NOT NULL AS confirmacao_atomica_instalada,
  to_regprocedure('public.claim_payment_check(uuid,uuid)') IS NOT NULL AS recuperacao_instalada,
  to_regclass('safo_payments.transactions') IS NOT NULL AS historico_privado_instalado;

SELECT p.proname AS funcao,
  NOT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_bloqueado,
  NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS navegador_bloqueado,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS servidor_liberado
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('create_checkout_order','record_payment_state','claim_payment_check');

SELECT c.relname AS tabela,c.relrowsecurity AS rls_ativo,
  NOT has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') AS escrita_pelo_navegador_bloqueada,
  has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE') AS escrita_pelo_servidor_liberada
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('payment_orders','user_access_periods');

SELECT NOT EXISTS(SELECT 1 FROM public.payment_orders WHERE duration_days IS NULL OR duration_days<=0 OR plan_name IS NULL) AS pedidos_com_condicoes_salvas;
-- Resultado de operação: pode ser zero. Não contém dados pessoais.
SELECT count(*) AS pedidos_que_exigem_conferencia FROM public.payment_orders WHERE needs_review;
