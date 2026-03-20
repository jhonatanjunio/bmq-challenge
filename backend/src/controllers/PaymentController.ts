import { Request, Response } from 'express';
import { PaymentService } from '../services/PaymentService';
import { logger } from '../services/LoggerService';

const MAX_ATTEMPTS = parseInt(process.env.RETRY_ATTEMPTS || '3', 10);
const RETRY_INTERVAL_MS = parseInt(process.env.RETRY_INTERVAL_MS || '500', 10);

export class PaymentController {
  private service: PaymentService;

  constructor() {
    this.service = new PaymentService();
  }

  async create(req: Request, res: Response): Promise<void> {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const correlationId = (req as any).correlationId;
    let { amount, customerId } = req.body;

    // 1. Validação do header
    if (!idempotencyKey) {
      res.status(400).json({ status: 'ERROR', message: 'Idempotency-Key header is required' });
      return;
    }
    if (idempotencyKey.length > 255) {
      res.status(400).json({ status: 'ERROR', message: 'Idempotency-Key must be at most 255 characters' });
      return;
    }

    // 2. Sanitização e validação do amount
    if (typeof amount === 'string') {
      amount = amount.trim();
      if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
        res.status(400).json({ status: 'ERROR', message: 'Amount must be a valid positive decimal number' });
        return;
      }
      amount = parseFloat(amount);
    }
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      res.status(400).json({ status: 'ERROR', message: 'Amount must be a positive number' });
      return;
    }

    // 3. Validação do customerId
    if (typeof customerId !== 'string' || customerId.trim().length === 0) {
      res.status(400).json({ status: 'ERROR', message: 'CustomerId must be a non-empty string' });
      return;
    }
    if (customerId.length > 255) {
      res.status(400).json({ status: 'ERROR', message: 'CustomerId must be at most 255 characters' });
      return;
    }

    // 4. Converte amount para centavos (padrão da indústria)
    const amountInCents = Math.round(amount * 100);

    try {
      logger.info('Payment request received', {
        correlationId,
        idempotencyKey,
        metadata: { customerId, amountInCents },
        source: 'controller'
      });

      // 5. Processamento com retry automático para conflitos de idempotência
      const result = await this.processWithRetry(idempotencyKey, { amount: amountInCents, customerId });

      if (result) {
        logger.info('Payment request completed', {
          correlationId,
          idempotencyKey,
          metadata: { httpStatus: result.status, replay: result.replay },
          source: 'controller'
        });

        if (result.replay) {
          res.setHeader('X-Idempotent-Replay', 'true');
        }
        res.status(result.status).json(result.body);
      } else {
        logger.error('Service unavailable after retries', {
          correlationId,
          idempotencyKey,
          source: 'controller'
        });
        res.status(503).json({ status: 'ERROR', message: 'Service unavailable after retries' });
      }
    } catch (error: any) {
      logger.error('Internal server error', {
        correlationId,
        idempotencyKey,
        metadata: { error: error.message },
        source: 'controller'
      });
      res.status(503).json({ status: 'ERROR', message: 'Service unavailable' });
    }
  }

  private async processWithRetry(
    idempotencyKey: string,
    payload: { amount: number; customerId: string }
  ) {
    let lastError = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.service.processPayment(idempotencyKey, payload);
      } catch (error: any) {
        if (error.code === 'IDEMPOTENCY_CONFLICT' && error.idempotencyKey) {
          // Conflito de unique constraint — busca registro existente
          const repo = this.service['repository'];
          const existing = await repo.findByIdempotencyKey(error.idempotencyKey);
          if (existing) {
            if (existing.status !== 'PENDING') {
              return {
                status: existing.httpStatusCode || 200,
                body: existing.responseBody,
                replay: true
              };
            }
            return {
              status: 202,
              body: { status: 'PENDING', message: 'Payment is being processed' },
              replay: true
            };
          }
          lastError = new Error('Idempotency conflict, but no record found');
        } else {
          lastError = error;
        }

        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
        }
      }
    }
    return null;
  }
}
