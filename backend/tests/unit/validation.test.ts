// Testes unitários de validação de entrada do PaymentController
// Verifica todas as regras de validação sem servidor ativo

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

// Fns de mock declaradas no escopo do módulo para sobreviver ao clearAllMocks
// clearAllMocks limpa apenas o histórico de chamadas, não a implementação
// quando a referência é estável e a implementação é restaurada via beforeEach
const mockProcessPayment = jest.fn();
const mockFindByKey = jest.fn();

// Mock do PaymentService — usa as fns de módulo para que testes possam redefinir comportamento
jest.mock('../../src/services/PaymentService', () => ({
  PaymentService: jest.fn().mockImplementation(() => ({
    processPayment: mockProcessPayment,
    findByKey: mockFindByKey
  }))
}));

import { PaymentController } from '../../src/controllers/PaymentController';
import { Request, Response } from 'express';

// Resposta padrão de sucesso para a maioria dos testes de validação
const defaultSuccessResult = {
  status: 201,
  body: { status: 'SUCCESS', message: 'Payment successful' },
  replay: false
};

// Fábrica de objeto Request mockado — permite sobrescrever qualquer campo
const createMockReq = (overrides: Record<string, any> = {}): Partial<Request> => ({
  headers: { 'idempotency-key': 'test-key-valid' },
  body: { amount: 100, customerId: 'cust_123' },
  correlationId: 'corr-test-001',
  ...overrides
} as any);

