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

Executar em CI e homologação:

```sh
npm ci
npm run check
npm audit --omit=dev
```

Fazer smoke test de login/logout, recuperação de senha, assinatura, webhook, acesso gratuito/premium, questões, flashcards, resumos, ranking, mentoria, patrulhamento, importação XLSX e push. Confirmar logs sem PII, alertas de erro, backups, retenção e procedimento de rollback.

## 6. Comercial e LGPD

Antes da venda, publicar Termos de Uso e Política de Privacidade revisados por profissional competente; definir controlador/operador, base legal, retenção, exportação e exclusão de dados, atendimento ao titular, resposta a incidentes, política de reembolso e canal de suporte. Formalizar contratos e obrigações dos fornecedores Supabase, Vercel e Mercado Pago.
