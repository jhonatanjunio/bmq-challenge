# Payment Idempotency Service

Serviço de pagamentos idempotente com tratamento de concorrência, observabilidade persistida e frontend interativo para demonstração dos cenários.

## Diferenciais Técnicos

- **Idempotência multi-camada:** Quick check sem lock + SHA-256 hash validation + `SELECT FOR UPDATE` (pessimistic locking) + `UNIQUE CONSTRAINT`
- **Header `X-Idempotent-Replay`:** Indica quando a resposta é um replay idempotente (inspirado na Stripe API)
- **Amount em centavos (Int):** Padrão da indústria para evitar problemas de ponto flutuante
- **Observabilidade persistida:** `LoggerService` fire-and-forget com persistência em `AuditLog` + endpoint `GET /logs` + página de visualização no frontend
- **Segurança:** Helmet, CORS restritivo, body size limit, validação de tamanho de inputs
- **Frontend profissional:** Vite + React 18 + TypeScript + Tailwind CSS com visualização cronológica e timeline agrupada por chave de idempotência
- **Graceful shutdown:** Desconexão limpa do banco em `SIGTERM`/`SIGINT`

---

## Como Executar

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

Os testes cobrem:
1. **Consistência em concorrência:** 10 requisições simultâneas com a mesma chave — todas devem retornar o mesmo resultado
2. **Detecção de conflito:** Mesma chave com payload diferente retorna 409
3. **Persistência de erros:** Falhas intermitentes são persistidas e retornadas em retries

---

## Arquitetura

```
├── backend/
│   ├── src/
│   │   ├── config/          # PrismaClient singleton
│   │   ├── controllers/     # PaymentController, LogController
│   │   ├── middlewares/      # CorrelationId
│   │   ├── repositories/    # PaymentRepository (FOR UPDATE, ACID)
│   │   └── services/        # PaymentService, LoggerService
│   ├── prisma/               # Schema + migrations
│   └── tests/                # Testes de concorrência
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

| Decisão | Justificativa |
|---------|---------------|
| **Pessimistic Lock (FOR UPDATE)** | Em pagamentos, evitar cobrança dupla é mais importante que throughput |
| **SHA-256 Request Hash** | Detecta payload diferente com mesma chave (409 Conflict) |
| **Amount em centavos** | Evita problemas de precisão IEEE 754, padrão Stripe/PagBank |
| **buildResponseBody centralizado** | Garante respostas idênticas em todos os caminhos (DRY) |
| **setTimeout para forcePending** | Simula callback assíncrono de gateway; em produção usaria BullMQ/SQS |
| **LoggerService fire-and-forget** | Observabilidade sem adicionar latência ao processamento |
| **Helmet + CORS restritivo** | Hardening de segurança cobrindo OWASP Top 10 |
| **Vite + React + TypeScript** | Frontend moderno com type safety e build otimizado (~60KB gzip) |
