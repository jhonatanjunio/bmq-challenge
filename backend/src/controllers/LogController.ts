import { Request, Response } from 'express';
import { prisma } from '../config/database';

export class LogController {
  async list(req: Request, res: Response): Promise<void> {
    const {
      level,
      correlationId,
      idempotencyKey,
      from,
      to,
      page = '1',
      limit = '50'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (level) where.level = level;
    if (correlationId) where.correlationId = correlationId;
    if (idempotencyKey) where.idempotencyKey = idempotencyKey;
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from as string);
      if (to) where.timestamp.lte = new Date(to as string);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  }
}
