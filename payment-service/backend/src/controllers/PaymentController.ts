import { Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();
import { PaymentService } from '../services/PaymentService';

export class PaymentController {
  private service: PaymentService;

  constructor() {
    this.service = new PaymentService();
  }

  async create(req: Request, res: Response): Promise<void> {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const correlationId = (req as any).correlationId;
    let { amount, customerId } = req.body;

    // Sanitização básica
    if (typeof amount === 'string') {
      amount = amount.trim();
      if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) {
        res.status(400).json({ status: 'ERROR', message: 'Amount must be a valid decimal number', malicious: true });
        return;
      }
      amount = parseFloat(amount);
    }
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      res.status(400).json({ status: 'ERROR', message: 'Amount must be a positive decimal number', malicious: true });
      return;
    }
    if (typeof customerId !== 'string' || customerId.trim().length === 0) {
      res.status(400).json({ status: 'ERROR', message: 'CustomerId must be a non-empty string', malicious: true });
      return;
    }

    // 1. Validação básica
    if (!idempotencyKey) {
      res.status(400).json({ status: 'ERROR', message: 'Idempotency-Key header is required' });
      return;
    }

    if (!amount || !customerId) {
      res.status(400).json({ status: 'ERROR', message: 'Amount and customerId are required' });
      return;
    }

    try {
      // 2. Log Estruturado (Observabilidade)
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Payment request received',
        correlationId,
        idempotencyKey,
        customerId,
        amount
      }));

      // Retry automático
      const maxAttempts = parseInt(process.env.RETRY_ATTEMPTS || '3', 10);
      const retryInterval = parseInt(process.env.RETRY_INTERVAL_MS || '500', 10);
      let attempt = 0;
      let lastError = null;
      let result = null;
      while (attempt < maxAttempts) {
        try {
          result = await this.service.processPayment(idempotencyKey, { amount, customerId });
          break;
        } catch (error: any) {
          // Tratamento especial para conflito de idempotência
          if (error.code === 'IDEMPOTENCY_CONFLICT' && error.idempotencyKey) {
            const repo = this.service['repository'];
            const existing = await repo.findByIdempotencyKey(error.idempotencyKey);
            if (existing) {
              if (existing.status !== 'PENDING') {
                result = {
                  status: existing.httpStatusCode || 200,
                  body: existing.responseBody
                };
                break;
              } else {
                result = {
                  status: 202,
                  body: { status: 'PENDING', message: 'Payment is being processed' }
                };
                break;
              }
            } else {
              lastError = new Error('Idempotency conflict, but no record found');
            }
          } else {
            lastError = error;
          }
          attempt++;
          if (attempt < maxAttempts) {
            // Apenas aguarda, não responde
            await new Promise(resolve => setTimeout(resolve, retryInterval));
          }
        }
      }

      if (result) {
        // 4. Log de Resposta
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          message: 'Payment request completed',
          correlationId,
          idempotencyKey,
          status: result.status
        }));
        res.status(result.status).json(result.body);
      } else {
        // Todas as tentativas falharam
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: 'Service unavailable after retries',
          correlationId,
          idempotencyKey,
          error: lastError?.message || 'Unknown error'
        }));
        res.status(503).json({ status: 'ERROR', message: 'Service unavailable after retries' });
      }
    } catch (error: any) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Internal server error',
        correlationId,
        idempotencyKey,
        error: error.message
      }));
      res.status(503).json({ status: 'ERROR', message: 'Service unavailable after retries' });
    }
  }
}
