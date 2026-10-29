# SAFO App

Aplicação web de estudos, questões, flashcards, resumos, mentoria e patrulhamento, com administração de conteúdo e assinaturas via Mercado Pago.

## Desenvolvimento

Requer Node.js 22 e npm.

```sh
cp .env.example .env
npm ci
npm run dev
```

Nunca versionar `.env`. As variáveis públicas `VITE_*` são incorporadas ao navegador; chaves administrativas e tokens de pagamento devem existir somente no ambiente das funções de servidor.

## Validação

```sh
npm run check
npm audit --omit=dev
```

O primeiro comando executa TypeScript, ESLint, testes automatizados e build de produção. Consulte [docs/PRODUCTION_ROLLOUT.md](docs/PRODUCTION_ROLLOUT.md) antes de publicar.

## Arquitetura de segurança

- Conteúdo sujeito a assinatura é entregue por `/api/content/*`, após autenticação e validação de acesso no servidor.
- Operações administrativas e de pagamento usam a service role somente no servidor.
- Webhooks do Mercado Pago exigem assinatura HMAC e validação do pagamento na API oficial.
- Políticas RLS e funções sensíveis são endurecidas pela migration de produção.

Relatos de vulnerabilidade devem seguir [SECURITY.md](SECURITY.md).
