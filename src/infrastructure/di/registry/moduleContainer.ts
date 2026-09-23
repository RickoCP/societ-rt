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
 * - RealtimeBusProtocol → RedisPubSubAdapter (Redis pub/sub for cross-instance event distribution)
 * - WebSocketProtocol → WebSocketServerImpl (ws library on separate port with JWT auth)
 * - IoTGatewayProtocol → TuyaGatewayAdapter (Tuya IoT Cloud integration with OAuth 2.0, retry, HMAC-SHA256)
 * - CircuitBreakerProtocol → CircuitBreakerImpl (circuit breaker for Tuya Cloud API resilience)
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
import { RedisPubSubAdapter } from '@infrastructure/realtime/RedisPubSubAdapter';
import { WebSocketServerImpl } from '@infrastructure/realtime/WebSocketServer';
import { TuyaGatewayAdapter } from '@infrastructure/iot/TuyaGatewayAdapter';
import { CircuitBreakerImpl } from '@infrastructure/iot/CircuitBreakerImpl';
import { IoTMetricsEmitterImpl } from '@infrastructure/iot/IoTMetricsEmitter';
import { AutomationEngineImpl } from '@infrastructure/automation/AutomationEngineImpl';
import { TuyaAlarmAdapter } from '@infrastructure/alarm/TuyaAlarmAdapter';

/**
 * Select the physical-alarm provider implementation.
 *
 * Today only Tuya (SmartLife Cloud) is implemented. When the RT migrates to
 * Home Assistant, add a HomeAssistantAlarmAdapter implementing AlarmProtocol
 * and add a `case 'homeassistant'` here — no caller/use-case/UI changes needed.
 */
function selectAlarmAdapter() {
  const provider = (process.env.ALARM_PROVIDER ?? 'tuya').toLowerCase();
  switch (provider) {
    // case 'homeassistant':
    //   return HomeAssistantAlarmAdapter;
    case 'tuya':
    default:
      return TuyaAlarmAdapter;
  }
}

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
    realtimeBusProtocol: asFunction(RedisPubSubAdapter).singleton(),
    webSocketProtocol: asFunction(WebSocketServerImpl).singleton(),
    iotGatewayProtocol: asFunction(TuyaGatewayAdapter).singleton(),
    alarmProtocol: asFunction(selectAlarmAdapter()).singleton(),
    circuitBreakerProtocol: asFunction(CircuitBreakerImpl).singleton(),
    iotMetricsEmitter: asFunction(IoTMetricsEmitterImpl).singleton(),
    automationEngineProtocol: asFunction(AutomationEngineImpl).singleton(),
  });
}
