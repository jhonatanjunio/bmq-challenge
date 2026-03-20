# Payment Idempotency Service

Serviço de pagamentos idempotente com tratamento de concorrência, observabilidade persistida e frontend interativo para demonstração dos cenários.

## Diferenciais Técnicos

- **Idempotência multi-camada:** Quick check sem lock + SHA-256 hash validation + `SELECT FOR UPDATE` (pessimistic locking) + `UNIQUE CONSTRAINT`
- **Header `X-Idempotent-Replay`:** Indica quando a resposta é um replay idempotente (inspirado na Stripe API)
- **Amount em centavos (Int):** Padrão da indústria para evitar problemas de ponto flutuante
- **Observabilidade persistida:** `LoggerService` fire-and-forget com persistência em `AuditLog` + endpoint `GET /logs`
- **Segurança:** Helmet, CORS restritivo, body size limit, validação de tamanho de inputs
- **Frontend profissional:** Vite + React 18 + TypeScript + Tailwind CSS com timeline agrupada por chave de idempotência
- **Graceful shutdown:** Desconexão limpa do banco em `SIGTERM`/`SIGINT`

---

## Como Executar

O projeto sobe com **um único comando** via Docker Compose:

```bash
docker compose up --build
```

Após os logs indicarem que o servidor está rodando, acesse:

- **Backend:** http://localhost:3000
- **Frontend:** http://localhost:8080
- **Health Check:** http://localhost:3000/health
- **Logs (API):** http://localhost:3000/logs

### Execução local (desenvolvimento)

```bash
# Backend
cd backend
npm install
npx prisma migrate dev
npm run dev

# Frontend (em outro terminal)
cd frontend
npm install
npm run dev
```

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
│   │   ├── middlewares/     # CorrelationId
│   │   ├── repositories/   # PaymentRepository (FOR UPDATE, ACID)
│   │   └── services/       # PaymentService, LoggerService
│   ├── prisma/              # Schema + migrations
│   └── tests/               # Testes de concorrência
├── frontend/
│   ├── src/
│   │   ├── components/      # 10 componentes React tipados
│   │   ├── hooks/           # useToast, useLogs
│   │   ├── services/        # API client
│   │   ├── types/           # Interfaces TypeScript
│   │   └── utils/           # Formatação, status config
│   └── vite.config.ts       # Vite + Tailwind CSS
└── docker-compose.yml        # PostgreSQL + Backend + Frontend
```

---

## Documentação Adicional

- **[GUIA_TECNICO.md](./GUIA_TECNICO.md)** — Justificativas de decisões técnicas para entrevista
- **[challenge.md](./challenge.md)** — Requisitos originais do desafio
- **[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)** — Guia de deploy e infraestrutura
