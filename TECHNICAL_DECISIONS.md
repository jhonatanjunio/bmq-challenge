# Decisões Técnicas — Payment Idempotency Service

Este documento registra as decisões arquiteturais do projeto, o problema que cada uma resolve e os trade-offs envolvidos. Segue o formato de Architecture Decision Records (ADR).

---

## 1. Idempotência Multi-Camada

### Contexto
Serviços de pagamento recebem requisições duplicadas por diversas razões: retries automáticos de clientes, timeouts de rede, load balancers que reenviam, ou o próprio usuário clicando duas vezes. Processar o mesmo pagamento mais de uma vez causa prejuízo financeiro direto.

### Decisão
Implementei quatro camadas de proteção complementares, cada uma resolvendo um cenário diferente:

**Camada 1 — Quick Check (sem lock)**
Antes de adquirir qualquer lock, faço uma consulta simples pela `idempotencyKey`. Se o pagamento já foi finalizado (SUCCESS ou FAILED), retorno o resultado imediatamente sem entrar na transação. Isso evita contenção desnecessária no banco para o caso mais comum em produção: retries de pagamentos já processados.

Esta camada é um padrão TOCTOU (Time-of-Check-Time-of-Use), mas é segura neste contexto porque a consulta nunca altera estado — ela apenas lê. Se uma race condition ocorrer entre a leitura e a transação, a próxima camada resolve.

**Camada 2 — SHA-256 Request Hash**
Ao criar um registro de pagamento, gero um hash SHA-256 do payload (amount + customerId) e persisto junto ao registro. Em requisições subsequentes com a mesma chave, comparo o hash. Se o payload mudou, retorno HTTP 409 Conflict.

Problema que resolve: um cliente reutilizar acidentalmente uma chave de idempotência para um pagamento diferente. Sem esta verificação, o sistema retornaria o resultado do pagamento anterior — que tem valor e destinatário diferentes. Em pagamentos, isso é inaceitável.

**Camada 3 — Pessimistic Locking (`SELECT FOR UPDATE`)**
Dentro de uma transação ACID, executo `SELECT * FROM "Payment" WHERE "idempotencyKey" = $1 FOR UPDATE`. Isso adquire um lock exclusivo na linha do banco de dados. Todas as outras transações que tentarem acessar a mesma chave ficam bloqueadas até que a primeira transação complete (commit ou rollback).

Problema que resolve: duas requisições chegando no mesmo milissegundo, antes que qualquer registro exista no banco. Sem o lock, ambas passariam pelo quick check (vazio), ambas tentariam criar o registro, e uma delas processaria o pagamento em duplicidade.

A escolha por pessimistic locking (ao invés de optimistic) é deliberada para o domínio financeiro. Optimistic locking (version column + retry) funciona bem para cenários de leitura pesada, mas em pagamentos o custo de um falso positivo (processar duas vezes) é muito maior que o custo de contenção (esperar). Prefiro que a segunda requisição espere 2 segundos a arriscar uma cobrança dupla.

**Camada 4 — UNIQUE CONSTRAINT**
O campo `idempotencyKey` possui constraint UNIQUE no banco de dados. Esta é a última linha de defesa — se por qualquer razão as camadas anteriores falharem, o banco rejeita a inserção duplicada com erro P2002.

O controller intercepta este erro específico (`IDEMPOTENCY_CONFLICT`) e faz retry automático, buscando o registro que venceu a race condition e retornando o resultado dele.

### Trade-offs
- **Performance vs. Segurança**: O `SELECT FOR UPDATE` adiciona latência em cenários concorrentes. Em um sistema de alta vazão (>10k TPS), seria necessário sharding por chave de idempotência ou um lock distribuído (Redis). Para o volume esperado, o lock no PostgreSQL é adequado.
- **Quatro camadas vs. simplicidade**: Cada camada existe por uma razão específica. Remover qualquer uma deixa uma janela de vulnerabilidade real. A complexidade adicional é justificada pelo domínio.

---

## 2. Transações ACID com Prisma

