/**
 * OrgUnit errors barrel export.
 *
 * @see Requirements 6, 21, 46
 */

export {
  // Not Found Errors
  orgUnitNotFound,
  orgUnitTenantMismatch,
  // Invariant Violation Errors
  orgUnitInvariantViolation,
  orgUnitPathDepthMismatch,
  orgUnitRootInvariantViolation,
  orgUnitParentTenantMismatch,
  orgUnitCycleDetected,
  // Management Errors
  orgUnitAlreadyExists,
  orgUnitHasChildren,
  orgUnitHasMembers,
  orgUnitCannotMoveToDescendant,
  orgUnitMaxDepthExceeded,
  orgUnitInvalidTypeForPosition,
  orgUnitNameRequired,
  orgUnitTypeRequired,
  orgUnitPathRepairFailed,
} from './orgUnitErrors';
