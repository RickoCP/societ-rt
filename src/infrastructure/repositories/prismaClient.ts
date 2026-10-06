/**
 * Prisma Client Singleton
 *
 * Exports a single PrismaClient instance to be shared across the application.
 * The instance is cached on `globalThis` to survive HMR reloads in development
 * without exhausting database connections.
 *
 * Prisma 7.x requires a driver adapter for database connections.
 * We use @prisma/adapter-pg with the pg library.
 *
 * @example
 * ```ts
 * // In repository implementations:
 * import { getPrismaClient } from '@infrastructure/repositories/prismaClient';
 * const prisma = getPrismaClient();
 * const users = await prisma.user.findMany();
 * ```
 */

import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../../generated/prisma/client';

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
  __pool: pg.Pool | undefined;
};

/**
 * Creates and caches a PrismaClient singleton with PrismaPg adapter.
 *
 * If the client has already been initialized, the existing instance is
 * returned.
 *
 * @returns The shared PrismaClient instance
 */
export function initPrismaClient(): PrismaClient {
  if (globalForPrisma.__prisma) {
    return globalForPrisma.__prisma;
  }

  // Create connection pool if not exists
  if (!globalForPrisma.__pool) {
    globalForPrisma.__pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  // Create PrismaPg adapter (required for Prisma 7.x)
  const adapter = new PrismaPg(globalForPrisma.__pool);

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  globalForPrisma.__prisma = client;

  return client;
}

/**
 * Returns the cached PrismaClient instance.
 * If not initialized yet, initializes it automatically.
 */
export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    return initPrismaClient();
  }
  return globalForPrisma.__prisma;
}
