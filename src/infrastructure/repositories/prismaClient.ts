/**
 * Prisma Client Singleton
 *
 * Exports a single PrismaClient instance to be shared across the application.
 * The instance is cached on `globalThis` to survive HMR reloads in development
 * without exhausting database connections.
 *
 * Prisma 7.x requires an explicit driver adapter. This module uses a lazy
 * initialization pattern — the client is created on first access via
 * `initPrismaClient()`, which must be called once at application startup
 * before any repository accesses the client.
 *
 * @example
 * ```ts
 * // At application startup (e.g. in DI bootstrap):
 * import { initPrismaClient } from '@infrastructure/repositories/prismaClient';
 * import { PrismaPg } from '@prisma/adapter-pg';
 * import pg from 'pg';
 *
 * const pool = new pg.Pool({ connectionString: DATABASE_URL });
 * const adapter = new PrismaPg(pool);
 * initPrismaClient({ adapter });
 *
 * // In repository implementations:
 * import { getPrismaClient } from '@infrastructure/repositories/prismaClient';
 * const prisma = getPrismaClient();
 * const users = await prisma.user.findMany();
 * ```
 */

import { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
};

/**
 * Creates and caches a PrismaClient singleton.
 *
 * Accepts the same options as the PrismaClient constructor. Prisma 7.x
 * requires either an `adapter` (driver adapter) or an `accelerateUrl`.
 *
 * If the client has already been initialized, the existing instance is
 * returned and the new options are ignored.
 *
 * @param options - PrismaClient constructor options
 * @returns The shared PrismaClient instance
 */
export function initPrismaClient(
  options: ConstructorParameters<typeof PrismaClient>[0],
): PrismaClient {
  if (globalForPrisma.__prisma) {
    return globalForPrisma.__prisma;
  }

  const client = new PrismaClient(options);
  globalForPrisma.__prisma = client;

  return client;
}

/**
 * Returns the cached PrismaClient instance.
 *
 * @throws Error if `initPrismaClient` has not been called yet.
 */
export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    throw new Error(
      'PrismaClient has not been initialized. Call initPrismaClient() first.',
    );
  }
  return globalForPrisma.__prisma;
}