### Contexto
O fluxo de pagamento envolve múltiplas operações que precisam ser atômicas: verificar existência, criar registro PENDING, processar pagamento, atualizar status final. Se qualquer passo falhar no meio, o sistema fica em estado inconsistente.

### Decisão
Todas as operações de escrita ocorrem dentro de `prisma.$transaction()` com timeout de 10 segundos. O Prisma garante rollback automático se qualquer operação dentro da transação lançar exceção.

O timeout de 10s é calculado com base no delay máximo do processamento síncrono (3s) mais margem para contenção de locks sob carga. Em produção, este valor seria configurável via variável de ambiente.

### Problema que resolve
Sem transações, uma falha entre a criação do registro PENDING e a atualização para SUCCESS deixaria um pagamento "fantasma" — processado no gateway mas registrado como pendente. O cliente faria retry, e o gateway cobraria novamente.

---

## 3. Valores Monetários em Centavos (Int)

### Contexto
O IEEE 754 (padrão de ponto flutuante) não consegue representar todos os valores decimais com precisão. `0.1 + 0.2 === 0.30000000000000004` em JavaScript. Em operações financeiras, erros de arredondamento se acumulam e causam divergências contábeis.

### Decisão
Armazeno valores como inteiros representando centavos. R$ 100,50 é armazenado como `10050`. A conversão `Math.round(amount * 100)` acontece no Controller — o boundary do sistema onde dados externos entram. Internamente, tudo opera com inteiros. O frontend converte de volta para exibição com `Intl.NumberFormat`.

### Referência da indústria
Este é o padrão utilizado por Stripe (`amount` em cents), PagBank, Mercado Pago e virtualmente todos os processadores de pagamento. A razão é a mesma: inteiros são exatos, floats não.

---

## 4. Processamento Assíncrono (forcePending)

### Contexto
Gateways de pagamento reais não respondem instantaneamente. Alguns processam em segundos, outros levam mais de 10 segundos (especialmente pagamentos internacionais ou com verificação anti-fraude). O cliente não deve ficar bloqueado esperando.

### Decisão
A simulação tem dois caminhos:
- **80% das vezes**: Delay de 1-3s, processamento síncrono dentro da transação. O cliente recebe o resultado final.
- **20% das vezes**: Delay de 10-15s. O sistema retorna HTTP 202 (Accepted) imediatamente com status PENDING e processa em background via `setTimeout`. O cliente pode consultar novamente para obter o resultado final.

### Evolução para produção
O `setTimeout` é uma simulação. Em produção, este padrão seria implementado com:
- **Fila de mensagens** (BullMQ, SQS, RabbitMQ) para processamento assíncrono
- **Dead-letter queue** para falhas que excedam o limite de retries
- **Retry exponencial** com backoff para evitar thundering herd
- **Webhook/callback** para notificar o cliente quando o processamento finalizar

O error handling no callback assíncrono garante que falhas não passem silenciosas — são logadas no AuditLog para investigação.

---

## 5. Observabilidade

### Contexto
Em sistemas distribuídos, a capacidade de rastrear uma requisição do início ao fim é essencial para debugging e monitoramento. "Se não tem log, não aconteceu."

### Decisão

**LoggerService (dual-write, fire-and-forget)**
Criei um serviço de logging que faz duas coisas simultaneamente:
1. Escreve no stdout em formato JSON estruturado (para coleta por ferramentas como CloudWatch, Datadog, ELK)
2. Persiste no banco de dados de forma assíncrona (`.catch()` silencia falhas de escrita)

O ponto crítico é que a persistência no banco é fire-and-forget — não bloqueia o fluxo principal. Se o banco estiver sobrecarregado, o log no stdout continua funcionando. A observabilidade nunca deve adicionar latência ao processamento de pagamentos.

**Correlation ID**
Cada requisição recebe um `correlationId` (derivado da `Idempotency-Key` quando presente, ou UUID gerado). Este ID acompanha a requisição em todos os logs — controller, service, repository — permitindo rastrear o fluxo completo com uma única query.

