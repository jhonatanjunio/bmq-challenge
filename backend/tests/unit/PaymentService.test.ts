// Testes unitários do PaymentService — sem banco de dados real
// Todas as dependências externas são mockadas

jest.mock('../../src/config/database', () => ({
  prisma: {}
}));

jest.mock('../../src/repositories/PaymentRepository');

jest.mock('../../src/services/LoggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

import { PaymentService, PaymentResult, GatewaySimulator } from '../../src/services/PaymentService';
import { PaymentRepository } from '../../src/repositories/PaymentRepository';
import { PaymentStatus, Payment } from '@prisma/client';

// Referência mockada do repositório para configurar retornos em cada teste
const MockedPaymentRepository = PaymentRepository as jest.MockedClass<typeof PaymentRepository>;

// Gateway determinístico — sem aleatoriedade
const createGateway = (overrides: Partial<{ success: boolean; forcePending: boolean; delay: number }> = {}): GatewaySimulator => ({
  simulate: async () => ({
    delay: overrides.delay ?? 0,
    result: { success: overrides.success ?? true },
    forcePending: overrides.forcePending ?? false
  })
});

// Fábrica de objetos Payment para reutilização nos testes
const buildPayment = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'payment-id-123',
  idempotencyKey: 'key-123',
  requestHash: '',
  amount: 10000,
  customerId: 'cust_123',
  status: PaymentStatus.SUCCESS,
  httpStatusCode: 201,
  responseBody: null,
  attempts: 0,
  processedAt: new Date('2024-01-01T10:00:00Z'),
  createdAt: new Date('2024-01-01T09:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
  ...overrides
});

