# Publicação em produção

Esta versão preserva os fluxos e a interface, mas só deve receber tráfego real depois desta sequência.

## 1. Credenciais

1. Revogar e recriar todas as credenciais que já estiveram no `.env` ou no histórico Git: Supabase service role/anon quando aplicável, Mercado Pago, VAPID e qualquer token auxiliar.
2. Configurar os novos valores no ambiente de produção, nunca no repositório.
3. Definir `APP_URL` com a origem HTTPS exata, sem barra final.
4. Separar credenciais de homologação e produção.

Variáveis obrigatórias do servidor estão documentadas em `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `CRON_SECRET` nunca podem usar prefixo `VITE_`.

## 2. Banco de dados

1. Fazer backup e testar restauração.
2. Aplicar `supabase/migrations/20260831010000_production_security_baseline.sql` primeiro em homologação.
3. Aplicar `supabase/migrations/20260907010000_security_advisor_remediation.sql` para habilitar RLS em conquistas e tornar as views `security_invoker`.
4. Reexecutar o Supabase Security Advisor e confirmar que os quatro alertas foram removidos.
5. Validar contas de aluno gratuito, assinante, expirado e administrador, incluindo ranking, apelidos e conquistas.
6. Aplicar em produção em janela controlada.

A migration restringe dados pessoais, impede autoelevação de privilégio, fecha RPCs financeiras públicas, adiciona idempotência/reversão de pagamentos e protege conteúdo premium no banco.

## 3. Mercado Pago

1. Cadastrar o endpoint HTTPS `/api/payments/webhook` no painel e habilitar assinatura secreta.
2. Copiar a assinatura para `MERCADO_PAGO_WEBHOOK_SECRET`.
3. Se disponível, definir `MERCADO_PAGO_COLLECTOR_ID` e `MERCADO_PAGO_LIVE_MODE=true` em produção.
4. Testar aprovação duplicada, pagamento rejeitado, estorno e chargeback. O endpoint deve responder 2xx apenas após processar com sucesso.

## 4. Push e tarefas agendadas

1. Definir `APP_URL`, `CRON_SECRET` e credenciais VAPID nas Edge Functions.
2. Guardar o segredo do cron no Supabase Vault com o nome `push_cron_secret`.
3. Instalar os jobs de `sql/create_push_cron_jobs.sql` somente depois do Vault.
4. Confirmar que chamadas sem autorização retornam 401/403.

## 5. Gate de lançamento

### Catálogo completo e degustação de dez usos

Para corrigir instalações existentes, abra o SQL Editor do projeto `melyesnqvbatmpxvotwc` e execute **o arquivo inteiro** [INSTALAR_CORRECAO_ESTUDOS.sql](../sql/INSTALAR_CORRECAO_ESTUDOS.sql). Ele instala os helpers de autorização, o contador privado e a persistência de estudo em uma transação, sem apagar histórico nem zerar os usos existentes. Pode ser reexecutado. Se houver registros duplicados impedindo índices únicos, a instalação será desfeita; preserve os dados e investigue as duplicidades antes de tentar novamente.

Execute em uma única aba, com o app fechado e sem outras consultas SQL em execução. O instalador agora adquire todos os bloqueios necessários antes de ler ou alterar dados, sem esperar por tabelas ocupadas. Um bloqueio consultivo também impede duas instalações simultâneas. Se retornar `55P03` com "Instalação adiada", nenhuma alteração dessa tentativa foi aplicada: aguarde alguns segundos e execute o arquivo inteiro novamente. Não execute fragmentos nem duas cópias em paralelo. A instalação anterior que retornou `40P01` foi abortada pelo PostgreSQL e, quando o arquivo inteiro foi executado como instruído, não deve ter deixado alterações parciais.

Se continuar ocupado, execute [DIAGNOSTICAR_BLOQUEIOS_ESTUDOS.sql](../sql/DIAGNOSTICAR_BLOQUEIOS_ESTUDOS.sql) para identificar as sessões envolvidas. Essa consulta é somente leitura e não encerra conexões. Os testes embarcados validam o SQL e o rollback; como o PGlite usa um único backend, não substituem um ensaio de contenção entre múltiplas conexões no Supabase.

Depois execute [VERIFICAR_CORRECAO_ESTUDOS.sql](../sql/VERIFICAR_CORRECAO_ESTUDOS.sql). As verificações devem retornar `true`, incluindo as quatro funções e o bloqueio de gravações diretas pelo navegador. Em seguida publique o **código atualizado completo** na Vercel, com `api/`, `server/`, `src/` e `vercel.json`. Não basta executar o SQL e continuar usando o bundle antigo, que ainda tenta inserir em `question_attempts` pelo navegador.

O instalador reúne `20261029214747_enforce_lifetime_trial.sql` e `20261030004029_atomic_study_progress.sql`. Gere novamente com `node scripts/build-study-sql.mjs` após editar essas migrations; `node scripts/build-study-sql.mjs --check` verifica se o arquivo está sincronizado. Projetos gerenciados por migrations devem aplicar as duas na ordem. Não é necessário reaplicar migrations financeiras para essa correção.

As variáveis de servidor obrigatórias são `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (ou `VITE_SUPABASE_ANON_KEY`) e `APP_URL`, apontando para o mesmo projeto/origem do frontend. Sem as funções, `/api/study` retorna 503 com `study_setup_required`; não há fallback que conceda acesso extra.

