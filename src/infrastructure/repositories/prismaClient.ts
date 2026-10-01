/**
 * Prisma Client Singleton
 *
 * Exports a single PrismaClient instance to be shared across the application.
 * The instance is cached on `globalThis` to survive HMR reloads in development
 * without exhausting database connections.
 *
 * @example
 * ```ts
 * // In repository implementations:
 * import { getPrismaClient } from '@infrastructure/repositories/prismaClient';
 * const prisma = getPrismaClient();
 * const users = await prisma.user.findMany();
 * ```
 */

import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
};

/**
 * Creates and caches a PrismaClient singleton.
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

  const client = new PrismaClient({
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
