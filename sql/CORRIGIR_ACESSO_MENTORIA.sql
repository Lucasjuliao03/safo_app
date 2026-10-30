-- SAFO: execute este arquivo INTEIRO no SQL Editor do Supabase.
-- Corrige o 403 de can_access_subject sem alterar planos, dados ou limites.
BEGIN;
SET LOCAL lock_timeout = '2s';

-- These existing boolean functions are called by curriculum RLS policies.
-- Revoking their EXECUTE makes PostgREST reject otherwise authorized joins.
-- Keep their existing authorization bodies and all table policies unchanged.
DO $policy_helpers$
DECLARE helper record;
BEGIN
  FOR helper IN SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.prorettype='pg_catalog.bool'::regtype
      AND ((p.proname='can_access_subject' AND pg_catalog.oidvectortypes(p.proargtypes)='bigint')
        OR (p.proname='can_access_study_content' AND pg_catalog.oidvectortypes(p.proargtypes)='bigint, bigint'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',helper.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',helper.signature);
  END LOOP;
END;
$policy_helpers$;

NOTIFY pgrst,'reload schema';
COMMIT;
