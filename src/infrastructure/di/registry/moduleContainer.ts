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
 * - ShadowModeFeatureFlagService → Controls shadow authorization per route (FASE 1.9)
 * - TokenEntropyValidator → TokenEntropyValidatorImpl (validates/generates secure tokens, Task 40)
 *
 * HttpProtocol is intentionally omitted here — it will be registered
 * when a concrete HTTP adapter is implemented.
 */

import { asFunction, type AwilixContainer } from 'awilix';
import { initPrismaClient } from '@infrastructure/repositories/prismaClient';
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
import { createQuarantineManifestService } from '@infrastructure/quarantine';
import { createAuthorizationWriteCompatibilityService } from '@infrastructure/compatibility/AuthorizationWriteCompatibilityService';
import { createWritePathInventoryService } from '@infrastructure/compatibility/WritePathInventory';
import { createWritePathRetirementPolicyService } from '@infrastructure/compatibility/WritePathRetirementPolicy';
import { createWritePathFinalizationService } from '@infrastructure/compatibility/WritePathFinalizationService';
import {
  createLegacyDataRemediationService,
  createQuarantineValidator,
} from '@infrastructure/remediation';
import { ShadowModeFeatureFlagServiceImpl } from '@core/domains/authorization/services';
import { TokenEntropyValidatorImpl } from '@infrastructure/auth/TokenEntropyValidator';
import { SecureTokenStorageImpl } from '@infrastructure/auth/SecureTokenStorage';
import { TokenLeakDetectionServiceImpl } from '@infrastructure/auth/TokenLeakDetectionService';
import { TokenSecurityAuditServiceImpl } from '@infrastructure/auth/TokenSecurityAuditService';
import { StubPaymentGatewayImpl } from '@infrastructure/payment';
import { ShadowAuthExecutorImpl } from '@infrastructure/shadow/ShadowAuthExecutor';
import { CutoverFlagResolverImpl } from '@infrastructure/cutover/CutoverFlagResolver';
import { JWTServiceImpl } from '@infrastructure/utils/jwtService';

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

/**
 * Parse environment variables for shadow mode configuration.
 * 
 * Environment variables:
 * - SHADOW_MODE_ENABLED: 'true' or '1' to enable
 * - SHADOW_MODE_DEFAULT_BEHAVIOR: 'follow_global', 'disabled', or 'enabled'
 * - SHADOW_MODE_ROUTES_ENABLED: comma-separated list of route IDs
 * - SHADOW_MODE_ROUTES_DISABLED: comma-separated list of route IDs
 */
function parseShadowModeEnvConfig() {
  const envEnabled = process.env.SHADOW_MODE_ENABLED;
  const envDefaultBehavior = process.env.SHADOW_MODE_DEFAULT_BEHAVIOR;
  const envRoutesEnabled = process.env.SHADOW_MODE_ROUTES_ENABLED;
  const envRoutesDisabled = process.env.SHADOW_MODE_ROUTES_DISABLED;

  const globalEnabled =
    envEnabled?.toLowerCase() === 'true' || envEnabled === '1';

  let defaultBehavior: 'follow_global' | 'disabled' | 'enabled' = 'follow_global';
  if (envDefaultBehavior === 'disabled' || envDefaultBehavior === 'enabled') {
    defaultBehavior = envDefaultBehavior;
  }

  const routesEnabled = envRoutesEnabled
    ? envRoutesEnabled.split(',').map(r => r.trim()).filter(Boolean)
    : [];

  const routesDisabled = envRoutesDisabled
    ? envRoutesDisabled.split(',').map(r => r.trim()).filter(Boolean)
    : [];

  return {
    globalEnabled,
    defaultBehavior,
    routesEnabled,
    routesDisabled,
  };
}

/**
 * Parse environment variables for token entropy validation.
 *
 * Environment variables (all optional; defaults applied by the validator):
 * - TOKEN_MIN_ENTROPY_BITS: minimum required entropy in bits
 * - TOKEN_MIN_BYTE_LENGTH: minimum token length in bytes
 */
function parseTokenEntropyEnvConfig() {
  const minEntropyBits = Number.parseInt(
    process.env.TOKEN_MIN_ENTROPY_BITS ?? '',
    10,
  );
  const minByteLength = Number.parseInt(
    process.env.TOKEN_MIN_BYTE_LENGTH ?? '',
    10,
  );

  return {
    ...(Number.isFinite(minEntropyBits) ? { minimumEntropyBits: minEntropyBits } : {}),
    ...(Number.isFinite(minByteLength) ? { minimumByteLength: minByteLength } : {}),
  };
}

