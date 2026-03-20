import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_URL = process.env.API_URL || 'http://localhost:3000';

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
      expect(res.data).toEqual(firstData);
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
      // Compara campos estáveis (ignora updated_at que pode variar por milissegundos)
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
  });

  test('Deve retornar header X-Idempotent-Replay em requisições repetidas', async () => {
    const idempotencyKey = `replay-${uuidv4()}`;

    // Primeira requisição
    const first = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
      headers: { 'Idempotency-Key': idempotencyKey },
      validateStatus: () => true
    });

    // Aguarda processamento caso tenha caído no forcePending
    if (first.status === 202) {
      await new Promise(resolve => setTimeout(resolve, 16000));
    }

    // Segunda requisição (replay)
    const second = await axios.post(`${API_URL}/payments`, { amount, customerId }, {
      headers: { 'Idempotency-Key': idempotencyKey },
      validateStatus: () => true
    });

    expect(second.headers['x-idempotent-replay']).toBe('true');
    console.log('[Test] Sucesso: Header X-Idempotent-Replay presente no replay.');
  });
});
