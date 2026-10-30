-- Somente leitura: identifica tabelas e sessões envolvidas em bloqueios.
-- Não cancela consultas nem encerra conexões.
SELECT c.oid,n.nspname AS esquema,c.relname AS tabela
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE c.oid IN (17674,20991)
ORDER BY c.oid;

SELECT a.pid,a.application_name,a.state,a.wait_event_type,a.wait_event,
  now()-a.xact_start AS tempo_da_transacao,pg_catalog.pg_blocking_pids(a.pid) AS bloqueada_por
FROM pg_catalog.pg_stat_activity a
WHERE a.datname=current_database() AND a.pid<>pg_backend_pid()
  AND (cardinality(pg_catalog.pg_blocking_pids(a.pid))>0 OR a.state LIKE 'idle in transaction%')
ORDER BY a.xact_start;

SELECT a.pid,a.application_name,n.nspname AS esquema,c.relname AS tabela,l.mode,l.granted
FROM pg_catalog.pg_locks l
JOIN pg_catalog.pg_class c ON c.oid=l.relation
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid
WHERE l.database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())
  AND l.pid<>pg_backend_pid() AND n.nspname IN ('public','safo_trial')
ORDER BY l.granted,a.pid,n.nspname,c.relname;
