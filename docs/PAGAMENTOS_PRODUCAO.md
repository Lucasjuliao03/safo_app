# Ativação dos pagamentos e do acesso automático

O código usa Checkout Pro via Preferences API: uma compra concede o período contratado, com renovação manual. Não existe débito recorrente automático. O retorno do navegador nunca autoriza acesso por conta própria.

## 1. SQL no Supabase

No projeto `melyesnqvbatmpxvotwc`, abra o SQL Editor e execute **o arquivo inteiro** `sql/INSTALAR_CORRECAO_PAGAMENTOS.sql`, em uma única aba. Ele pressupõe a correção de estudos já instalada. Caso ainda não esteja, execute antes `sql/INSTALAR_CORRECAO_ESTUDOS.sql`. Ao reaplicar ambos, mantenha sempre esta ordem: estudos, depois pagamentos.

O instalador preserva compras e os usos do teste. Se uma tabela estiver ocupada, retorna `55P03` antes das alterações: feche o app e outras consultas, aguarde e execute novamente. Não execute fragmentos em paralelo. Duplicidades que impeçam os índices precisam ser examinadas; o instalador não apaga os registros.

Depois execute `sql/VERIFICAR_CORRECAO_PAGAMENTOS.sql`. As colunas de verificação devem retornar `true`; a contagem de pedidos que exigem conferência pode ser zero. Mantenha os planos reais ativos, com preço em centavos e duração positiva. Nenhum preço foi escolhido ou alterado por esta correção.

O arquivo é gerado de `supabase/migrations/20261030020232_secure_payment_lifecycle.sql`. Para sincronizar: `node scripts/build-payment-sql.mjs`; para conferir: acrescente `--check`. Não reaplique o antigo `sql/create_payment_system.sql`, que define regras superadas.

## 2. Variáveis na Vercel

Em **safo-app → Settings → Environment Variables**, configure o ambiente **Production** e publique um novo deployment depois de salvar:

| Variável | Valor |
| --- | --- |
| `APP_URL` | `https://safo-app.vercel.app` ou a origem HTTPS canônica real do app |
| `SUPABASE_URL` | `https://melyesnqvbatmpxvotwc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta de servidor desse projeto |
| `SUPABASE_ANON_KEY` | Chave pública desse projeto; o código aceita `VITE_SUPABASE_ANON_KEY` como alternativa |
| `VITE_SUPABASE_URL` | A mesma URL do Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave pública desse projeto para o frontend |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token de produção da aplicação Mercado Pago correta |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Assinatura secreta de Webhooks dessa aplicação |
| `MERCADO_PAGO_COLLECTOR_ID` | ID numérico da conta vendedora que recebe o pagamento; não é o App ID |
| `MERCADO_PAGO_LIVE_MODE` | `true` |

Access Token, webhook secret e service role são variáveis secretas de servidor; nunca use prefixo `VITE_` nelas. Uma chave pública do Mercado Pago não é necessária para este fluxo de redirect. Preview deve usar uma integração de teste isolada, `MERCADO_PAGO_LIVE_MODE=false` e uma URL HTTPS pública própria. A produção rejeita essa configuração de teste.

Publique o código completo: `api/`, `server/`, `src/`, `vercel.json`, `package.json` e lockfile. A rota nova é `/api/payments/status`; não pode ser redirecionada para `index.html`. Depois abra o app atualizado, usando Ctrl+Shift+R se houver uma versão antiga no PWA.

## 3. Aplicação no Mercado Pago

1. Em **Suas integrações**, abra a aplicação correspondente ao Access Token e à conta recebedora do Brasil.
2. Ative as credenciais de produção e confirme que a conta está habilitada para receber pagamentos.
3. Em **Webhooks**, configure a URL de produção `https://safo-app.vercel.app/api/payments/webhook` e selecione **Pagamentos (`payment`)**. Use a origem canônica de `APP_URL` se houver domínio próprio.
4. Salve e copie a **assinatura secreta** para `MERCADO_PAGO_WEBHOOK_SECRET` na Vercel. Não use o Client Secret nesse campo.
5. Confira o ID da conta recebedora com `GET https://api.mercadopago.com/users/me`, autenticado com o mesmo Access Token. O script `node scripts/check-payments.mjs --live` faz essa consulta sem criar cobranças e mostra `collectorId` quando a credencial tem acesso.
6. Confira no monitor de Webhooks os envios de `payment.created`/`payment.updated`. Um evento real deve resultar em HTTP 200 depois de salvo. O simulador pode usar um ID fictício, que não serve como prova de liberação real.

