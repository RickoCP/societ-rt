/**
 * Household-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Error codes follow the Authorization Error Codes specification.
 *
 * SECURITY CONSIDERATIONS:
 * - Error messages MUST NOT expose internal details
 * - Errors MUST NOT leak cross-tenant or cross-household information
 *
 * @see INV-HOUSEHOLD-001: Household.tenantId == Resident.tenantId
 * @see Task 55: Household Isolation Enforcement
 */

import type { AppError } from '@core/utils';
import { authorizationError, validationError, businessError, notFoundError } from '@core/utils';

// ---------------------------------------------------------------------------
// Tenant Isolation Errors
// ---------------------------------------------------------------------------

/**
 * Household tenant does not match expected tenant.
 * INV-HOUSEHOLD-001 violation - tenant isolation breach attempt.
 * HTTP Status: 403
 */
export function householdTenantMismatch(): AppError {
  return authorizationError(
    'HOUSEHOLD_TENANT_MISMATCH',
    'Household belongs to a different tenant',
    { userMessage: 'You do not have access to this household' },
  );
}

/**
 * Resident tenant does not match household tenant.
 * INV-HOUSEHOLD-001 violation - data integrity issue.
 * HTTP Status: 403
 */
export function residentTenantMismatch(): AppError {
  return authorizationError(
    'RESIDENT_TENANT_MISMATCH',
    'Resident tenant does not match household tenant',
    { userMessage: 'Cannot access resident from a different tenant' },
  );
}

// ---------------------------------------------------------------------------
// Household Ownership Errors
// ---------------------------------------------------------------------------

/**
 * Household does not belong to the expected tenant.
 * HTTP Status: 403
 */
export function householdNotInTenant(): AppError {
  return authorizationError(
    'HOUSEHOLD_NOT_IN_TENANT',
    'Household is not part of the active tenant',
    { userMessage: 'This household is not part of your community' },
  );
}

/**
 * Household ownership validation failed.
 * HTTP Status: 403
 */
export function householdOwnershipInvalid(): AppError {
  return authorizationError(
    'HOUSEHOLD_OWNERSHIP_INVALID',
    'Household ownership could not be validated',
    { userMessage: 'Unable to verify household ownership' },
  );
}

// ---------------------------------------------------------------------------
// Household Head Authorization Errors
// ---------------------------------------------------------------------------

/**
 * User is not the household head.
 * HTTP Status: 403
 */
export function notHouseholdHead(): AppError {
  return authorizationError(
    'NOT_HOUSEHOLD_HEAD',
    'User is not the head of this household',
    { userMessage: 'Only the household head can perform this action' },
  );
}

/**
 * Household head not found.
 * HTTP Status: 404
 */
export function householdHeadNotFound(): AppError {
  return notFoundError(
    'HOUSEHOLD_HEAD_NOT_FOUND',
    'No household head is assigned to this household',
    { userMessage: 'This household does not have a designated head' },
  );
}

// ---------------------------------------------------------------------------
// Household Member Access Control Errors
// ---------------------------------------------------------------------------

/**
 * User is not a member of the household.
 * HTTP Status: 403
 */
export function notHouseholdMember(): AppError {
  return authorizationError(
    'NOT_HOUSEHOLD_MEMBER',
    'User is not a member of this household',
    { userMessage: 'You are not a member of this household' },
  );
}

/**
 * User does not have permission to access household data.
 * HTTP Status: 403
 */
export function householdAccessDenied(): AppError {
  return authorizationError(
    'HOUSEHOLD_ACCESS_DENIED',
    'User does not have permission to access this household',
    { userMessage: 'You do not have permission to access this household' },
  );
}

// ---------------------------------------------------------------------------
// Cross-Household Isolation Errors
// ---------------------------------------------------------------------------

/**
 * Attempted cross-household access denied.
 * HTTP Status: 403
 */
export function crossHouseholdAccessDenied(): AppError {
  return authorizationError(
    'CROSS_HOUSEHOLD_ACCESS_DENIED',
    'Cannot access data from another household',
    { userMessage: 'You cannot access data from another household' },
  );
}

/**
 * Resource belongs to a different household.
 * HTTP Status: 403
 */
export function resourceBelongsToDifferentHousehold(): AppError {
  return authorizationError(
    'RESOURCE_BELONGS_TO_DIFFERENT_HOUSEHOLD',
    'Resource belongs to a different household',
    { userMessage: 'This resource belongs to another household' },
  );
}

// ---------------------------------------------------------------------------
// Not Found Errors
// ---------------------------------------------------------------------------

/**
 * Household not found.
 * HTTP Status: 404
 */
export function householdNotFound(): AppError {
  return notFoundError(
    'HOUSEHOLD_NOT_FOUND',
    'Household not found',
    { userMessage: 'Household not found' },
  );
}

/**
 * Resident not found.
 * HTTP Status: 404
 */
export function residentNotFound(): AppError {
  return notFoundError(
    'RESIDENT_NOT_FOUND',
    'Resident not found',
    { userMessage: 'Resident not found' },
  );
}

// ---------------------------------------------------------------------------
// Invariant Violation Errors
// ---------------------------------------------------------------------------

/**
 * Household data invariant violation.
 * INV-HOUSEHOLD-001: Household.tenantId == Resident.tenantId
 */
export function householdInvariantViolation(
  invariantId: string,
  details: string,
): AppError {
  return businessError(
    'HOUSEHOLD_INVARIANT_VIOLATION',
    `Household invariant ${invariantId} violated: ${details}`,
    { userMessage: 'A data integrity error occurred. Please contact support.' },
  );
}

/**
 * Household configuration is invalid.
 */
export function householdConfigurationInvalid(reason: string): AppError {
  return validationError(
    'HOUSEHOLD_CONFIGURATION_INVALID',
    `Household configuration is invalid: ${reason}`,
    { userMessage: 'Household configuration is invalid' },
  );
}