O catálogo mostra todas as questões/flashcards do curso e edital, sem gabaritos, explicações ou versos. Confirmar uma questão ou revelar um flashcard consome um dos dez usos combinados, na vida toda da conta. Navegar e selecionar não consomem. Resumos mantêm o limite de dois já existente. Após dez usos, somente a ativação administrativa/assinatura vigente libera novas correções/revelações.

A API autentica o usuário, usa somente o ID da sessão, valida o conteúdo no banco e chama uma função disponível apenas à service role. Requisições simultâneas são serializadas por conta; reenviar o mesmo requestId e conteúdo não cobra novamente nem permite escolher outro item com o mesmo requestId. Trocar curso, aba, navegador, limpar storage ou alterar produtividade não zera a quota privada.

Confirmar uma questão grava, na mesma transação, quota, tentativa, estatísticas, XP, produtividade, sequência, missão e conquistas. Se qualquer gravação falhar, tudo é desfeito. A avaliação do flashcard usa o mesmo requestId da revelação, pode salvar a décima revisão sem consumir um 11º uso e só avança após salvar. Resumos têm persistência própria e os dois resumos gratuitos continuam disponíveis para releitura. O ranking lê a produtividade atual com datas de Brasília, sem depender de um snapshot antigo de `ranking_global`.

Executar os testes de PostgreSQL local em `src/test/trial-postgres.test.ts`. Depois de aplicar a migração, validar com conta temporária: catálogo inteiro, dez usos combinados, 11º bloqueado, login novamente ainda bloqueado e ativação liberando novo uso. Não publicar apenas o frontend antes de preparar o banco.

Publicar a raiz do repositório na Vercel (preset Vite), incluindo `api/`, `server/` e `vercel.json`; enviar somente `dist/` publica apenas o frontend. O arquivo `api/content.ts` é a Function estática para a qual as rotas `/api/content/:type` são reescritas.

Conferir o deploy com `GET /api/health` (200 JSON) e `GET /api/content/questions` sem sessão (401 JSON). Se o segundo retornar `200 text/html`, o deploy está atendendo a API pelo fallback da SPA. O funcionamento local com o Supabase não substitui essa verificação na URL publicada.

Executar em CI e homologação:

```sh
npm ci
npm run check
npm audit --omit=dev
```

Fazer smoke test de login/logout, recuperação de senha, assinatura, webhook, acesso gratuito/premium, questões, flashcards, resumos, ranking, mentoria, patrulhamento, importação XLSX e push. Confirmar logs sem PII, alertas de erro, backups, retenção e procedimento de rollback.

## 6. Comercial e LGPD

Antes da venda, publicar Termos de Uso e Política de Privacidade revisados por profissional competente; definir controlador/operador, base legal, retenção, exportação e exclusão de dados, atendimento ao titular, resposta a incidentes, política de reembolso e canal de suporte. Formalizar contratos e obrigações dos fornecedores Supabase, Vercel e Mercado Pago.
