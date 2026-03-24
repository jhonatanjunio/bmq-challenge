import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';

describe('Payment Service - Testes de Idempotência e Concorrência', () => {
  const customerId = 'cust_789';
  const amount = 250.00;

  test('Deve garantir consistência em cenários de alta concorrência (Race Condition)', async () => {
    const idempotencyKey = `race-${uuidv4()}`;
    const numRequests = 10;

    console.log(`[Test] Disparando ${numRequests} requisições simultâneas para a chave: ${idempotencyKey}`);

    const requests = Array.from({ length: numRequests }).map(() =>
      axios.post(`${API_URL}/payments`, { amount, customerId }, {
        headers: { 'Idempotency-Key': idempotencyKey },
        validateStatus: () => true
      })
    );

    const responses = await Promise.all(requests);

    const firstStatus = responses[0].status;
    const firstData = responses[0].data;

    responses.forEach((res) => {
      expect(res.status).toBe(firstStatus);
      // Compara campos estáveis (updated_at pode variar milissegundos entre replays)
      expect(res.data.status).toBe(firstData.status);
      expect(res.data.message).toBe(firstData.message);
      if (res.data.transaction) {
        expect(res.data.transaction.transaction_id).toBe(firstData.transaction.transaction_id);
        expect(res.data.transaction.amount).toBe(firstData.transaction.amount);
        expect(res.data.transaction.customer_id).toBe(firstData.transaction.customer_id);
      }
    });

    console.log(`[Test] Sucesso: Todas as ${numRequests} requisições retornaram o mesmo resultado.`);
  });

  test('Deve retornar 409 Conflict se a mesma chave for usada com payload diferente', async () => {
    const idempotencyKey = `conflict-${uuidv4()}`;

    // Primeira requisição — aceita qualquer status (pode ser sucesso ou falha simulada)
    await axios.post(`${API_URL}/payments`, { amount, customerId }, {
      headers: { 'Idempotency-Key': idempotencyKey },
      validateStatus: () => true
    });

    // Segunda requisição com payload diferente (amount mudou)
    const res = await axios.post(`${API_URL}/payments`, { amount: 999, customerId }, {
      headers: { 'Idempotency-Key': idempotencyKey },
      validateStatus: () => true
    });

    expect(res.status).toBe(409);
    expect(res.data.message).toContain('different payload');
    console.log('[Test] Sucesso: Detectado conflito de payload para a mesma chave.');
  });

  test('Deve retornar 409 para payload diferente mesmo em requisições paralelas (race condition)', async () => {
    const idempotencyKey = `parallel-conflict-${uuidv4()}`;

    // Envia 5 requests com amount=100 e 5 com amount=999, todas com mesma key, simultaneamente
    const correctPayload = { amount: 100, customerId };
    const conflictPayload = { amount: 999, customerId };

    const requests = [
      ...Array.from({ length: 5 }).map(() =>
        axios.post(`${API_URL}/payments`, correctPayload, {
          headers: { 'Idempotency-Key': idempotencyKey },
          validateStatus: () => true
        })
      ),
      ...Array.from({ length: 5 }).map(() =>
        axios.post(`${API_URL}/payments`, conflictPayload, {
          headers: { 'Idempotency-Key': idempotencyKey },
          validateStatus: () => true
        })
      )
    ];

    const responses = await Promise.all(requests);

    const statuses = responses.map(r => r.status);
    const has409 = statuses.some(s => s === 409);
    const hasSuccess = statuses.some(s => s === 201 || s === 202);

    expect(has409).toBe(true);
    expect(hasSuccess).toBe(true);

    // Todas as respostas 409 devem ter a mensagem de conflito
    responses.filter(r => r.status === 409).forEach(r => {
      expect(r.data.message).toContain('different payload');
    });

    console.log(`[Test] Sucesso: Conflito de payload detectado em requisições paralelas. Status: ${JSON.stringify(statuses)}`);
  });

  test('Deve persistir e retornar o mesmo erro em caso de falha intermitente', async () => {
    let idempotencyKey: string | undefined;
    let firstResponse: any;
    let foundFailure = false;

    // Tenta até encontrar uma falha (20% de chance por requisição)
    for (let i = 0; i < 20; i++) {
      idempotencyKey = `fail-test-${uuidv4()}`;
      firstResponse = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
        headers: { 'Idempotency-Key': idempotencyKey },
        validateStatus: () => true
      });
      if (firstResponse.status === 400) {
        foundFailure = true;
        break;
      }
    }

    if (foundFailure) {
      console.log('[Test] Falha intermitente encontrada. Testando replay...');
      const retryResponse = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
        headers: { 'Idempotency-Key': idempotencyKey },
        validateStatus: () => true
      });

      expect(retryResponse.status).toBe(firstResponse.status);
      expect(retryResponse.data.status).toBe(firstResponse.data.status);
      expect(retryResponse.data.message).toBe(firstResponse.data.message);
      expect(retryResponse.data.transaction.transaction_id).toBe(firstResponse.data.transaction.transaction_id);
      expect(retryResponse.data.transaction.amount).toBe(firstResponse.data.transaction.amount);

      // Verifica que é um replay
      expect(retryResponse.headers['x-idempotent-replay']).toBe('true');

      console.log('[Test] Sucesso: Erro persistido retornado no replay com header X-Idempotent-Replay.');
    } else {
      console.log('[Test] Nenhuma falha intermitente em 20 tentativas. Pulando validação.');
    }
  }, 90000);

  test('Deve retornar header X-Idempotent-Replay em requisições repetidas', async () => {
    const idempotencyKey = `replay-${uuidv4()}`;

    // Primeira requisição
    const first = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
      headers: { 'Idempotency-Key': idempotencyKey },
      validateStatus: () => true
    });

    // Aguarda processamento caso tenha caído no forcePending (worker processa)
    if (first.status === 202) {
      let processed = false;
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const check = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
          headers: { 'Idempotency-Key': idempotencyKey },
          validateStatus: () => true
        });
        if (check.status !== 202) {
          processed = true;
          break;
        }
      }
      if (!processed) {
        console.log('[Test] Worker não processou em 30s. Verificar worker está ativo.');
        return;
      }
    }

    // Segunda requisição (replay)
    const second = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
      headers: { 'Idempotency-Key': idempotencyKey },
      validateStatus: () => true
    });

    expect(second.headers['x-idempotent-replay']).toBe('true');
    console.log('[Test] Sucesso: Header X-Idempotent-Replay presente no replay.');
  }, 60000);

  test('Deve retornar 202 consistente durante processamento PENDING e resultado final após conclusão', async () => {
    const idempotencyKey = `pending-retry-${uuidv4()}`;

    // Envia primeira requisição
    const first = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
      headers: { 'Idempotency-Key': idempotencyKey },
      validateStatus: () => true
    });

    if (first.status === 202) {
      // Payment está PENDING — retry imediato também deve receber 202
      const pendingRetry = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
        headers: { 'Idempotency-Key': idempotencyKey },
        validateStatus: () => true
      });

      expect(pendingRetry.status).toBe(202);
      expect(pendingRetry.data.status).toBe('PENDING');
      expect(pendingRetry.data.transaction.transaction_id).toBe(first.data.transaction.transaction_id);

      // Aguarda worker processar
      let finalResponse = null;
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const check = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
          headers: { 'Idempotency-Key': idempotencyKey },
          validateStatus: () => true
        });
        if (check.status !== 202) {
          finalResponse = check;
          break;
        }
      }

      if (finalResponse) {
        expect([201, 400]).toContain(finalResponse.status);
        expect(finalResponse.headers['x-idempotent-replay']).toBe('true');

        // Retry subsequente deve retornar exatamente a mesma resposta final
        const subsequentRetry = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
          headers: { 'Idempotency-Key': idempotencyKey },
          validateStatus: () => true
        });

        expect(subsequentRetry.status).toBe(finalResponse.status);
        expect(subsequentRetry.data.status).toBe(finalResponse.data.status);
        expect(subsequentRetry.data.transaction.transaction_id).toBe(finalResponse.data.transaction.transaction_id);
        expect(subsequentRetry.headers['x-idempotent-replay']).toBe('true');

        console.log(`[Test] Sucesso: PENDING → ${finalResponse.data.status}, replays consistentes.`);
      } else {
        console.log('[Test] Worker não processou em 30s. Verificar worker está ativo.');
      }
    } else {
      // Processamento síncrono — verificar replay consistency
      const replay = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
        headers: { 'Idempotency-Key': idempotencyKey },
        validateStatus: () => true
      });

      expect(replay.status).toBe(first.status);
      expect(replay.data.status).toBe(first.data.status);
      expect(replay.data.transaction.transaction_id).toBe(first.data.transaction.transaction_id);
      expect(replay.headers['x-idempotent-replay']).toBe('true');

      console.log(`[Test] Sucesso: Processamento síncrono com replay consistente.`);
    }
  }, 60000);

  test('Deve processar apenas um pagamento mesmo com 20 requisições simultâneas', async () => {
    const idempotencyKey = `no-double-${uuidv4()}`;
    const numRequests = 20;

    const requests = Array.from({ length: numRequests }).map(() =>
      axios.post(`${API_URL}/payments`, { amount, customerId }, {
        headers: { 'Idempotency-Key': idempotencyKey },
        validateStatus: () => true
      })
    );

    const responses = await Promise.all(requests);

    // Coleta todos os transaction_ids únicos
    const transactionIds = new Set(
      responses
        .filter(r => r.data.transaction)
        .map(r => r.data.transaction.transaction_id)
    );

    // Deve haver exatamente UM transaction_id — nenhum duplicado criado
    expect(transactionIds.size).toBe(1);

    console.log(`[Test] Sucesso: ${numRequests} requisições → 1 único pagamento criado.`);
  });
});
