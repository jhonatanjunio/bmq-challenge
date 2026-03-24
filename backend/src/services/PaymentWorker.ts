import { PaymentRepository } from '../repositories/PaymentRepository';
import { PaymentStatus, Payment } from '@prisma/client';
import { logger } from './LoggerService';

const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '2000', 10);
const BATCH_SIZE = parseInt(process.env.WORKER_BATCH_SIZE || '5', 10);
const MAX_ATTEMPTS = parseInt(process.env.WORKER_MAX_ATTEMPTS || '3', 10);

export class PaymentWorker {
  private repository: PaymentRepository;
  private running = false;
  private timeoutId: NodeJS.Timeout | null = null;

  constructor() {
    this.repository = new PaymentRepository();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info('Payment worker started', {
      metadata: { pollInterval: POLL_INTERVAL_MS, batchSize: BATCH_SIZE, maxAttempts: MAX_ATTEMPTS },
      source: 'worker'
    });
    this.schedulePoll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    logger.info('Payment worker stopped', { source: 'worker' });
  }

  private schedulePoll(): void {
    if (!this.running) return;
    this.timeoutId = setTimeout(async () => {
      await this.poll();
      this.schedulePoll();
    }, POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    try {
      await this.repository.transaction(async (tx) => {
        const payments = await this.repository.claimPendingPayments(BATCH_SIZE, MAX_ATTEMPTS, tx);

        for (const payment of payments) {
          await this.processPayment(payment, tx);
        }
      });
    } catch (error: any) {
      logger.error('Worker poll cycle failed', {
        metadata: { error: error.message },
        source: 'worker'
      });
    }
  }

  private async processPayment(payment: Payment, tx: any): Promise<void> {
    try {
      // Increment attempt counter
      await this.repository.update(payment.id, {
        attempts: payment.attempts + 1
      }, tx);

      // Simulate gateway processing (delay + random outcome)
      const delay = Math.floor(Math.random() * 2000) + 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
      const success = Math.random() >= 0.2;

      const finalStatus = success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
      const httpStatusCode = success ? 201 : 400;

      // Update status
      const updated = await this.repository.update(payment.id, {
        status: finalStatus,
        httpStatusCode,
        processedAt: new Date()
      }, tx);

      // Persist responseBody atomically (same transaction)
      const responseBody = {
        status: updated.status,
        message: updated.status === PaymentStatus.SUCCESS ? 'Payment successful' : 'Payment failed',
        transaction: {
          transaction_id: updated.id,
          customer_id: updated.customerId,
          amount: updated.amount,
          created_at: updated.createdAt,
          updated_at: updated.updatedAt
        }
      };
      await this.repository.update(payment.id, { responseBody }, tx);

      logger.info('Worker processed payment', {
        idempotencyKey: payment.idempotencyKey,
        metadata: { paymentId: payment.id, status: finalStatus, attempt: payment.attempts + 1 },
        source: 'worker'
      });
    } catch (error: any) {
      logger.error('Worker failed to process payment', {
        idempotencyKey: payment.idempotencyKey,
        metadata: { paymentId: payment.id, error: error.message, attempt: payment.attempts + 1 },
        source: 'worker'
      });
      // Transaction will rollback — payment stays PENDING for next poll
    }
  }
}
