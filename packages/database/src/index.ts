import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma client, re-exported for all services. Using a global in dev
 * prevents connection exhaustion from hot-reload re-instantiation.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export the generated client types so consumers import everything from here.
export * from '@prisma/client';
