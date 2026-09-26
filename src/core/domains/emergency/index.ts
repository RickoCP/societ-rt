/**
 * Emergency domain barrel export.
 *
 * @see Requirements 10, 20
 */

// Entities
export type {
  EmergencyAlert,
  EmergencyAlertStatus,
  CreateEmergencyAlertInput,
} from './entities';

// Types
export {
  SafetyCriticalOperationCode,
  ALL_SAFETY_CRITICAL_OPERATIONS,
  isSafetyCriticalOperationCode,
  EmergencyMembershipPolicy,
  EMERGENCY_ALLOWED_STATUSES,
  EMERGENCY_DENIED_STATUSES,
} from './types';

export type {
  SafetyCriticalOperationRequest,
  SafetyCriticalCheckResult,
  EmergencyDenialReason,
  SafetyCriticalAuditEntry,
  EmergencyQueueMessage,
} from './types';

// Services
export {
  createSafetyCriticalProtectionService,
  emergencyAccessDenied,
  invalidSafetyCriticalOperation,
} from './services';

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
} from './services';

// Errors
export { emergencyAlertNotFound } from './errors/emergencyErrors';
