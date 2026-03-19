import crypto from 'crypto';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { PaymentStatus, Payment, Prisma } from '@prisma/client';

export class PaymentService {
  private repository: PaymentRepository;

  constructor() {
    this.repository = new PaymentRepository();
  }

  /**
   * Processa o pagamento com Idempotência, Hashing e Transações ACID.
   */
  async processPayment(
    idempotencyKey: string,
    payload: { amount: number; customerId: string }
  ): Promise<{ status: number; body: any }> {
    const requestHash = this.generateHash(payload);

    // 1. Verificação inicial rápida (sem lock) para performance em retries de sucesso/falha já finalizados
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);

    if (existing) {
      // Validação de integridade: mesma key, payload diferente? (409 Conflict)
      if (existing.requestHash !== requestHash) {
        return {
          status: 409,
          body: { status: 'ERROR', message: 'Idempotency-Key already used with a different payload' }
        };
      }

      // If already finished (SUCCESS or FAILED), return persisted replay
      if (existing.status !== PaymentStatus.PENDING) {
        // Retorna o objeto transaction padronizado
        return {
          status: existing.httpStatusCode || 200,
          body: {
            status: existing.status,
            message: existing.status === PaymentStatus.SUCCESS ? 'Payment successful' : 'Payment failed',
            transaction: {
              transaction_id: existing.id,
              customer_id: existing.customerId,
              amount: existing.amount,
              created_at: existing.createdAt,
              updated_at: existing.updatedAt
            }
          }
        };
      }
      // Se PENDING, retorna imediatamente
      return {
        status: 202,
        body: { status: 'PENDING', message: 'Payment is being processed' }
      };
    }

    // 2. Inicia Transação ACID para garantir Atomicidade e Consistência
    // O Prisma garante que se qualquer operação falhar, o Rollback é automático.
    return this.repository.transaction(async (tx: Prisma.TransactionClient) => {
      // Tenta obter o Lock da linha (Pessimistic Locking)
      let payment = await this.repository.findByIdempotencyKeyWithLock(idempotencyKey, tx);

      if (!payment) {
        // Se não existe, cria como PENDING dentro da transação
        payment = await this.repository.create({
          idempotencyKey,
          requestHash,
          amount: payload.amount,
          customerId: payload.customerId,
          status: PaymentStatus.PENDING
        }, tx);
      } else if (payment.status !== PaymentStatus.PENDING) {
        // Double-check: se o status mudou enquanto esperávamos o lock
        return {
          status: payment.httpStatusCode || 200,
          body: {
            status: payment.status,
            message: payment.status === PaymentStatus.SUCCESS ? 'Payment successful' : 'Payment failed',
            transaction: {
              transaction_id: payment.id,
              customer_id: payment.customerId,
              amount: payment.amount,
              created_at: payment.createdAt,
              updated_at: payment.updatedAt
            }
          }
        };
      }

      // 3. Simula processamento externo (Gateway de Pagamento)
      // Se for delay longo, retorna PENDING imediatamente e agenda atualização
      const { delay, result, forcePending } = await this.simulateGatewayWithPending(payload.amount);

      if (forcePending) {
        // Retorna PENDING imediatamente
        setTimeout(async () => {
          // Atualiza registro após o delay
          await this.repository.update(payment.id, {
            status: result.success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
            responseBody: result.body,
            httpStatusCode: result.status,
            processedAt: new Date()
          });
        }, delay);
        return {
          status: 202,
          body: {
            status: 'PENDING',
            message: 'Payment is being processed',
            transaction: {
              transaction_id: payment.id,
              customer_id: payment.customerId,
              amount: payment.amount,
              created_at: payment.createdAt,
              updated_at: payment.updatedAt
            }
          }
        };
      }

      // Caso normal: aguarda processamento e retorna resultado
      const updated = await this.repository.update(payment.id, {
        status: result.success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
        responseBody: result.body,
        httpStatusCode: result.status,
        processedAt: new Date()
      }, tx);

      return {
        status: updated.httpStatusCode!,
        body: {
          status: updated.status,
          message: updated.status === PaymentStatus.SUCCESS ? 'Payment successful' : 'Payment failed',
          transaction: {
            transaction_id: updated.id,
            customer_id: updated.customerId,
            amount: updated.amount,
            created_at: updated.createdAt,
            updated_at: updated.updatedAt
          }
        }
      };
    });
  }

  private generateHash(payload: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  // Nova função para simular gateway e status PENDING
  private async simulateGatewayWithPending(amount: number): Promise<{ delay: number; result: { success: boolean; status: number; body: any }; forcePending: boolean }> {
    let delay;
    let forcePending = false;
    if (Math.random() < 0.2) {
      // 20% das vezes, delay longo (10-15s), força PENDING
      delay = Math.floor(Math.random() * 5000) + 10000; // 10s a 15s
      forcePending = true;
    } else {
      delay = Math.floor(Math.random() * 2000) + 1000; // 1s a 3s
    }
    // Não aguarda o delay se for PENDING
    if (!forcePending) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    // Randomizar falha (20% de chance)
    const isFailed = Math.random() < 0.2;
    let result;
    if (isFailed) {
      result = {
        success: false,
        status: 400,
        body: { status: 'FAILED', message: 'Insufficient funds' }
      };
    } else {
      result = {
        success: true,
        status: 201,
        body: { 
          status: 'SUCCESS',
          message: 'Payment successful'
        }
      };
    }
    return { delay, result, forcePending };
  }
}
