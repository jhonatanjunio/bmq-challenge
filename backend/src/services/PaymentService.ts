import crypto from 'crypto';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { PaymentStatus, Payment, Prisma } from '@prisma/client';
import { logger } from './LoggerService';

export interface PaymentResult {
  status: number;
  body: any;
  replay: boolean;
}

export class PaymentService {
  private repository: PaymentRepository;

  constructor() {
    this.repository = new PaymentRepository();
  }

  /**
   * Busca um pagamento pela chave e retorna resposta padronizada.
   * Usado pelo controller para resolver conflitos de idempotência (P2002).
   */
  async findByKey(idempotencyKey: string): Promise<PaymentResult | null> {
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (!existing) return null;

    if (existing.status !== 'PENDING') {
      return {
        status: existing.httpStatusCode || 200,
        body: this.buildResponseBody(existing),
        replay: true
      };
    }
    return {
      status: 202,
      body: {
        status: 'PENDING',
        message: 'Payment is being processed',
        transaction: {
          transaction_id: existing.id,
          customer_id: existing.customerId,
          amount: existing.amount,
          created_at: existing.createdAt,
          updated_at: existing.updatedAt
        }
      },
      replay: true
    };
  }

  /**
   * Constrói o body de resposta padronizado a partir de um registro Payment.
   * Centraliza a construção para garantir consistência em todos os caminhos (DRY).
   */
  private buildResponseBody(payment: Payment): object {
    return {
      status: payment.status,
      message: payment.status === PaymentStatus.SUCCESS ? 'Payment successful' : 'Payment failed',
      transaction: {
        transaction_id: payment.id,
        customer_id: payment.customerId,
        amount: payment.amount,
        created_at: payment.createdAt,
        updated_at: payment.updatedAt
      }
    };
  }

  /**
   * Processa o pagamento com Idempotência, Hashing e Transações ACID.
   */
  async processPayment(
    idempotencyKey: string,
    payload: { amount: number; customerId: string }
  ): Promise<PaymentResult> {
    const requestHash = this.generateHash(payload);

    // 1. Verificação inicial rápida (sem lock) para performance em retries de sucesso/falha já finalizados
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        return {
          status: 409,
          body: { status: 'ERROR', message: 'Idempotency-Key already used with a different payload' },
          replay: false
        };
      }

      if (existing.status !== PaymentStatus.PENDING) {
        return {
          status: existing.httpStatusCode || 200,
          body: this.buildResponseBody(existing),
          replay: true
        };
      }

      return {
        status: 202,
        body: {
          status: 'PENDING',
          message: 'Payment is being processed',
          transaction: {
            transaction_id: existing.id,
            customer_id: existing.customerId,
            amount: existing.amount,
            created_at: existing.createdAt,
            updated_at: existing.updatedAt
          }
        },
        replay: true
      };
    }

    // 2. Transação ACID — Prisma garante rollback automático em caso de falha
    return this.repository.transaction(async (tx: Prisma.TransactionClient) => {
      let payment = await this.repository.findByIdempotencyKeyWithLock(idempotencyKey, tx);

      if (!payment) {
        payment = await this.repository.create({
          idempotencyKey,
          requestHash,
          amount: payload.amount,
          customerId: payload.customerId,
          status: PaymentStatus.PENDING
        }, tx);
      } else if (payment.status !== PaymentStatus.PENDING) {
        // Double-check após adquirir o lock
        return {
          status: payment.httpStatusCode || 200,
          body: this.buildResponseBody(payment),
          replay: true
        };
      }

      // 3. Simula processamento externo (Gateway de Pagamento)
      const { delay, result, forcePending } = await this.simulateGateway();

      if (forcePending) {
        const paymentId = payment.id;
        // Processa de forma assíncrona — simula callback de gateway
        // Em produção: substituir por fila (BullMQ/SQS) com dead-letter queue
        setTimeout(async () => {
          try {
            const finalStatus = result.success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
            // Update único e atômico — evita estado parcial
            const updated = await this.repository.update(paymentId, {
              status: finalStatus,
              httpStatusCode: result.success ? 201 : 400,
              processedAt: new Date()
            });
            // Persiste responseBody em seguida (dados dependem do updatedAt)
            await this.repository.update(paymentId, { responseBody: this.buildResponseBody(updated) });
            logger.info('Processamento assíncrono concluído', {
              idempotencyKey,
              metadata: { paymentId, status: finalStatus },
              source: 'service'
            });
          } catch (error: any) {
            logger.error('Async payment processing failed', {
              idempotencyKey,
              metadata: { paymentId, error: error.message },
              source: 'service'
            });
          }
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
          },
          replay: false
        };
      }

      // Caso normal: aguarda processamento e retorna resultado
      const updated = await this.repository.update(payment.id, {
        status: result.success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
        httpStatusCode: result.success ? 201 : 400,
        processedAt: new Date()
      }, tx);
      const responseBody = this.buildResponseBody(updated);
      // Persiste o body completo para replays futuros
      await this.repository.update(payment.id, {
        responseBody
      }, tx);

      return {
        status: updated.httpStatusCode!,
        body: responseBody,
        replay: false
      };
    });
  }

  private generateHash(payload: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async simulateGateway(): Promise<{ delay: number; result: { success: boolean }; forcePending: boolean }> {
    let delay;
    let forcePending = false;
    if (Math.random() < 0.2) {
      delay = Math.floor(Math.random() * 5000) + 10000; // 10-15s
      forcePending = true;
    } else {
      delay = Math.floor(Math.random() * 2000) + 1000; // 1-3s
    }
    if (!forcePending) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const isFailed = Math.random() < 0.2;
    return { delay, result: { success: !isFailed }, forcePending };
  }
}
