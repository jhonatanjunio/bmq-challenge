import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../services/LoggerService';

export class PaymentRepository {
  /**
   * Busca um pagamento pela chave de idempotência com lock pessimista (FOR UPDATE).
   * Aceita um cliente de transação opcional para atomicidade.
   */
  async findByIdempotencyKeyWithLock(
    key: string, 
    tx: Prisma.TransactionClient = prisma
  ): Promise<Payment | null> {
    const results = await tx.$queryRaw<Payment[]>`
      SELECT * FROM "Payment" 
      WHERE "idempotencyKey" = ${key} 
      FOR UPDATE
    `;
    return results.length > 0 ? results[0] : null;
  }

  async findByIdempotencyKey(
    key: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Payment | null> {
    return tx.payment.findUnique({
      where: { idempotencyKey: key }
    });
  }

  async create(
    data: {
      idempotencyKey: string;
      requestHash: string;
      amount: number;
      customerId: string;
      status: PaymentStatus;
    },
    tx: Prisma.TransactionClient = prisma
  ): Promise<Payment> {
    try {
      const result = await tx.payment.create({ data });
      logger.info('Payment record created', {
        idempotencyKey: data.idempotencyKey,
        metadata: { paymentId: result.id },
        source: 'repository'
      });
      return result;
    } catch (error: any) {
      // Unique constraint = concorrência esperada, não é erro real
      if (error.code === 'P2002' && error.meta?.target?.includes('idempotencyKey')) {
        logger.warn('Conflito de idempotência detectado (concorrência esperada)', {
          idempotencyKey: data.idempotencyKey,
          source: 'repository'
        });
        throw { code: 'IDEMPOTENCY_CONFLICT', idempotencyKey: data.idempotencyKey };
      }
      // Erro inesperado real
      logger.error('Falha ao criar registro de pagamento', {
        idempotencyKey: data.idempotencyKey,
        metadata: { error: error.message || error.code },
        source: 'repository'
      });
      throw error;
    }
  }

  async update(
    id: string,
    data: Prisma.PaymentUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Payment> {
    return tx.payment.update({
      where: { id },
      data
    });
  }

  /**
   * Claims pending payments for processing using FOR UPDATE SKIP LOCKED.
   * Prevents concurrent workers from processing the same payment.
   */
  async claimPendingPayments(
    limit: number,
    maxAttempts: number,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Payment[]> {
    return tx.$queryRaw<Payment[]>`
      SELECT * FROM "Payment"
      WHERE "status" = 'PENDING'
        AND "processedAt" IS NULL
        AND "attempts" < ${maxAttempts}
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
  }

  /**
   * Wrapper for native Prisma transactions.
   */
  async transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(callback, { timeout: 10000 });
  }
}
