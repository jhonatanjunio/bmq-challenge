# Desafio técnico

Você está implementando um serviço de pagamentos que pode receber requisições duplicadas devido a retries de clientes ou falhas de rede

---

## Requisitos

Endpoint principal:

```
POST /payments
```

Body:

```json
{
  "amount": 100,
  "customerId": "123"
}
```

Header:

```
Idempotency-Key
```

### Idempotência

- O endpoint deve ser idempotente com base no header Idempotency-Key
- Para uma mesma Idempotency-Key:
  - apenas uma requisição deve ser processada
  - requisições concorrentes devem aguardar ou retornar o mesmo resultado da primeira
  - o mesmo response (status HTTP e body) deve ser retornado para todas as tentativas
  - em caso de erro, o resultado deve ser persistido e retornado nas próximas tentativas
- Não é permitido utilizar armazenamento em memória para garantir idempotência

### Pagamento

- O pagamento deve possuir um status:
  - `PENDING`, `SUCCESS`, `FAILED`

### Processamento

- O processamento do pagamento pode levar tempo (simular com delay)
- O processamento pode falhar de forma intermitente

## Requisitos obrigatórios

- Node.js
- Persistência:
  - deve garantir consistência mesmo em cenários concorrentes
  - deve ser utilizada para controle de idempotência
- A aplicação deve subir com **um único comando**
- Código versionado com instruções claras de execução
- Logs básicos da aplicação (incluindo identificação da requisição, ex: Idempotency-Key)

## Diferenciais

- Tratamento de concorrência (ex: lock, unique constraint, etc)
- Retry seguro
- Testes automatizados
- Uso de filas ou processamento assíncrono
- Observabilidade (logs estruturados, correlation id)
- Frontend simples consumindo a API
- Documentação de decisões técnicas

## Frontend

- Tela simples para:
  - criar pagamento
  - reenviar mesma requisição (simulação idempotência)
  - visualizar resultado
- Demonstrar claramente o comportamento idempotente (ex: mesma requisição múltiplas vezes)

## Exemplo de sequência de chamadas

### Cenário 1: Requisições concorrentes

Duas requisições são recebidas praticamente ao mesmo tempo com a mesma Idempotency-Key:

1ª requisição:

```text
POST /payments
Idempotency-Key: abc-123
```

2ª requisição:
```text
POST /payments
Idempotency-Key: abc-123
```

Comportamento esperado:

- Apenas uma requisição deve iniciar o processamento do pagamento
- A outra requisição não deve gerar um novo pagamento
- Ambas devem receber o mesmo resultado final

---

### Cenário 2: Retry após sucesso

1ª requisição:

```text
POST /payments
Idempotency-Key: xyz-789
````

Resposta:

```json
{
  "status": "SUCCESS"
}
````

2ª requisição (retry com mesma key):

```text
POST /payments
Idempotency-Key: xyz-789
```

Comportamento esperado:

* Não deve haver novo processamento
* Deve retornar exatamente a mesma resposta da primeira requisição

---

### Cenário 3: Retry após falha

1ª requisição:

```text
POST /payments
Idempotency-Key: fail-456
```

Resposta:

```json
{
  "status": "FAILED"
}
```

2ª requisição:

```text
POST /payments
Idempotency-Key: fail-456
```

Comportamento esperado:

* Não deve haver novo processamento automático
* Deve retornar o mesmo resultado da tentativa anterior

### Cenário 4: Requisição durante processamento

1ª requisição inicia processamento (status PENDING)

2ª requisição com mesma Idempotency-Key chega antes da conclusão

Comportamento esperado:

- Não deve iniciar um novo processamento
- Pode aguardar ou retornar o estado atual (PENDING), desde que não gere processamento duplicado e mantenha consistência nas respostas subsequentes

# Entrega

- O prazo para entrega é de 2 dias úteis a partir do recebimento do desafio
- Após esse período, a submissão não será considerada para as próximas etapas
- O código deve ser disponibilizado em um repositório público no GitHub
- O repositório deve conter instruções claras para execução do projeto (README)
- Espera-se que o projeto esteja pronto para execução com o menor esforço possível

## Avaliação

Serão avaliados:

- Modelagem da solução e decisões técnicas
- Tratamento de concorrência e idempotência
- Clareza, organização e legibilidade do código
- Capacidade de lidar com cenários de falha
- Facilidade de execução e setup do projeto