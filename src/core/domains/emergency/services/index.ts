/**
 * Emergency services barrel export.
 *
 * @see Requirements 20
 */

export {
  createSafetyCriticalProtectionService,
  emergencyAccessDenied,
  invalidSafetyCriticalOperation,
} from './SafetyCriticalProtectionService';

export type {
  ISafetyCriticalProtectionService,
  SafetyCriticalProtectionServiceDeps,
  IMembershipStatusResolver,
  ISubscriptionStatusResolver,
  ISafetyCriticalAuditLogger,
  IBillingAlertEmitter,
  IAdminAlertEmitter,
  IEmergencyQueueProtocol,
  ISecurityEventLogger,
} from './SafetyCriticalProtectionService';
