import crypto from 'crypto';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { PaymentStatus, Payment, Prisma } from '@prisma/client';
import { logger } from './LoggerService';

export interface PaymentResult {
  status: number;
  body: any;
  replay: boolean;
}

export interface GatewaySimulator {
  simulate(): Promise<{ delay: number; result: { success: boolean }; forcePending: boolean }>;
}

export class PaymentService {
  private repository: PaymentRepository;
  private gateway: GatewaySimulator;

  constructor(gateway?: GatewaySimulator) {
    this.repository = new PaymentRepository();
    this.gateway = gateway || { simulate: () => this.defaultSimulateGateway() };
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
        body: existing.responseBody || this.buildResponseBody(existing),
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
          body: existing.responseBody || this.buildResponseBody(existing),
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

      if (payment) {
        // FIX: Revalidar hash DENTRO do lock — duas requests concorrentes com
        // payloads diferentes podem ambas passar o fast check (ambas recebem null)
        if (payment.requestHash !== requestHash) {
          return {
            status: 409,
            body: { status: 'ERROR', message: 'Idempotency-Key already used with a different payload' },
            replay: false
          };
        }

        // FIX: Não reprocessar pagamento PENDING — retornar 202
        if (payment.status === PaymentStatus.PENDING) {
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
            replay: true
          };
        }

        // Já finalizado — retornar resposta persistida
        return {
          status: payment.httpStatusCode || 200,
          body: payment.responseBody || this.buildResponseBody(payment),
          replay: true
        };
      }

      // Nenhum registro existente — criar PENDING
      payment = await this.repository.create({
        idempotencyKey,
        requestHash,
        amount: payload.amount,
        customerId: payload.customerId,
        status: PaymentStatus.PENDING
      }, tx);

      // 3. Simula processamento externo (Gateway de Pagamento)
      const { result, forcePending } = await this.gateway.simulate();

      if (forcePending) {
        // Processamento durável: worker buscará este registro PENDING
        // Sem setTimeout — pagamento persistido, sobrevive a reinícios
        logger.info('Payment queued for async processing', {
          idempotencyKey,
          metadata: { paymentId: payment.id },
          source: 'service'
        });

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

      // Caminho síncrono: processa inline, persiste resposta atomicamente
      const finalStatus = result.success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
      const httpStatusCode = result.success ? 201 : 400;

      const updated = await this.repository.update(payment.id, {
        status: finalStatus,
        httpStatusCode,
        processedAt: new Date()
      }, tx);

      const responseBody = this.buildResponseBody(updated);
      // Persiste o body completo na mesma transação para replays futuros
      await this.repository.update(payment.id, { responseBody }, tx);

      return {
        status: httpStatusCode,
        body: responseBody,
        replay: false
      };
    });
  }

  private generateHash(payload: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async defaultSimulateGateway(): Promise<{ delay: number; result: { success: boolean }; forcePending: boolean }> {
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