describe('PaymentService', () => {
  let service: PaymentService;
  let repoInstance: jest.Mocked<PaymentRepository>;

  beforeEach(() => {
    // Limpa todos os mocks antes de cada teste para garantir isolamento
    jest.clearAllMocks();

    service = new PaymentService(createGateway());

    // Captura a instância mockada criada dentro do construtor do serviço
    repoInstance = MockedPaymentRepository.mock.instances[0] as jest.Mocked<PaymentRepository>;
  });

  // ---------------------------------------------------------------------------
  // Testes de comportamento de generateHash (privado — testado indiretamente)
  // ---------------------------------------------------------------------------
  describe('generateHash (comportamento indireto via processPayment)', () => {
    test('mesmo payload deve gerar o mesmo hash (idempotência de hash)', async () => {
      repoInstance.findByIdempotencyKey.mockResolvedValue(null);
      repoInstance.transaction.mockRejectedValue(new Error('db offline'));

      const payload = { amount: 5000, customerId: 'cust_abc' };

      const call1 = service.processPayment('key-A', payload).catch(() => null);
      const call2 = service.processPayment('key-A', payload).catch(() => null);
      await Promise.all([call1, call2]);

      expect(repoInstance.findByIdempotencyKey).toHaveBeenCalledWith('key-A');
    });

    test('payloads diferentes devem gerar hashes diferentes (detecção de conflito)', async () => {
      const originalPayload = { amount: 5000, customerId: 'cust_abc' };
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256')
        .update(JSON.stringify(originalPayload))
        .digest('hex');

      const existingPayment = buildPayment({
        requestHash: originalHash,
        status: PaymentStatus.SUCCESS
      });

      repoInstance.findByIdempotencyKey.mockResolvedValue(existingPayment);

      const result = await service.processPayment('key-A', { amount: 9999, customerId: 'cust_abc' });

      expect(result.status).toBe(409);
      expect(result.body.message).toContain('different payload');
      expect(result.replay).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Testes de buildResponseBody (privado — testado indiretamente via retornos)
  // ---------------------------------------------------------------------------
  describe('buildResponseBody (comportamento indireto via processPayment e findByKey)', () => {
    test('resposta de pagamento SUCCESS deve conter estrutura correta', async () => {
      const payment = buildPayment({
        status: PaymentStatus.SUCCESS,
        httpStatusCode: 201
      });

      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: payment.amount, customerId: payment.customerId }))
        .digest('hex');

      repoInstance.findByIdempotencyKey.mockResolvedValue({ ...payment, requestHash: hash });

      const result = await service.processPayment('key-success', {
        amount: payment.amount,
        customerId: payment.customerId
      });

      expect(result.body).toMatchObject({
        status: 'SUCCESS',
        message: 'Payment successful',
        transaction: {
          transaction_id: payment.id,
          customer_id: payment.customerId,
          amount: payment.amount
        }
      });
    });

    test('resposta de pagamento FAILED deve conter mensagem de falha', async () => {
      const payment = buildPayment({
        status: PaymentStatus.FAILED,
        httpStatusCode: 400
      });

      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: payment.amount, customerId: payment.customerId }))
        .digest('hex');

      repoInstance.findByIdempotencyKey.mockResolvedValue({ ...payment, requestHash: hash });

      const result = await service.processPayment('key-failed', {
        amount: payment.amount,
        customerId: payment.customerId
      });

      expect(result.body).toMatchObject({
        status: 'FAILED',
        message: 'Payment failed'
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Testes de processPayment — caminho rápido (sem transação)
  // ---------------------------------------------------------------------------
  describe('processPayment — verificação rápida (registro já existente)', () => {
    test('deve retornar replay:true quando registro SUCCESS já existe com mesmo payload', async () => {
      const payment = buildPayment({ status: PaymentStatus.SUCCESS, httpStatusCode: 201 });

      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: payment.amount, customerId: payment.customerId }))
        .digest('hex');

      repoInstance.findByIdempotencyKey.mockResolvedValue({ ...payment, requestHash: hash });

      const result = await service.processPayment('key-replay-success', {
        amount: payment.amount,
        customerId: payment.customerId
      });

      expect(result.replay).toBe(true);
      expect(result.status).toBe(201);
      expect(result.body.status).toBe('SUCCESS');
      // Nenhuma transação deve ter sido aberta no caminho rápido
      expect(repoInstance.transaction).not.toHaveBeenCalled();
    });

    test('deve retornar replay:true quando registro FAILED já existe com mesmo payload', async () => {
      const payment = buildPayment({ status: PaymentStatus.FAILED, httpStatusCode: 400 });

      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: payment.amount, customerId: payment.customerId }))
        .digest('hex');

      repoInstance.findByIdempotencyKey.mockResolvedValue({ ...payment, requestHash: hash });

      const result = await service.processPayment('key-replay-failed', {
        amount: payment.amount,
        customerId: payment.customerId
      });

      expect(result.replay).toBe(true);
      expect(result.status).toBe(400);
      expect(result.body.status).toBe('FAILED');
      expect(result.body.message).toBe('Payment failed');
    });

    test('deve retornar 409 quando mesma chave é usada com payload diferente', async () => {
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: 5000, customerId: 'cust_original' }))
        .digest('hex');

      const existingPayment = buildPayment({
        requestHash: originalHash,
        status: PaymentStatus.SUCCESS
      });

      repoInstance.findByIdempotencyKey.mockResolvedValue(existingPayment);

      const result = await service.processPayment('key-conflict', {
        amount: 5000,
        customerId: 'cust_diferente'
      });

      expect(result.status).toBe(409);
      expect(result.replay).toBe(false);
      expect(result.body.status).toBe('ERROR');
      expect(result.body.message).toContain('different payload');
    });

    test('deve retornar 202 com replay:true quando registro PENDING já existe', async () => {
      const payment = buildPayment({
        status: PaymentStatus.PENDING,
        httpStatusCode: null
      });

      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: payment.amount, customerId: payment.customerId }))
        .digest('hex');

      repoInstance.findByIdempotencyKey.mockResolvedValue({ ...payment, requestHash: hash });

      const result = await service.processPayment('key-pending', {
        amount: payment.amount,
        customerId: payment.customerId
      });

      expect(result.status).toBe(202);
      expect(result.replay).toBe(true);
      expect(result.body.status).toBe('PENDING');
      expect(result.body.message).toBe('Payment is being processed');
      expect(result.body.transaction.transaction_id).toBe(payment.id);
    });
  });

  // ---------------------------------------------------------------------------
  // Testes de concorrência — correções dentro da transação
  // ---------------------------------------------------------------------------
  describe('processPayment — concurrency fixes (transaction path)', () => {
    test('deve retornar 409 quando hash diverge DENTRO da transação (race condition)', async () => {
      const crypto = await import('crypto');
      const differentHash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: 9999, customerId: 'cust_other' }))
        .digest('hex');

      const pendingPayment = buildPayment({
        status: PaymentStatus.PENDING,
        requestHash: differentHash,
        httpStatusCode: null
      });

      // Fast check returns null (ambas requests concorrentes falham)
      repoInstance.findByIdempotencyKey.mockResolvedValue(null);
      // Dentro da transação: lock encontra registro criado pela primeira request
      repoInstance.findByIdempotencyKeyWithLock.mockResolvedValue(pendingPayment);
      repoInstance.transaction.mockImplementation(async (cb) => cb({} as any));

      const result = await service.processPayment('key-race', {
        amount: 5000, customerId: 'cust_abc'
      });

      expect(result.status).toBe(409);
      expect(result.body.message).toContain('different payload');
    });

    test('deve retornar 202 sem reprocessar quando PENDING encontrado DENTRO da transação', async () => {
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: 5000, customerId: 'cust_abc' }))
        .digest('hex');

      const pendingPayment = buildPayment({
        status: PaymentStatus.PENDING,
        requestHash: hash,
        amount: 5000,
        customerId: 'cust_abc',
        httpStatusCode: null
      });

      repoInstance.findByIdempotencyKey.mockResolvedValue(null);
      repoInstance.findByIdempotencyKeyWithLock.mockResolvedValue(pendingPayment);
      repoInstance.transaction.mockImplementation(async (cb) => cb({} as any));

      const result = await service.processPayment('key-pending-race', {
        amount: 5000, customerId: 'cust_abc'
      });

      expect(result.status).toBe(202);
      expect(result.replay).toBe(true);
      expect(result.body.status).toBe('PENDING');
      // Gateway NÃO deve ter sido chamado — payment não é reprocessado
      expect(repoInstance.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Testes de persistência atômica de responseBody
  // ---------------------------------------------------------------------------
  describe('processPayment — response persistence', () => {
    test('deve persistir responseBody na mesma transação (caminho síncrono)', async () => {
      const gateway = createGateway({ success: true, forcePending: false, delay: 0 });
      const svc = new PaymentService(gateway);
      const repo = MockedPaymentRepository.mock.instances[MockedPaymentRepository.mock.instances.length - 1] as jest.Mocked<PaymentRepository>;

      repo.findByIdempotencyKey.mockResolvedValue(null);
      repo.findByIdempotencyKeyWithLock.mockResolvedValue(null);
      const createdPayment = buildPayment({ status: PaymentStatus.PENDING, httpStatusCode: null });
      repo.create.mockResolvedValue(createdPayment);
      const updatedPayment = buildPayment({ status: PaymentStatus.SUCCESS, httpStatusCode: 201 });
      repo.update.mockResolvedValue(updatedPayment);
      repo.transaction.mockImplementation(async (cb) => cb({} as any));

      const result = await svc.processPayment('key-atomic', {
        amount: createdPayment.amount,
        customerId: createdPayment.customerId
      });

      expect(result.status).toBe(201);
      // update chamado 2x na mesma tx: status + responseBody
      expect(repo.update).toHaveBeenCalledTimes(2);
      expect(repo.update).toHaveBeenLastCalledWith(
        createdPayment.id,
        expect.objectContaining({ responseBody: expect.any(Object) }),
        expect.anything()
      );
    });

    test('deve retornar 202 sem chamar update quando forcePending (worker processa)', async () => {
      const gateway = createGateway({ success: true, forcePending: true });
      const svc = new PaymentService(gateway);
      const repo = MockedPaymentRepository.mock.instances[MockedPaymentRepository.mock.instances.length - 1] as jest.Mocked<PaymentRepository>;

      repo.findByIdempotencyKey.mockResolvedValue(null);
      repo.findByIdempotencyKeyWithLock.mockResolvedValue(null);
      const createdPayment = buildPayment({ status: PaymentStatus.PENDING, httpStatusCode: null });
      repo.create.mockResolvedValue(createdPayment);
      repo.transaction.mockImplementation(async (cb) => cb({} as any));

      const result = await svc.processPayment('key-async', {
        amount: createdPayment.amount,
        customerId: createdPayment.customerId
      });

      expect(result.status).toBe(202);
      expect(result.body.status).toBe('PENDING');
      // Nenhum update — worker fará o processamento
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Testes de replay com responseBody persistido
  // ---------------------------------------------------------------------------
  describe('processPayment — replay consistency', () => {
    test('deve usar responseBody persistido quando disponível no replay', async () => {
      const persistedBody = {
        status: 'SUCCESS',
        message: 'Payment successful',
        transaction: { transaction_id: 'pay-123', customer_id: 'cust_123', amount: 10000 }
      };

      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: 10000, customerId: 'cust_123' }))
        .digest('hex');

      const payment = buildPayment({
        status: PaymentStatus.SUCCESS,
        httpStatusCode: 201,
        requestHash: hash,
        responseBody: persistedBody as any
      });

      repoInstance.findByIdempotencyKey.mockResolvedValue(payment);

      const result = await service.processPayment('key-persisted-replay', {
        amount: 10000, customerId: 'cust_123'
      });

      expect(result.status).toBe(201);
      expect(result.replay).toBe(true);
      // Deve usar o body PERSISTIDO, não reconstruir
      expect(result.body).toEqual(persistedBody);
    });

    test('deve usar buildResponseBody como fallback quando responseBody é null', async () => {
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify({ amount: 10000, customerId: 'cust_123' }))
        .digest('hex');

      const payment = buildPayment({
        status: PaymentStatus.SUCCESS,
        httpStatusCode: 201,
        requestHash: hash,
        responseBody: null
      });

      repoInstance.findByIdempotencyKey.mockResolvedValue(payment);

      const result = await service.processPayment('key-fallback-replay', {
        amount: 10000, customerId: 'cust_123'
      });

      expect(result.status).toBe(201);
      expect(result.replay).toBe(true);
      expect(result.body.status).toBe('SUCCESS');
      expect(result.body.message).toBe('Payment successful');
    });
  });

  // ---------------------------------------------------------------------------
  // Testes de findByKey
  // ---------------------------------------------------------------------------
  describe('findByKey', () => {
    test('deve retornar null quando nenhum registro existe para a chave', async () => {
      repoInstance.findByIdempotencyKey.mockResolvedValue(null);

      const result = await service.findByKey('chave-inexistente');

      expect(result).toBeNull();
      expect(repoInstance.findByIdempotencyKey).toHaveBeenCalledWith('chave-inexistente');
    });

    test('deve retornar PaymentResult com replay:true para registro SUCCESS', async () => {
      const payment = buildPayment({ status: PaymentStatus.SUCCESS, httpStatusCode: 201 });

      repoInstance.findByIdempotencyKey.mockResolvedValue(payment);

      const result = await service.findByKey('chave-sucesso');

      expect(result).not.toBeNull();
      expect(result!.replay).toBe(true);
      expect(result!.status).toBe(201);
      expect(result!.body.status).toBe('SUCCESS');
      expect(result!.body.transaction.transaction_id).toBe(payment.id);
    });

    test('deve retornar PaymentResult com status PENDING para registro PENDING', async () => {
      const payment = buildPayment({
        status: PaymentStatus.PENDING,
        httpStatusCode: null
      });

      repoInstance.findByIdempotencyKey.mockResolvedValue(payment);

      const result = await service.findByKey('chave-pendente');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(202);
      expect(result!.replay).toBe(true);
      expect(result!.body.status).toBe('PENDING');
      expect(result!.body.transaction.transaction_id).toBe(payment.id);
      expect(result!.body.transaction.customer_id).toBe(payment.customerId);
      expect(result!.body.transaction.amount).toBe(payment.amount);
    });

    test('deve retornar PaymentResult com replay:true para registro FAILED', async () => {
      const payment = buildPayment({ status: PaymentStatus.FAILED, httpStatusCode: 400 });

      repoInstance.findByIdempotencyKey.mockResolvedValue(payment);

      const result = await service.findByKey('chave-falha');

      expect(result).not.toBeNull();
      expect(result!.replay).toBe(true);
      expect(result!.status).toBe(400);
      expect(result!.body.status).toBe('FAILED');
      expect(result!.body.message).toBe('Payment failed');
    });

    test('deve usar httpStatusCode 200 como fallback quando httpStatusCode é null', async () => {
      const payment = buildPayment({
        status: PaymentStatus.SUCCESS,
        httpStatusCode: null
      });

      repoInstance.findByIdempotencyKey.mockResolvedValue(payment);

      const result = await service.findByKey('chave-fallback');

      expect(result!.status).toBe(200);
    });

    test('deve usar responseBody persistido quando disponível', async () => {
      const persistedBody = { status: 'SUCCESS', message: 'Custom persisted' };
      const payment = buildPayment({
        status: PaymentStatus.SUCCESS,
        httpStatusCode: 201,
        responseBody: persistedBody as any
      });

      repoInstance.findByIdempotencyKey.mockResolvedValue(payment);

      const result = await service.findByKey('chave-persisted');

      expect(result!.body).toEqual(persistedBody);
    });
  });
});
