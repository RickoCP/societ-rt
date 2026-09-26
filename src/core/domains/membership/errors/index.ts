/**
 * Membership errors barrel export.
 *
 * @see Requirements 3, 22, 25, 47
 * @see FASE 1.18 Task 50, 53
 */

export {
  // Membership Resolution Errors
  authNoMembership,
  authMembershipInactive,
  authUserQuarantined,
  authMembershipContextInvalid,
  // OrgUnit Scope Errors
  authOutOfScope,
  authInvalidScope,
  authTenantMismatch,
  // Permission Errors
  authInsufficientPermission,
  // Token/Session Errors
  authTokenRevoked,
  authTokenReuseDetected,
  // Delegation Errors
  authDelegationViolation,
  // Context Switch Errors
  contextSwitchInvalid,
  // Invariant Violation Errors
  membershipInvariantViolation,
} from './membershipErrors';

// Invitation-specific Errors
export {
  // Token Errors
  invitationExpired,
  invitationAlreadyAccepted,
  invitationRevoked,
  invitationTokenInvalid,
  // Inviter Authorization Errors
  inviterNotAuthorized,
  inviterMembershipNotActive,
  inviterOutOfScope,
  // Invitation State Errors
  invitationNotFound,
  invitationAlreadyExists,
  invitationInvalidState,
  // Acceptance Errors
  invitationUserMismatch,
  invitationMembershipNotFound,
  invitationMembershipNotInvited,
} from './invitationErrors';
