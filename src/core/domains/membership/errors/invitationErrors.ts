/**
 * Membership Invitation-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Error codes follow the task specification for invitation flow.
 *
 * SECURITY CONSIDERATIONS:
 * - Error messages MUST NOT expose internal details
 * - Fail closed on unknown error states
 * - Errors MUST NOT leak cross-tenant information
 * - Token values MUST NOT be included in error messages
 *
 * @see FASE 1.18 Task 53: Membership Invitation Flow
 * @see Requirements 22, 25
 */

import type { AppError } from '@core/utils';
import { businessError, validationError, authorizationError } from '@core/utils';

// ---------------------------------------------------------------------------
// Invitation Token Errors
// ---------------------------------------------------------------------------

/**
 * Invitation token has expired.
 * HTTP Status: 400 (Bad Request)
 */
export function invitationExpired(): AppError {
  return businessError(
    'INVITATION_EXPIRED',
    'The invitation has expired and can no longer be accepted',
    { userMessage: 'This invitation has expired. Please request a new one.' },
  );
}

/**
 * Invitation has already been accepted.
 * HTTP Status: 400 (Bad Request)
 */
export function invitationAlreadyAccepted(): AppError {
  return businessError(
    'INVITATION_ALREADY_ACCEPTED',
    'This invitation has already been accepted',
    { userMessage: 'This invitation has already been used.' },
  );
}

/**
 * Invitation has been revoked.
 * HTTP Status: 400 (Bad Request)
 */
export function invitationRevoked(): AppError {
  return businessError(
    'INVITATION_REVOKED',
    'The invitation has been revoked',
    { userMessage: 'This invitation is no longer valid.' },
  );
}

/**
 * Invitation token is invalid (not found or malformed).
 * HTTP Status: 400 (Bad Request)
 */
export function invitationTokenInvalid(): AppError {
  return validationError(
    'INVITATION_TOKEN_INVALID',
    'The invitation token is invalid or not found',
    { userMessage: 'Invalid invitation link.' },
  );
}

// ---------------------------------------------------------------------------
// Inviter Authorization Errors
// ---------------------------------------------------------------------------

/**
 * Inviter is not authorized to create invitations.
 * HTTP Status: 403 (Forbidden)
 */
export function inviterNotAuthorized(): AppError {
  return authorizationError(
    'INVITER_NOT_AUTHORIZED',
    'The inviter is not authorized to create this invitation',
    { userMessage: 'You do not have permission to invite users.' },
  );
}

/**
 * Inviter's membership is not active.
 * HTTP Status: 403 (Forbidden)
 */
export function inviterMembershipNotActive(): AppError {
  return authorizationError(
    'INVITER_MEMBERSHIP_NOT_ACTIVE',
    'Inviter must have an active membership to create invitations',
    { userMessage: 'Your membership is not active.' },
  );
}

/**
 * Target OrgUnit is outside inviter's scope.
 * HTTP Status: 403 (Forbidden)
 */
export function inviterOutOfScope(): AppError {
  return authorizationError(
    'INVITER_OUT_OF_SCOPE',
    'Target organization unit is outside the inviter scope',
    { userMessage: 'You cannot invite users to this organization.' },
  );
}

// ---------------------------------------------------------------------------
// Invitation State Errors
// ---------------------------------------------------------------------------

/**
 * Invitation not found.
 * HTTP Status: 404 (Not Found)
 */
export function invitationNotFound(): AppError {
  return businessError(
    'INVITATION_NOT_FOUND',
    'Invitation not found in the specified tenant',
    { userMessage: 'Invitation not found.' },
  );
}

/**
 * A pending invitation already exists for this user/email.
 * HTTP Status: 409 (Conflict)
 */
export function invitationAlreadyExists(): AppError {
  return businessError(
    'INVITATION_ALREADY_EXISTS',
    'A pending invitation already exists for this user',
    { userMessage: 'An invitation has already been sent to this user.' },
  );
}

/**
 * Cannot perform action on invitation in current state.
 * HTTP Status: 400 (Bad Request)
 */
export function invitationInvalidState(
  currentStatus: string,
  attemptedAction: string,
): AppError {
  return businessError(
    'INVITATION_INVALID_STATE',
    `Cannot ${attemptedAction} invitation with status ${currentStatus}`,
    { userMessage: 'This action cannot be performed on this invitation.' },
  );
}

// ---------------------------------------------------------------------------
// Acceptance Errors
// ---------------------------------------------------------------------------

/**
 * User accepting the invitation doesn't match the invited user.
 * HTTP Status: 403 (Forbidden)
 */
export function invitationUserMismatch(): AppError {
  return authorizationError(
    'INVITATION_USER_MISMATCH',
    'The accepting user does not match the invited user',
    { userMessage: 'This invitation was not sent to you.' },
  );
}

/**
 * Associated membership not found (data integrity issue).
 * HTTP Status: 500 (Internal Server Error)
 */
export function invitationMembershipNotFound(): AppError {
  return businessError(
    'INVITATION_MEMBERSHIP_NOT_FOUND',
    'The associated membership record was not found',
    { userMessage: 'An error occurred processing your invitation. Please contact support.' },
  );
}

/**
 * Membership is not in INVITED status (already processed).
 * HTTP Status: 400 (Bad Request)
 */
export function invitationMembershipNotInvited(): AppError {
  return businessError(
    'INVITATION_MEMBERSHIP_NOT_INVITED',
    'The associated membership is not in INVITED status',
    { userMessage: 'This invitation has already been processed.' },
  );
}