// Fábrica de objeto Response mockado com encadeamento fluente
const createMockRes = () => {
  const res = {} as any;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe('PaymentController — Validação de Entrada', () => {
  let controller: PaymentController;

  beforeEach(() => {
    // Limpa apenas o histórico de chamadas, mantém as referências das fns
    mockProcessPayment.mockClear();
    mockFindByKey.mockClear();
    // Restaura a implementação padrão de sucesso antes de cada teste
    mockProcessPayment.mockResolvedValue(defaultSuccessResult);
    mockFindByKey.mockResolvedValue(null);
    controller = new PaymentController();
  });

  // ---------------------------------------------------------------------------
  // Validação do header Idempotency-Key
  // ---------------------------------------------------------------------------
  describe('Idempotency-Key header', () => {
    test('deve retornar 400 quando Idempotency-Key está ausente', async () => {
      const req = createMockReq({ headers: {} });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Idempotency-Key header is required' })
      );
    });

    test('deve retornar 400 quando Idempotency-Key excede 255 caracteres', async () => {
      const chaveGigante = 'k'.repeat(256);
      const req = createMockReq({ headers: { 'idempotency-key': chaveGigante } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Idempotency-Key must be at most 255 characters' })
      );
    });

    test('deve aceitar Idempotency-Key com exatamente 255 caracteres', async () => {
      const chaveLimite = 'k'.repeat(255);
      const req = createMockReq({ headers: { 'idempotency-key': chaveLimite } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      // Não deve retornar erro 400 por causa da chave
      const statusCall = (res.status as jest.Mock).mock.calls[0]?.[0];
      expect(statusCall).not.toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Validação do campo amount
  // ---------------------------------------------------------------------------
  describe('Validação do campo amount', () => {
    test('deve retornar 400 quando amount é negativo', async () => {
      const req = createMockReq({ body: { amount: -50, customerId: 'cust_123' } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Amount must be a positive number' })
      );
    });

    test('deve retornar 400 quando amount é zero', async () => {
      const req = createMockReq({ body: { amount: 0, customerId: 'cust_123' } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Amount must be a positive number' })
      );
    });

    test('deve retornar 400 quando amount é string não numérica', async () => {
      const req = createMockReq({ body: { amount: 'abc', customerId: 'cust_123' } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Amount must be a valid positive decimal number' })
      );
    });

    test('deve retornar 400 quando amount é string com valor negativo', async () => {
      const req = createMockReq({ body: { amount: '-10', customerId: 'cust_123' } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('deve retornar 400 quando amount é undefined', async () => {
      const req = createMockReq({ body: { customerId: 'cust_123' } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('deve aceitar amount como string numérica válida (ex: "99.99")', async () => {
      const req = createMockReq({ body: { amount: '99.99', customerId: 'cust_123' } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      // Não deve rejeitar string decimal válida
      const statusCall = (res.status as jest.Mock).mock.calls[0]?.[0];
      expect(statusCall).not.toBe(400);
    });

    test('deve aceitar amount como número positivo inteiro', async () => {
      const req = createMockReq({ body: { amount: 250, customerId: 'cust_123' } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      const statusCall = (res.status as jest.Mock).mock.calls[0]?.[0];
      expect(statusCall).not.toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Validação do campo customerId
  // ---------------------------------------------------------------------------
  describe('Validação do campo customerId', () => {
    test('deve retornar 400 quando customerId está ausente', async () => {
      const req = createMockReq({ body: { amount: 100 } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'CustomerId must be a non-empty string' })
      );
    });

    test('deve retornar 400 quando customerId é string vazia', async () => {
      const req = createMockReq({ body: { amount: 100, customerId: '' } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'CustomerId must be a non-empty string' })
      );
    });

    test('deve retornar 400 quando customerId é apenas espaços em branco', async () => {
      const req = createMockReq({ body: { amount: 100, customerId: '   ' } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'CustomerId must be a non-empty string' })
      );
    });

    test('deve retornar 400 quando customerId excede 255 caracteres', async () => {
      const clienteGigante = 'c'.repeat(256);
      const req = createMockReq({ body: { amount: 100, customerId: clienteGigante } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'CustomerId must be at most 255 characters' })
      );
    });

    test('deve aceitar customerId com exatamente 255 caracteres', async () => {
      const clienteLimite = 'c'.repeat(255);
      const req = createMockReq({ body: { amount: 100, customerId: clienteLimite } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      const statusCall = (res.status as jest.Mock).mock.calls[0]?.[0];
      expect(statusCall).not.toBe(400);
    });

    test('deve retornar 400 quando customerId é um número (não string)', async () => {
      const req = createMockReq({ body: { amount: 100, customerId: 12345 } });
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'CustomerId must be a non-empty string' })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Entrada válida — deve passar todas as validações e chamar o serviço
  // ---------------------------------------------------------------------------
  describe('Entrada válida', () => {
    test('deve processar o pagamento quando todos os campos são válidos', async () => {
      const req = createMockReq({
        headers: { 'idempotency-key': 'chave-valida-001' },
        body: { amount: 150.50, customerId: 'cust_xyz' }
      });
      const res = createMockRes();

      await controller.create(req as Request, res);

      // Nenhum status 400 deve ter sido retornado
      const statusCalls = (res.status as jest.Mock).mock.calls.map((c: any[]) => c[0]);
      expect(statusCalls).not.toContain(400);

      // A resposta deve ter sido enviada com algum código de sucesso
      expect(res.json).toHaveBeenCalled();
    });

    test('deve passar validação com amount decimal de duas casas', async () => {
      const req = createMockReq({
        body: { amount: 99.99, customerId: 'cust_decimal' }
      });
      const res = createMockRes();

      await controller.create(req as Request, res);

      const statusCalls = (res.status as jest.Mock).mock.calls.map((c: any[]) => c[0]);
      expect(statusCalls).not.toContain(400);
    });

    test('deve definir o header X-Idempotent-Replay quando resultado é replay', async () => {
      // Reconfigura a fn de módulo para retornar replay:true neste teste
      mockProcessPayment.mockResolvedValueOnce({
        status: 201,
        body: { status: 'SUCCESS', message: 'Payment successful' },
        replay: true
      });

      const req = createMockReq();
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Idempotent-Replay', 'true');
    });

    test('não deve definir X-Idempotent-Replay quando resultado não é replay', async () => {
      // A implementação padrão já retorna replay:false — não precisa de override
      const req = createMockReq();
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.setHeader).not.toHaveBeenCalledWith('X-Idempotent-Replay', 'true');
    });
  });

  // ---------------------------------------------------------------------------
  // Tratamento de erros internos
  // ---------------------------------------------------------------------------
  describe('Tratamento de erros internos', () => {
    test('deve retornar 503 quando o serviço lança exceção inesperada', async () => {
      // Força rejeição em todas as tentativas de retry (MAX_ATTEMPTS = 3 por padrão)
      // para garantir que o controller não recupere com a implementação padrão
      mockProcessPayment.mockRejectedValue(new Error('Erro interno simulado'));

      const req = createMockReq();
      const res = createMockRes();

      await controller.create(req as Request, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ERROR' })
      );
    });

    test('deve retornar 503 quando processWithRetry esgota todas as tentativas', async () => {
      // Retorna null em todas as chamadas para simular esgotamento de retries
      mockProcessPayment.mockResolvedValue(null as any);

      const req = createMockReq();
      const res = createMockRes();

      await controller.create(req as Request, res);

      // O controller retorna 503 quando result é null após todos os retries
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });
});
