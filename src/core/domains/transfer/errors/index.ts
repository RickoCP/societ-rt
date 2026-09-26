/**
 * Transfer errors barrel export.
 *
 * @see Requirements 54 (Ownership Transfer)
 * @see Task 52: Tenant Transfer Flow
 */

export {
  // Transfer Initiation Errors
  transferNotInitiatedByOwner,
  transferTargetNotFound,
  transferTargetQuarantined,
  transferTargetAlreadyOwner,
  transferTargetNoMembership,
  transferAlreadyPending,
  // Transfer Acceptance Errors
  transferExpired,
  transferAlreadyCompleted,
  transferCancelled,
  reAuthenticationRequired,
  transferNotTargetUser,
  // Transfer Cancellation Errors
  transferNotInitiator,
  transferCannotBeCancelled,
  // Transfer Lookup Errors
  transferNotFound,
  // Transfer Validation Errors
  invalidTransferStatusTransition,
  transferToSelfNotAllowed,
  invalidReauthToken,
} from './transferErrors';
