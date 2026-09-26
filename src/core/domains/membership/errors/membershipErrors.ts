/**
 * Membership-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Error codes follow the Authorization Error Codes specification from design.md.
 *
 * SECURITY CONSIDERATIONS:
 * - Error messages MUST NOT expose internal details
 * - Fail closed on unknown error states
 * - Errors MUST NOT leak cross-tenant information
 *
 * @see Requirements 3, 47, Design Error Handling
 */

import type { AppError } from '@core/utils';
import { authorizationError, authenticationError } from '@core/utils';

// ---------------------------------------------------------------------------
// Membership Resolution Errors (from Authorization Context Resolution)
// ---------------------------------------------------------------------------

/**
 * User has no membership in the requested tenant.
 * HTTP Status: 403
 */
export function authNoMembership(): AppError {
  return authorizationError(
    'AUTH_NO_MEMBERSHIP',
    'No membership found for user in the requested tenant',
    { userMessage: 'You do not have access to this tenant' },
  );
}

/**
 * Membership status is not ACTIVE (INVITED, SUSPENDED, or REVOKED for non-emergency).
 * HTTP Status: 403
 */
export function authMembershipInactive(): AppError {
  return authorizationError(
    'AUTH_MEMBERSHIP_INACTIVE',
    'Membership status does not allow this operation',
    { userMessage: 'Your membership is not active' },
  );
}

/**
 * Membership is SUSPENDED and trying to access a non-safety route.
 * HTTP Status: 403
 *
 * Note: This error is returned when a suspended user tries to access
 * a route that doesn't have `allowSuspended: true`. Safety-critical
 * routes (emergency, panic, etc.) should use the `allowSuspended` flag.
 *
 * @see Requirements 7.2, 7.3 — Safety-Critical Route Preservation
 */
export function authMembershipSuspended(): AppError {
  return authorizationError(
    'AUTH_MEMBERSHIP_SUSPENDED',
    'Membership is suspended and cannot access this route',
    { userMessage: 'Your membership has been suspended. You may only access emergency features.' },
  );
}

/**
 * User is in the quarantine manifest (PNA-01 through PNA-05).
 * HTTP Status: 403
 */
export function authUserQuarantined(): AppError {
  return authorizationError(
    'AUTH_USER_QUARANTINED',
    'User is quarantined and cannot access any tenant',
    { userMessage: 'Your account requires administrator review' },
  );
}

/**
 * Multiple memberships exist but activeOrgUnitId doesn't match any.
 * HTTP Status: 403
 */
export function authMembershipContextInvalid(): AppError {
  return authorizationError(
    'AUTH_MEMBERSHIP_CONTEXT_INVALID',
    'Active context does not match any valid membership',
    { userMessage: 'Please select a valid organization unit' },
  );
}

// ---------------------------------------------------------------------------
// OrgUnit Scope Errors
// ---------------------------------------------------------------------------

/**
 * Resource is outside user's OrgUnit scope.
 * HTTP Status: 403
 */
export function authOutOfScope(): AppError {
  return authorizationError(
    'AUTH_OUT_OF_SCOPE',
    'Resource is outside the user membership scope',
    { userMessage: 'You do not have access to this resource' },
  );
}

/**
 * Tenant-level membership claimed without tenant-level role.
 * HTTP Status: 403
 */
export function authInvalidScope(): AppError {
  return authorizationError(
    'AUTH_INVALID_SCOPE',
    'Tenant-level scope requires tenant-level role (PLATFORM_ADMIN or TENANT_OWNER)',
    { userMessage: 'Invalid scope for your role' },
  );
}

/**
 * Resource tenant doesn't match user's active tenant.
 * HTTP Status: 403
 * Note: This has higher priority than AUTH_OUT_OF_SCOPE per design.
 */
export function authTenantMismatch(): AppError {
  return authorizationError(
    'AUTH_TENANT_MISMATCH',
    'Resource belongs to a different tenant',
    { userMessage: 'You do not have access to this resource' },
  );
}

// ---------------------------------------------------------------------------
// Permission Errors
// ---------------------------------------------------------------------------

/**
 * User lacks required permission(s) for the operation.
 * HTTP Status: 403
 */
export function authInsufficientPermission(
  missingPermissions?: string[],
): AppError {
  const details = missingPermissions?.length
    ? ` Missing: ${missingPermissions.join(', ')}`
    : '';
  return authorizationError(
    'AUTH_INSUFFICIENT_PERMISSION',
    `User lacks required permission(s).${details}`,
    { userMessage: 'You do not have permission to perform this action' },
  );
}

// ---------------------------------------------------------------------------
// Token/Session Errors
// ---------------------------------------------------------------------------

/**
 * JWT tokenVersion doesn't match User.tokenVersion (forced invalidation).
 * HTTP Status: 401
 */
export function authTokenRevoked(): AppError {
  return authenticationError(
    'AUTH_TOKEN_REVOKED',
    'Token version mismatch - all sessions have been invalidated',
    { userMessage: 'Your session has expired. Please log in again.' },
  );
}

/**
 * Refresh token was reused (possible token theft).
 * HTTP Status: 401
 */
export function authTokenReuseDetected(): AppError {
  return authenticationError(
    'AUTH_TOKEN_REUSE_DETECTED',
    'Refresh token reuse detected - possible security incident',
    { userMessage: 'Security alert: Please log in again.' },
  );
}

// ---------------------------------------------------------------------------
// Delegation Errors
// ---------------------------------------------------------------------------

/**
 * Attempted privilege escalation via delegation.
 * HTTP Status: 403
 */
export function authDelegationViolation(
  attemptedRole?: string,
): AppError {
  const details = attemptedRole ? ` Attempted role: ${attemptedRole}` : '';
  return authorizationError(
    'AUTH_DELEGATION_VIOLATION',
    `Delegation violates the delegation matrix.${details}`,
    { userMessage: 'You cannot assign this role' },
  );
}

// ---------------------------------------------------------------------------
// Context Switch Errors
// ---------------------------------------------------------------------------

/**
 * Invalid tenant or OrgUnit switch request.
 * HTTP Status: 400
 */
export function contextSwitchInvalid(): AppError {
  return authorizationError(
    'CONTEXT_SWITCH_INVALID',
    'Cannot switch to the requested tenant or organization unit',
    { userMessage: 'Invalid context switch request' },
  );
}

// ---------------------------------------------------------------------------
// Invariant Violation Errors (Internal)
// ---------------------------------------------------------------------------

/**
 * Membership OrgUnit doesn't belong to membership tenant.
 * This indicates a data integrity issue (INV-MEM-001).
 */
export function membershipInvariantViolation(
  invariantId: string,
  details: string,
): AppError {
  return authorizationError(
    'MEMBERSHIP_INVARIANT_VIOLATION',
    `Membership invariant ${invariantId} violated: ${details}`,
    { userMessage: 'A system error occurred. Please contact support.' },
  );
}