export function registerModules(container: AwilixContainer): void {
  container.register({
    prismaClient: asFunction(() => initPrismaClient()).singleton(),
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
    quarantineService: asFunction(() => createQuarantineManifestService()).singleton(),
    // Pre-Cutover Authorization Write Compatibility (Task 24 - Requirements 8, 9, 45)
    // Dual-write service: injects prismaClient + quarantineService (both registered above)
    authorizationWriteCompatibilityService: asFunction(
      createAuthorizationWriteCompatibilityService,
    ).singleton(),
    // Write Path Inventory (Task 24/28) — no dependencies
    writePathInventoryService: asFunction(() =>
      createWritePathInventoryService(),
    ).singleton(),
    // Write Path Retirement Policy (Task 28) — depends on inventory
    writePathRetirementPolicyService: asFunction(({ writePathInventoryService }) =>
      createWritePathRetirementPolicyService({
        inventoryService: writePathInventoryService,
      }),
    ).singleton(),
    // Write Path Finalization (Task 28 - Requirements 9, 48)
    // Orchestrates post-cutover retirement; injects inventory + policy + quarantine.
    writePathFinalizationService: asFunction(
      ({ writePathInventoryService, writePathRetirementPolicyService, quarantineService }) =>
        createWritePathFinalizationService({
          inventoryService: writePathInventoryService,
          policyService: writePathRetirementPolicyService,
          quarantineService,
        }),
    ).singleton(),
    // Shadow Mode Feature Flag Service (FASE 1.9 - Task 22)
    shadowModeFeatureFlagService: asFunction(() =>
      ShadowModeFeatureFlagServiceImpl({ envConfig: parseShadowModeEnvConfig() }),
    ).singleton(),
    // Token Entropy Validator (Task 40 - Requirement 51 AC 3)
    // Stateless service that validates/generates cryptographically secure tokens.
    tokenEntropyValidator: asFunction(() =>
      TokenEntropyValidatorImpl(parseTokenEntropyEnvConfig()),
    ).singleton(),
    // Secure Token Storage (Task 40 - Requirement 51, Design D2)
    // Hash-only storage patterns, key rotation support.
    secureTokenStorage: asFunction(() =>
      SecureTokenStorageImpl(),
    ).singleton(),
    // Token Leak Detection Service (Task 40 - Requirement 51)
    // Detects unusual access patterns, suspicious IPs, impossible travel.
    tokenLeakDetectionService: asFunction(() =>
      TokenLeakDetectionServiceImpl(),
    ).singleton(),
    // Token Security Audit Service (Task 40 - Requirement 24, 51)
    // Comprehensive audit logging for all token operations.
    tokenSecurityAuditService: asFunction(() =>
      TokenSecurityAuditServiceImpl({
        consoleLogging: process.env.NODE_ENV !== 'production',
        consoleMinSeverity: 'info',
      }),
    ).singleton(),
    // Legacy Data Remediation (Task 33 - Requirement 11)
    // Evidence-based membership remediation; injects prismaClient + reuses
    // quarantineService (registered above) via the QuarantineValidator wrapper.
    // RoleMappingService and RemediationReportGenerator default internally.
    legacyDataRemediationService: asFunction(({ prismaClient, quarantineService }) =>
      createLegacyDataRemediationService({
        prismaClient,
        quarantineValidator: createQuarantineValidator({ quarantineService }),
      }),
    ).singleton(),
    // Payment Gateway Protocol (Task 47 - Requirement 57)
    // Stub implementation for development; swap to Midtrans/Xendit in production.
    paymentGatewayProtocol: asFunction(() =>
      StubPaymentGatewayImpl({
        successRate: process.env.NODE_ENV === 'test' ? 1.0 : 0.9,
        simulatedDelayMs: process.env.NODE_ENV === 'test' ? 0 : 100,
        alwaysSucceed: process.env.PAYMENT_GATEWAY_ALWAYS_SUCCEED === 'true',
        alwaysFail: process.env.PAYMENT_GATEWAY_ALWAYS_FAIL === 'true',
      }),
    ).singleton(),
    // Shadow Auth Executor (Task 11 - Requirement 4)
    // Parallel execution of legacy and new auth for validation.
    shadowAuthExecutor: asFunction(({ logger }) =>
      ShadowAuthExecutorImpl({ logger }),
    ).singleton(),
    // Cutover Flag Resolver (Task 12.1-12.6 - Requirement 5)
    // Granular feature flag control for authorization cutover.
    // Supports global, domain, and route-specific flags with precedence.
    cutoverFlagResolver: asFunction(({ logger, shadowAuthExecutor }) =>
      CutoverFlagResolverImpl({ logger, shadowAuthExecutor }),
    ).singleton(),
    // JWT Service (multi-tenant access token generation/validation)
    // Stateless service for creating and validating JWT tokens with multi-tenant claims.
    jwtService: asFunction(() => JWTServiceImpl()).singleton(),
  });
}