**AuditLog Schema**
O modelo `AuditLog` possui índices em `level`, `correlationId`, `idempotencyKey` e `timestamp`. Isso permite queries eficientes como:
- "Todos os erros da última hora" (`level = ERROR`, `timestamp > now - 1h`)
- "Tudo que aconteceu com esta chave" (`idempotencyKey = x`)
- "Trace completo desta requisição" (`correlationId = x`)

**Endpoint GET /logs**
API de consulta com filtros e paginação, consumida pela página de observabilidade no frontend. Em produção, este endpoint seria protegido por autenticação e teria rate limiting próprio.

### Evolução para produção
Em ambiente real, os logs do stdout seriam coletados por um agent (Fluentd, CloudWatch agent) e enviados para uma plataforma dedicada (Datadog, ELK, Grafana Loki). A persistência em banco seria substituída — o PostgreSQL não é otimizado para write-heavy logging. O padrão demonstrado (dual-write com fallback) permaneceria o mesmo.

---

## 6. Segurança

### Contexto
Um endpoint de pagamentos é alvo prioritário de ataques. A superfície de ataque inclui injection, payloads maliciosos, exploração de headers, e information leakage.

### Decisões

**Helmet** — Adiciona security headers automaticamente (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.). Custo zero de implementação, alto valor de proteção.

**CORS restritivo** — Configurável via variável de ambiente `CORS_ORIGIN`. Em desenvolvimento aceita qualquer origem; em produção, restringe ao domínio do frontend. Headers customizados (`X-Idempotent-Replay`, `X-Correlation-ID`) são explicitamente expostos via `exposedHeaders`.

**Body size limit** — `express.json({ limit: '10kb' })`. Um payload de pagamento legítimo tem ~100 bytes. Limitar a 10KB previne ataques de payload inflation que poderiam causar OOM.

**Validação de input** — Tamanho máximo de 255 caracteres para `customerId` e `idempotencyKey`. Regex para validação de formato do amount. Estas validações ocorrem no Controller (boundary) antes de qualquer processamento.

**SQL Injection** — O Prisma parametriza todas as queries automaticamente. A única query raw (`SELECT FOR UPDATE`) usa tagged template literals do Prisma (`$queryRaw\`...\``), que também são parametrizadas — os valores são binding parameters, não interpolação de string.

**Information Leakage** — Respostas de erro retornam mensagens genéricas sem expor stack traces, nomes de tabelas ou lógica interna. Indicar ao atacante que sua tentativa foi detectada é contraproducente.

---

## 7. Arquitetura do Backend

### Clean Architecture (Controller → Service → Repository)

**Controller** — Responsável exclusivamente por preocupações HTTP: parsing de headers e body, validação de input, conversão de tipos (amount para centavos), formatação de resposta, e headers de saída. Não contém lógica de negócio.

**Service** — Contém toda a lógica de negócio: idempotência, hashing, orquestração de transações, simulação de gateway. Não conhece HTTP — recebe e retorna objetos tipados.

**Repository** — Abstrai o acesso ao banco de dados. Expõe operações como `findByIdempotencyKeyWithLock`, `create`, `update`. A única camada que conhece Prisma e SQL. Se migrar de PostgreSQL para outro banco, apenas o Repository muda.

### Método público `findByKey`
O Controller precisa resolver conflitos de idempotência (P2002) buscando o registro existente. Inicialmente, acessava o repository diretamente via `this.service['repository']` — acesso a campo privado via bracket notation, frágil e acoplado.

Refatorei para um método público `findByKey` no Service que retorna o `PaymentResult` padronizado. O Controller não precisa saber como a busca é feita nem como o response é construído.

---

## 8. Frontend

### Vite + React 18 + TypeScript + Tailwind CSS

**Por que não single-file HTML?** A versão inicial usava React via CDN com Babel standalone. Funcionava, mas apresentava problemas:
- Sem type checking (erros descobertos em runtime)
- Sem tree-shaking (bundle incluía todo o React + Babel)
- Componentes monolíticos (1200 linhas em um arquivo)
- Sem HMR (reload completo a cada mudança)

A migração para Vite resolve todos esses pontos com setup mínimo. O bundle final é ~60KB gzip — menor que o HTML monolítico com CDN.

