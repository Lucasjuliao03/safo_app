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

## Comparação de estudo no ranking

Na página de ranking de cada curso, a comparação com 78 perfis fictícios aparece automaticamente com o título "Ranking simulado", sem seletor, aviso explicativo ou rótulos individuais. Cada perfil tem um avatar fixo escolhido da lista de avatares do sistema, preservado entre cursos e períodos. Os nomes e as estatísticas são determinísticos por curso e período, sem mudar em atualizações ou visitas futuras. Os perfis virtuais têm no máximo 430 pontos no geral, 180 no mensal e 60 no semanal, com atividades coerentes com a fórmula de pontuação. Esses limites não se aplicam aos alunos reais. Funciona automaticamente também para cursos novos, sem gravar contas, atividades ou posições no banco; o ranking oficial continua usando apenas participantes reais.

## Arquitetura de segurança

- Conteúdo sujeito a assinatura é entregue por `/api/content/*`, após autenticação e validação de acesso no servidor.
- Operações administrativas e de pagamento usam a service role somente no servidor.
- Webhooks do Mercado Pago exigem assinatura HMAC e validação do pagamento na API oficial.
- Políticas RLS e funções sensíveis são endurecidas pela migration de produção.

Relatos de vulnerabilidade devem seguir [SECURITY.md](SECURITY.md).
