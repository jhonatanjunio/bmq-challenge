import { prisma } from '../config/database';

interface LogEntry {
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  correlationId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  source?: string;
}

class LoggerService {
  private persist(entry: LogEntry): void {
    // Fire-and-forget — não bloqueia o fluxo principal
    prisma.auditLog.create({
      data: {
        level: entry.level,
        message: entry.message,
        correlationId: entry.correlationId,
        idempotencyKey: entry.idempotencyKey,
        metadata: entry.metadata ?? undefined,
        source: entry.source
      }
    }).catch((err: any) => {
      console.error(`[LoggerService] Failed to persist log: ${err.message}`);
    });
  }

  private log(entry: LogEntry): void {
    const output = {
      timestamp: new Date().toISOString(),
      level: entry.level,
      message: entry.message,
      ...(entry.correlationId && { correlationId: entry.correlationId }),
      ...(entry.idempotencyKey && { idempotencyKey: entry.idempotencyKey }),
      ...(entry.metadata && { ...entry.metadata }),
      ...(entry.source && { source: entry.source })
    };

    if (entry.level === 'ERROR') {
      console.error(JSON.stringify(output));
    } else {
      console.log(JSON.stringify(output));
    }

    this.persist(entry);
  }

  info(message: string, context?: Partial<Omit<LogEntry, 'level' | 'message'>>): void {
    this.log({ level: 'INFO', message, ...context });
  }

  warn(message: string, context?: Partial<Omit<LogEntry, 'level' | 'message'>>): void {
    this.log({ level: 'WARN', message, ...context });
  }

  error(message: string, context?: Partial<Omit<LogEntry, 'level' | 'message'>>): void {
    this.log({ level: 'ERROR', message, ...context });
  }
}

export const logger = new LoggerService();
