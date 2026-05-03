/**
 * Module Container — Registers protocol implementations (adapters) as singletons.
 *
 * Binds core protocol interfaces to their infrastructure implementations:
 * - PrismaClient → initialized with PrismaPg driver adapter (Prisma 7.x requirement)
 * - CacheProtocol → RedisAdapter
 * - QueueProtocol → BullMQAdapter
 * - FileStorageProtocol → S3Adapter
 * - AuditQueueProtocol → AuditQueueStub (delegates to QueueProtocol, processed by auditWorker)
 * - NotificationQueueProtocol → NotificationQueueStub (delegates to QueueProtocol, processed by notificationWorker)
 *
 * HttpProtocol is intentionally omitted here — it will be registered
 * when a concrete HTTP adapter is implemented.
 */

import { asFunction, type AwilixContainer } from 'awilix';
import { initPrismaClient } from '@infrastructure/repositories/prismaClient';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { RedisAdapter } from '@infrastructure/networking/RedisAdapter';
import { BullMQAdapter } from '@infrastructure/networking/BullMQAdapter';
import { S3Adapter } from '@infrastructure/storage/S3Adapter';
import { AuditQueueStub } from '@infrastructure/queue/AuditQueueStub';
import { NotificationQueueStub } from '@infrastructure/queue/NotificationQueueStub';

export function registerModules(container: AwilixContainer): void {
  container.register({
    prismaClient: asFunction(() => {
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
      });
      const adapter = new PrismaPg(pool);
      return initPrismaClient({ adapter });
    }).singleton(),
    cacheProtocol: asFunction(RedisAdapter).singleton(),
    queueProtocol: asFunction(BullMQAdapter).singleton(),
    fileStorageProtocol: asFunction(S3Adapter).singleton(),
    auditQueueProtocol: asFunction(AuditQueueStub).singleton(),
    notificationQueueProtocol: asFunction(NotificationQueueStub).singleton(),
  });
}
