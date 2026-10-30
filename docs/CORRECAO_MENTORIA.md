# Correção da leitura do plano de mentoria

No projeto `melyesnqvbatmpxvotwc`, a reprodução com uma conta temporária autenticada identificou:

- A leitura de `mentoria_tarefas_diarias` sem relacionamento retornava 200.
- A leitura com `subjects(name)` retornava 403 / `42501`: `permission denied for function can_access_subject`.
- A leitura de `subjects` apresentava o mesmo erro. Diagnóstico e status da mentoria eram consultáveis.

A migração de bloqueio global revogava a execução de funções elevadas, incluindo os helpers booleanos já usados pelas políticas de matérias. A consulta falhava mesmo para um aluno com acesso e dez usos disponíveis. As alterações preservam os corpos dessas funções e todas as políticas de propriedade, curso e acesso global.

## Aplicar em produção

1. No SQL Editor do Supabase, execute inteiro `sql/CORRIGIR_ACESSO_MENTORIA.sql`.
2. Execute `sql/VERIFICAR_ACESSO_MENTORIA.sql`. As funções devem existir e os indicadores devem ser `true`.
3. Publique o frontend atualizado e recarregue o app. A correção SQL também atende ao cliente antigo que faz a consulta com `subjects(name)`.

O SQL concede execução somente às assinaturas booleanas `can_access_subject(bigint)` e `can_access_study_content(bigint,bigint)` para `authenticated` e `service_role`. O acesso anônimo permanece sem execução. As tarefas já salvas são preservadas.

A tela agora distingue falha de carregamento de uma agenda vazia. Falhas de permissão deixam de receber tentativas automáticas repetidas. Datas de geração, limpeza de tarefas futuras e seleção diária usam o dia de estudo de Brasília, inclusive após a virada de UTC.

## Instalações e verificações futuras

A lista de exceções da migração `20261030012116_global_app_access_gate.sql` foi corrigida para preservar esses helpers booleanos. O instalador completo de estudos também inclui a restauração de execução, evitando reintroduzir o problema. Para a correção pontual de uma instalação existente, use o arquivo de mentoria acima.

O código-fonte do reparo é `supabase/migrations/20261030040701_restore_curriculum_policy_helpers.sql`. Para gerar o arquivo que vai ao SQL Editor: `node scripts/build-mentoria-sql.mjs`. Acrescente `--check` para verificar sincronização. O instalador de estudos é atualizado com `node scripts/build-study-sql.mjs`.

Os testes PostgreSQL reproduzem a falha do relacionamento, verificam a recuperação sem recriar o plano e comprovam que outros alunos, contas expiradas e o teste esgotado continuam restritos. Sobrecargas que retornam dados, em vez de booleanos, continuam sem execução pelo aluno. A conta usada na reprodução no Supabase foi desconectada e apagada; não foram modificadas contas reais.
