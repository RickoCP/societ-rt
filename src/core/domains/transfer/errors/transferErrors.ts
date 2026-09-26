/**
 * Transfer-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Error codes follow the Authorization Error Codes specification from design.md.
 *
 * SECURITY CONSIDERATIONS:
 * - Error messages MUST NOT expose internal details
 * - Fail closed on unknown error states
 * - Errors MUST NOT leak cross-tenant information
 *
 * @see Requirements 54 (Ownership Transfer)
 * @see Task 52: Tenant Transfer Flow
 */

import type { AppError } from '@core/utils';
import { authorizationError, businessError, validationError, notFoundError } from '@core/utils';

// ---------------------------------------------------------------------------
// Transfer Initiation Errors
// ---------------------------------------------------------------------------

/**
 * Transfer not initiated by the current TENANT_OWNER.
 * HTTP Status: 403
 */
export function transferNotInitiatedByOwner(): AppError {
  return authorizationError(
    'TRANSFER_NOT_INITIATED_BY_OWNER',
    'Ownership transfer can only be initiated by the current TENANT_OWNER',
    { userMessage: 'Only the current owner can initiate a transfer' },
  );
}

/**
 * Target user not found or does not exist.
 * HTTP Status: 404
 */
export function transferTargetNotFound(): AppError {
  return notFoundError(
    'TRANSFER_TARGET_NOT_FOUND',
    'Target user for ownership transfer was not found',
    { userMessage: 'The specified user does not exist' },
  );
}

/**
 * Target user is in the quarantine manifest (PNA-01 through PNA-05).
 * HTTP Status: 403
 */
export function transferTargetQuarantined(): AppError {
  return authorizationError(
    'TRANSFER_TARGET_QUARANTINED',
    'Cannot transfer ownership to a quarantined user',
    { userMessage: 'The specified user cannot receive ownership' },
  );
}

/**
 * Target user already has TENANT_OWNER role in the same tenant.
 * HTTP Status: 409 (conflict)
 */
export function transferTargetAlreadyOwner(): AppError {
  return businessError(
    'TRANSFER_TARGET_ALREADY_OWNER',
    'Target user is already the TENANT_OWNER of this tenant',
    { userMessage: 'This user is already the owner' },
  );
}

/**
 * Target user has no membership in the tenant.
 * HTTP Status: 403
 */
export function transferTargetNoMembership(): AppError {
  return authorizationError(
    'TRANSFER_TARGET_NO_MEMBERSHIP',
    'Target user must have an existing membership in the tenant',
    { userMessage: 'The specified user must be a member of this organization' },
  );
}

/**
 * There is already a pending transfer for this tenant.
 * HTTP Status: 409 (conflict)
 */
export function transferAlreadyPending(): AppError {
  return businessError(
    'TRANSFER_ALREADY_PENDING',
    'A transfer is already pending for this tenant. Cancel it first.',
    { userMessage: 'A transfer is already in progress' },
  );
}

// ---------------------------------------------------------------------------
// Transfer Acceptance Errors
// ---------------------------------------------------------------------------

/**
 * Transfer request has expired and can no longer be accepted.
 * HTTP Status: 400
 */
export function transferExpired(): AppError {
  return businessError(
    'TRANSFER_EXPIRED',
    'The transfer request has expired',
    { userMessage: 'This transfer request has expired' },
  );
}

/**
 * Transfer has already been completed.
 * HTTP Status: 400
 */
export function transferAlreadyCompleted(): AppError {
  return businessError(
    'TRANSFER_ALREADY_COMPLETED',
    'The transfer has already been completed',
    { userMessage: 'This transfer has already been completed' },
  );
}

/**
 * Transfer has been cancelled and cannot be accepted.
 * HTTP Status: 400
 */
export function transferCancelled(): AppError {
  return businessError(
    'TRANSFER_CANCELLED',
    'The transfer has been cancelled',
    { userMessage: 'This transfer has been cancelled' },
  );
}

/**
 * Re-authentication is required before accepting the transfer.
 * HTTP Status: 401
 */
export function reAuthenticationRequired(): AppError {
  return authorizationError(
    'RE_AUTHENTICATION_REQUIRED',
    'Re-authentication is required for this sensitive operation',
    { userMessage: 'Please re-enter your credentials to continue' },
  );
}

/**
 * User attempting to accept is not the transfer target.
 * HTTP Status: 403
 */
export function transferNotTargetUser(): AppError {
  return authorizationError(
    'TRANSFER_NOT_TARGET_USER',
    'Only the designated target user can accept this transfer',
    { userMessage: 'You are not authorized to accept this transfer' },
  );
}

// ---------------------------------------------------------------------------
// Transfer Cancellation Errors
// ---------------------------------------------------------------------------

/**
 * User attempting to cancel is not the transfer initiator.
 * HTTP Status: 403
 */
export function transferNotInitiator(): AppError {
  return authorizationError(
    'TRANSFER_NOT_INITIATOR',
    'Only the initiator can cancel the transfer',
    { userMessage: 'You are not authorized to cancel this transfer' },
  );
}

/**
 * Transfer cannot be cancelled in its current state.
 * HTTP Status: 400
 */
export function transferCannotBeCancelled(): AppError {
  return businessError(
    'TRANSFER_CANNOT_BE_CANCELLED',
    'Transfer can only be cancelled while in PENDING status',
    { userMessage: 'This transfer cannot be cancelled' },
  );
}

// ---------------------------------------------------------------------------
// Transfer Lookup Errors
// ---------------------------------------------------------------------------

/**
 * Transfer request not found.
 * HTTP Status: 404
 */
export function transferNotFound(): AppError {
  return notFoundError(
    'TRANSFER_NOT_FOUND',
    'The specified transfer request was not found',
    { userMessage: 'Transfer request not found' },
  );
}

// ---------------------------------------------------------------------------
// Transfer Validation Errors
// ---------------------------------------------------------------------------

/**
 * Invalid transfer status transition.
 * HTTP Status: 400
 */
export function invalidTransferStatusTransition(
  from: string,
  to: string,
): AppError {
  return validationError(
    'INVALID_TRANSFER_STATUS_TRANSITION',
    `Cannot transition transfer from ${from} to ${to}`,
    { userMessage: 'Invalid operation for current transfer state' },
  );
}

/**
 * Cannot transfer ownership to self.
 * HTTP Status: 400
 */
export function transferToSelfNotAllowed(): AppError {
  return validationError(
    'TRANSFER_TO_SELF_NOT_ALLOWED',
    'Cannot transfer ownership to yourself',
    { userMessage: 'You cannot transfer ownership to yourself' },
  );
}

/**
 * Re-authentication token is invalid or expired.
 * HTTP Status: 401
 */
export function invalidReauthToken(): AppError {
  return authorizationError(
    'INVALID_REAUTH_TOKEN',
    'The re-authentication token is invalid or has expired',
    { userMessage: 'Please re-enter your credentials' },
  );
}
