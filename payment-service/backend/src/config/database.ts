import { PrismaClient } from '@prisma/client';

/**
 * Singleton Pattern para a instância do PrismaClient.
 * Evita a criação de múltiplas conexões com o banco de dados, o que pode esgotar o pool de conexões,
 * especialmente em ambientes serverless ou durante o hot-reload em desenvolvimento.
 */
class PrismaService {
  private static instance: PrismaClient;

  private constructor() {}

  public static getInstance(): PrismaClient {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaClient({
        log: ['error', 'warn'],
      });
    }
    return PrismaService.instance;
  }
}

export const prisma = PrismaService.getInstance();