### Estrutura de componentes
11 componentes, cada um com responsabilidade única:
- `ConfigPanel` — Formulário de configuração
- `LogPanel` — Área de logs com toggle de visualização
- `LogCard` — Card individual (modo cronológico)
- `GroupCard` + `TimelineNode` — Timeline agrupada por chave
- `LogsViewer` — Página de observabilidade
- `ToastContainer` — Sistema de notificações
- `AmountInput` — Input monetário com máscara (Cleave.js)
- `CopyKeyButton` — Copia chave para o formulário
- `JsonHighlight` — Syntax highlighting para JSON

### Dois modos de visualização
- **Cronológico**: Todas as requisições em ordem, útil para ver o fluxo geral
- **Agrupado**: Timeline por chave de idempotência, mostra o ciclo de vida de cada pagamento (criação → processamento → resultado → replays)

### Observabilidade integrada
A página de observabilidade consome o endpoint `GET /logs` e oferece filtros por nível (INFO/WARN/ERROR), busca por chave de idempotência, e paginação. Permite ao desenvolvedor investigar o comportamento do sistema sem acessar o banco diretamente.

---

## 9. Infraestrutura

### Docker Compose (um comando)
O projeto sobe com `docker compose up --build`:
- **PostgreSQL 15 (Alpine)** com health check — o backend só inicia após o banco estar pronto
- **Backend (Node 20 Alpine)** com multi-stage build — instala dependências, gera Prisma client, compila TypeScript, roda migrations automaticamente no startup
- **Frontend (Nginx Alpine)** com multi-stage build — instala dependências, faz build do Vite, serve estáticos via Nginx

### Graceful Shutdown
Handlers para `SIGTERM` e `SIGINT` desconectam o PrismaClient antes do exit. Em ambientes containerizados, o orquestrador envia SIGTERM antes de encerrar o container. Sem graceful shutdown, conexões com o banco ficam penduradas até o timeout do pool — causando erros em outros containers que compartilham o mesmo banco.

### OpenSSL no Alpine
O Prisma requer OpenSSL para comunicação com PostgreSQL. A imagem Alpine não inclui por padrão. Sem `apk add openssl`, o Prisma falha com "Could not parse schema engine response" — um erro críptico que não menciona OpenSSL. Instalamos explicitamente em ambos os stages do Dockerfile.

---

## 10. Testes Automatizados

### Abordagem: Testes de integração
Os testes são de integração — disparam requisições HTTP contra o backend real, validando o comportamento end-to-end incluindo banco de dados, locks, e transações. Esta escolha é deliberada: testes unitários com mocks não conseguem validar comportamento de concorrência e locks de banco de dados, que são o ponto central do sistema.

### Cobertura de cenários

**Teste 1 — Race Condition (10 requisições simultâneas)**
Dispara 10 requisições em paralelo com a mesma chave. Valida que todas retornam exatamente o mesmo status e body. Este teste exercita as camadas 3 e 4 da idempotência (FOR UPDATE + UNIQUE CONSTRAINT).

**Teste 2 — Detecção de conflito de payload (409)**
Envia uma requisição, depois envia outra com mesma chave mas amount diferente. Valida HTTP 409 e mensagem de conflito. Exercita a camada 2 (SHA-256 hash).

**Teste 3 — Persistência de erros**
Encontra uma falha intermitente (20% de chance) e reenvia com a mesma chave. Valida que o mesmo erro é retornado — o sistema não tenta reprocessar. Também valida o header `X-Idempotent-Replay: true`.

**Teste 4 — Header X-Idempotent-Replay**
Envia uma requisição, aguarda processamento, reenvia. Valida que a segunda resposta contém o header de replay. Exercita a camada 1 (quick check) e a detecção de replay.

### Limitações conhecidas
- Os testes requerem um backend rodando (`npm test` falha sem servidor). Em produção, usaria um setup que sobe o servidor antes dos testes (supertest ou docker-compose em CI).
- O teste de falha intermitente depende de aleatoriedade (20% por tentativa). Com 20 tentativas, a probabilidade de não encontrar falha é ~1.2%. Em CI, poderia expor um endpoint de teste que força falha.
