/**
 * Household services barrel export.
 *
 * @see Task 55: Household Isolation Enforcement (INV-HOUSEHOLD-001)
 */

export {
  HouseholdIsolationServiceImpl,
  type IHouseholdIsolationService,
  type HouseholdIsolationService,
  type HouseholdAccessCheckInput,
  type HouseholdAccessResult,
  type CrossHouseholdValidationInput,
  type HouseholdIsolationAuditEvent,
  type IHouseholdIsolationAuditEmitter,
  HouseholdAccessReason,
  HouseholdIsolationAuditEventType,
} from './HouseholdIsolationService';
