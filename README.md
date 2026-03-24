# Payment Idempotency Service

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 20"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18"></a>
  <a href="https://www.prisma.io"><img src="https://img.shields.io/badge/Prisma-5.22-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma"></a>
  <a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
  <a href="https://docker.com"><img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"></a>
  <a href="https://vitejs.dev"><img src="https://img.shields.io/badge/Vite-6.4-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"></a>
</p>

Serviço de pagamentos idempotente com tratamento de concorrência, observabilidade persistida e frontend interativo para demonstração dos cenários.

## Diferenciais Técnicos

- **Idempotência multi-camada:** Quick check sem lock + SHA-256 hash validation (revalidado dentro do lock) + `SELECT FOR UPDATE` (pessimistic locking) + `UNIQUE CONSTRAINT`
- **Header `X-Idempotent-Replay`:** Indica quando a resposta é um replay idempotente (inspirado na Stripe API)
- **Consistência de resposta:** `responseBody` persistido atomicamente na mesma transação, usado em replays para garantir respostas idênticas
- **Processamento assíncrono durável:** `PaymentWorker` com fila baseada em PostgreSQL (`FOR UPDATE SKIP LOCKED`), retry com controle de tentativas, resistente a reinícios
- **Amount em centavos (Int):** Padrão da indústria para evitar problemas de ponto flutuante
- **Observabilidade persistida:** `LoggerService` fire-and-forget com persistência em `AuditLog` + endpoint `GET /logs` + página de visualização no frontend
- **Segurança:** Helmet, CORS restritivo, body size limit, validação de tamanho de inputs
- **Gateway injetável:** Interface `GatewaySimulator` permite testes unitários determinísticos sem aleatoriedade
- **Frontend profissional:** Vite + React 18 + TypeScript + Tailwind CSS com visualização cronológica e timeline agrupada por chave de idempotência
- **Graceful shutdown:** Desconexão limpa do banco e parada do worker em `SIGTERM`/`SIGINT`

---

## Demo Online

A aplicação está disponível para teste sem necessidade de instalação:

- **Frontend:** https://bmq-challenge-frontend.vercel.app
- **Backend API:** https://bmq-challenge-backend.vercel.app/api/v1/payments
- **Health Check:** https://bmq-challenge-backend.vercel.app/health

---

## Como Executar Localmente

O projeto sobe com **um único comando** via Docker Compose:

```bash
docker compose up --build
```

Após os logs indicarem `Payment Service running on port 3000`, acesse:

- **Frontend:** http://localhost:8080
- **Backend API:** http://localhost:3000
- **Health Check:** http://localhost:3000/health

### Execução local (desenvolvimento)

```bash
# Terminal 1 — Banco de dados
docker compose up db

# Terminal 2 — Backend (hot reload)
cd backend
npm install
npx prisma migrate dev
npm run dev

# Terminal 3 — Frontend (Vite HMR)
cd frontend
npm install
npm run dev
```

O frontend Vite roda em `http://localhost:5173` com hot reload. O backend em `http://localhost:3000`.

---

## Testes Automatizados

```bash
cd backend
npm install
npm test
```

### Testes unitários (42 testes)
Cobrem todos os caminhos do `PaymentService` com gateway determinístico (sem aleatoriedade):
- Revalidação de hash dentro da transação com lock (race condition)
- Short-circuit de pagamentos PENDING sem reprocessamento
- Persistência atômica de `responseBody` na mesma transação
- Replay usando `responseBody` persistido vs. fallback para `buildResponseBody`
- Validação de input (header, amount, customerId)

### Testes de integração (7 testes)
Requerem backend rodando (`docker compose up`):
1. **Race condition (10 requisições simultâneas):** Todas retornam o mesmo resultado
2. **Detecção de conflito sequencial:** Mesma chave com payload diferente retorna 409
3. **Detecção de conflito paralelo:** 10 requisições simultâneas com payloads divergentes — detecta 409 mesmo sob concorrência
4. **Persistência de erros:** Falhas intermitentes são persistidas e retornadas em retries
5. **Header X-Idempotent-Replay:** Presente em todas as respostas de replay
6. **Ciclo PENDING → final:** Retry durante PENDING retorna 202 consistente; após worker processar, retorna resultado final idêntico em replays subsequentes
7. **Unicidade sob carga:** 20 requisições simultâneas geram exatamente 1 pagamento

---

## Arquitetura

```
├── backend/
│   ├── src/
│   │   ├── config/          # PrismaClient singleton
│   │   ├── controllers/     # PaymentController, LogController
│   │   ├── middlewares/      # CorrelationId
│   │   ├── repositories/    # PaymentRepository (FOR UPDATE, SKIP LOCKED, ACID)
│   │   └── services/        # PaymentService, PaymentWorker, LoggerService
│   ├── prisma/               # Schema + migrations
│   └── tests/                # Testes unitários + integração
├── frontend/
│   ├── src/
│   │   ├── components/       # 11 componentes React tipados
│   │   ├── hooks/            # useToast, useLogs
│   │   ├── services/         # API client
│   │   ├── types/            # Interfaces TypeScript
│   │   └── utils/            # Formatação, status config
│   └── vite.config.ts        # Vite + Tailwind CSS
└── docker-compose.yml         # PostgreSQL + Backend + Frontend
```

---

## Decisões Técnicas

Para detalhes completos sobre cada decisão arquitetural, trade-offs e evolução para produção, consulte o **[TECHNICAL_DECISIONS.md](./TECHNICAL_DECISIONS.md)**.

### Resumo

| Decisão | Justificativa |
|---------|---------------|
| **Pessimistic Lock (FOR UPDATE)** | Em pagamentos, evitar cobrança dupla é mais importante que throughput |
| **SHA-256 Request Hash (dupla validação)** | Detecta payload diferente com mesma chave (409 Conflict), validado no fast-check e dentro do lock |
| **Amount em centavos** | Evita problemas de precisão IEEE 754, padrão Stripe/PagBank |
| **responseBody persistido** | Garante respostas idênticas em replays — body salvo atomicamente na mesma transação |
| **PaymentWorker (PostgreSQL queue)** | Processamento assíncrono durável via `FOR UPDATE SKIP LOCKED`, sobrevive a reinícios |
| **GatewaySimulator injetável** | Permite testes unitários determinísticos sem dependência de aleatoriedade |
| **LoggerService fire-and-forget** | Observabilidade sem adicionar latência ao processamento |
| **Helmet + CORS restritivo** | Hardening de segurança cobrindo OWASP Top 10 |
| **Vite + React + TypeScript** | Frontend moderno com type safety e build otimizado (~60KB gzip) |
