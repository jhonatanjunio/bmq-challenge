import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Prioriza a Idempotency-Key como Correlation-ID para rastreabilidade end-to-end, mas gera um novo UUID se não for fornecida
  const correlationId = (req.headers['idempotency-key'] as string) || uuidv4();
  
  // Adiciona ao objeto de request para uso nos controllers/services
  (req as any).correlationId = correlationId;
  
  // Adiciona ao header de resposta para facilitar o debug do cliente
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
};
