import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

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
      console.log('[PaymentRepository][create] Success:', result);
      return result;
    } catch (error: any) {
      console.error('[PaymentRepository][create] Error:', error);
      // Prisma unique constraint error
      if (error.code === 'P2002' && error.meta?.target?.includes('idempotencyKey')) {
        // Não buscar na mesma transação abortada!
        // Retorna erro para o controller buscar fora da transação
        throw { code: 'IDEMPOTENCY_CONFLICT', idempotencyKey: data.idempotencyKey };
      }
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
   * Wrapper for native Prisma transactions.
   */
  async transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(callback, { timeout: 10000 });
  }
}
