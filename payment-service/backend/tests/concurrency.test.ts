import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_URL = process.env.API_URL || 'http://localhost:3000';

describe('Payment Service - Senior Level Tests', () => {
  const customerId = 'cust_789';
  const amount = 250;

  test('Deve garantir consistência em cenários de alta concorrência (Race Condition)', async () => {
    const idempotencyKey = `race-${uuidv4()}`;
    const numRequests = 10; // Disparar 10 requisições simultâneas
    
    console.log(`[Test] Disparando ${numRequests} requisições simultâneas para a chave: ${idempotencyKey}`);

    const requests = Array.from({ length: numRequests }).map(() => 
      axios.post(`${API_URL}/payments`, { amount, customerId }, { 
        headers: { 'Idempotency-Key': idempotencyKey },
        validateStatus: () => true // Não falhar o teste em erros 4xx/5xx
      })
    );

    const responses = await Promise.all(requests);

    // Todas as respostas devem ser idênticas (mesmo status e mesmo body)
    const firstStatus = responses[0].status;
    const firstData = responses[0].data;

    responses.forEach((res, index) => {
      expect(res.status).toBe(firstStatus);
      expect(res.data).toEqual(firstData);
    });

    console.log(`[Test] Sucesso: Todas as ${numRequests} requisições retornaram o mesmo resultado.`);
  });

  test('Deve retornar 409 Conflict se a mesma chave for usada com payload diferente', async () => {
    const idempotencyKey = `conflict-${uuidv4()}`;
    
    // Primeira requisição (sucesso ou falha, não importa)
    await axios.post(`${API_URL}/payments`, { amount, customerId }, { 
      headers: { 'Idempotency-Key': idempotencyKey } 
    });

    // Segunda requisição com payload diferente (amount mudou)
    const res = await axios.post(`${API_URL}/payments`, { amount: 999, customerId }, { 
      headers: { 'Idempotency-Key': idempotencyKey },
      validateStatus: () => true
    });

    expect(res.status).toBe(409);
    expect(res.data.error).toContain('different payload');
    console.log('[Test] Sucesso: Detectado conflito de payload para a mesma chave.');
  });

  test('Deve persistir e retornar o mesmo erro em caso de falha intermitente', async () => {
    // Vamos tentar até conseguir uma falha (já que é randômica)
    let idempotencyKey;
    let firstResponse;
    let foundFailure = false;

    for (let i = 0; i < 10; i++) {
      idempotencyKey = `fail-test-${uuidv4()}`;
      try {
        firstResponse = await axios.post(`${API_URL}/payments`, { amount, customerId }, { 
          headers: { 'Idempotency-Key': idempotencyKey } 
        });
      } catch (error: any) {
        firstResponse = error.response;
        if (firstResponse.status === 400) {
          foundFailure = true;
          break;
        }
      }
    }

    if (foundFailure) {
      console.log('[Test] Falha intermitente encontrada. Testando retry...');
      const retryResponse = await axios.post(`${API_URL}/payments`, { amount, customerId }, { 
        headers: { 'Idempotency-Key': idempotencyKey },
        validateStatus: () => true
      });

      expect(retryResponse.status).toBe(firstResponse.status);
      expect(retryResponse.data).toEqual(firstResponse.data);
      console.log('[Test] Sucesso: O erro persistido foi retornado no retry.');
    } else {
      console.log('[Test] Nenhuma falha intermitente ocorreu em 10 tentativas. Pulando validação de retry de erro.');
    }
  });
});
