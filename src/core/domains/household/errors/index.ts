/**
 * Household errors barrel export.
 *
 * @see INV-HOUSEHOLD-001: Household.tenantId == Resident.tenantId
 * @see Task 55: Household Isolation Enforcement
 */

export {
  // Tenant Isolation Errors
  householdTenantMismatch,
  residentTenantMismatch,
  householdNotInTenant,
  householdOwnershipInvalid,
  // Household Head Authorization Errors
  notHouseholdHead,
  householdHeadNotFound,
  // Household Member Access Control Errors
  notHouseholdMember,
  householdAccessDenied,
  // Cross-Household Isolation Errors
  crossHouseholdAccessDenied,
  resourceBelongsToDifferentHousehold,
  // Not Found Errors
  householdNotFound,
  residentNotFound,
  // Invariant Violation Errors
  householdInvariantViolation,
  householdConfigurationInvalid,
} from './householdErrors';
