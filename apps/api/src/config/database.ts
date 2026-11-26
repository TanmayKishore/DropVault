import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export const checkDatabaseConnection = async (): Promise<{ connected: boolean; error?: string }> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database connection error';
    return { connected: false, error: message };
  }
};