As URLs de retorno são enviadas automaticamente na preferência, vinculadas ao pedido: `/pagamento/sucesso`, `/pagamento/pendente` e `/pagamento/falhou`. Não é necessário configurá-las como webhook. O backend exige assinatura válida e consulta `/v1/payments/{id}` antes de confiar no estado notificado.

## 4. Regras de liberação e bloqueio

- Só um pagamento `approved`, com valor, moeda BRL, recebedor e ambiente corretos, cria acesso. `pending`, `in_process` e `authorized` não liberam.
- Preço, nome e duração ficam salvos no pedido. Alterar um plano não muda o contrato de um checkout já reservado. Pedidos históricos anteriores à correção podem não ter todas as condições originais recuperáveis; as datas de acesso existentes são preservadas durante a instalação.
- A confirmação e a concessão de acesso são uma transação. Reenvio do mesmo pagamento não soma dias outra vez. Renovações distintas são serializadas por conta e acumulam o prazo restante.
- Duas aprovações reais do mesmo pedido geram `needs_review=true`, sem duplicar o período. O sistema não emite reembolsos por conta própria; o operador deve conferir a cobrança adicional no Mercado Pago.
- Reembolso parcial mantém o prazo integral contratado, conforme definido pelo responsável pelo app. Reembolso total, chargeback e cancelamento do pagamento concedente removem aquele período. Dias ainda não usados de uma compra estornada não ficam embutidos nas renovações seguintes.
- Uma disputa `in_mediation` suspende o período até uma nova confirmação. O término do prazo bloqueia pelo relógio do servidor, sem depender de o navegador permanecer aberto.
- Bloqueio administrativo é independente (`access_blocked`). Um pagamento não desfaz esse bloqueio. O aluno não pode alterar esse campo; a liberação manual sem prazo no painel é uma ação explícita do administrador.
- O fim do teste de dez usos continua bloqueando todos os módulos para quem não tem plano válido. Perfil e contratação continuam disponíveis; uma conta suspensa administrativamente recebe orientação de suporte e não pode iniciar outro checkout.

O retorno consulta o pedido específico, verifica a conta dona e pode recuperar a confirmação diretamente do Mercado Pago quando o webhook atrasa. O app também tenta recuperar o checkout recente ao reabrir. O botão “Verificar novamente” reinicia a consulta. A tela nunca deduz aprovação de `?status=approved` ou de um perfil antigo em cache.

## 5. Validação antes de considerar a produção pronta

Execute `npm run check`, os verificadores SQL e o diagnóstico somente leitura `node scripts/check-payments.mjs --live` no ambiente correto. Teste uma compra com conta compradora de teste e vendedora de teste distintas, em homologação isolada. Verifique aprovação, pendência, repetição de notificação, falha seguida de aprovação, expiração, estorno total, reembolso parcial e chargeback simulado quando suportado pelo provedor. Uma compra em produção deve ser feita pelo responsável, com os valores e o meio de pagamento que autorizar.

Na inspeção inicial desta correção, faltavam webhook secret e collector ID; `APP_URL` apontava para outra origem e foi corrigida localmente para `https://safo-app.vercel.app`. A consulta `/users/me` respondeu 403 (`PA_UNAUTHORIZED_RESULT_FROM_POLICIES`) com o token local, portanto sua validade/permissão não foi confirmada; esse erro não comprova sozinho que a chave seja inválida. O Supabase respondeu 200: havia quatro planos ativos com preço/duração válidos, mas ainda não estavam instaladas as novas funções `create_checkout_order` e `record_payment_state`. Isso não comprova o estado das variáveis da Vercel: a conexão disponível não deu acesso a `safo-app`. Não é possível afirmar que a produção está configurada até conferir essas variáveis, a aplicação no Mercado Pago e uma confirmação real no ambiente correspondente.

Referências oficiais: [notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications), [retornos](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/configure-back-urls), [preferências](https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-preferences/create-preference/post), [consulta de pagamentos](https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-preferences/search-payments/get).
