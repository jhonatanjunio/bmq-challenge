/* Serviço de comunicação com a API de pagamentos */

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'http://localhost:3000/api/v1/payments';

export interface ApiResponse {
  data: unknown;
  httpStatus: number;
  replay: boolean;
}

/* Envia uma requisição de pagamento ao backend */
export async function sendPaymentRequest(
  idempotencyKey: string,
  payload: { amount: number; customerId: string }
): Promise<ApiResponse> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const data: unknown = await response.json();
  const replay = response.headers.get('X-Idempotent-Replay') === 'true';

  return { data, httpStatus: response.status, replay };
}
