/**
 * Context Switch Error Factory Functions.
 *
 * These error functions create typed AppError instances for context switch
 * operations. All errors follow the Authorization Error Codes specification.
 *
 * **ERROR CODES:**
 * - CONTEXT_SWITCH_INVALID: Generic switch failure
 * - CONTEXT_SWITCH_NO_MEMBERSHIP: No membership in target tenant
 * - CONTEXT_SWITCH_ORGUNIT_NOT_FOUND: Target OrgUnit doesn't exist
 * - CONTEXT_SWITCH_ORGUNIT_TENANT_MISMATCH: OrgUnit not in target tenant
 * - CONTEXT_SWITCH_OUT_OF_SCOPE: Target OrgUnit outside membership scope
 * - CONTEXT_SWITCH_INVALID_SCOPE: Tenant-level scope without tenant-level role
 *
 * **SECURITY CONSIDERATIONS:**
 * - Error messages MUST NOT expose internal details
 * - Fail closed on unknown error states
 * - Errors MUST NOT leak cross-tenant information
 *
 * @see FASE 1.8 Task 18: Context Switch Service
 * @see Requirements 4 (AC 7), 47 (error codes)
 * @see Design Error Handling
 */

import type { AppError } from '@core/utils';
import { authorizationError, validationError } from '@core/utils';

// ---------------------------------------------------------------------------
// Context Switch Validation Errors
// ---------------------------------------------------------------------------

/**
 * Generic context switch failure.
 * Use when specific error code is not applicable.
 * HTTP Status: 400
 */
export function contextSwitchInvalid(reason?: string): AppError {
  const message = reason
    ? `Context switch failed: ${reason}`
    : 'Cannot switch to the requested tenant or organization unit';
  return validationError(
    'CONTEXT_SWITCH_INVALID',
    message,
    { userMessage: 'Invalid context switch request' },
  );
}

/**
 * User has no membership in the target tenant.
 * HTTP Status: 403
 */
export function contextSwitchNoMembership(targetTenantId?: string): AppError {
  // Don't expose targetTenantId in user message for security
  return authorizationError(
    'CONTEXT_SWITCH_NO_MEMBERSHIP',
    `No active membership found in target tenant${targetTenantId ? `: ${targetTenantId}` : ''}`,
    { userMessage: 'You do not have access to this tenant' },
  );
}

/**
 * Target OrgUnit does not exist.
 * HTTP Status: 400
 */
export function contextSwitchOrgUnitNotFound(orgUnitId?: string): AppError {
  // Don't expose orgUnitId in user message for security
  return validationError(
    'CONTEXT_SWITCH_ORGUNIT_NOT_FOUND',
    `Target organization unit not found${orgUnitId ? `: ${orgUnitId}` : ''}`,
    { userMessage: 'The selected organization unit does not exist' },
  );
}

/**
 * Target OrgUnit does not belong to the target tenant.
 * This indicates either a bug or an attack attempt.
 * HTTP Status: 400
 */
export function contextSwitchOrgUnitTenantMismatch(): AppError {
  return validationError(
    'CONTEXT_SWITCH_ORGUNIT_TENANT_MISMATCH',
    'Target organization unit does not belong to the target tenant',
    { userMessage: 'The selected organization unit is not in this tenant' },
  );
}

/**
 * Target OrgUnit is outside the user's membership scope.
 * HTTP Status: 403
 */
export function contextSwitchOutOfScope(): AppError {
  return authorizationError(
    'CONTEXT_SWITCH_OUT_OF_SCOPE',
    'Target organization unit is outside user membership scope',
    { userMessage: 'You do not have access to this organization unit' },
  );
}

/**
 * Tenant-level scope (null OrgUnit) requested without tenant-level role.
 * HTTP Status: 403
 */
export function contextSwitchInvalidScope(): AppError {
  return authorizationError(
    'CONTEXT_SWITCH_INVALID_SCOPE',
    'Tenant-level scope requires tenant-level role (PLATFORM_ADMIN or TENANT_OWNER)',
    { userMessage: 'Invalid scope for your role' },
  );
}

/**
 * User is quarantined and cannot switch context.
 * HTTP Status: 403
 */
export function contextSwitchUserQuarantined(): AppError {
  return authorizationError(
    'CONTEXT_SWITCH_USER_QUARANTINED',
    'User is quarantined and cannot access any tenant',
    { userMessage: 'Your account requires administrator review' },
  );
}

/**
 * Membership is not active (SUSPENDED, INVITED, REVOKED).
 * HTTP Status: 403
 */
export function contextSwitchMembershipInactive(): AppError {
  return authorizationError(
    'CONTEXT_SWITCH_MEMBERSHIP_INACTIVE',
    'Membership status does not allow context switch',
    { userMessage: 'Your membership is not active in this tenant' },
  );
}

/**
 * Multiple memberships exist but none match the target OrgUnit.
 * HTTP Status: 400
 */
export function contextSwitchAmbiguousMembership(): AppError {
  return validationError(
    'CONTEXT_SWITCH_AMBIGUOUS_MEMBERSHIP',
    'Multiple memberships exist but target OrgUnit does not match any',
    { userMessage: 'Please select a valid organization unit' },
  );
}
