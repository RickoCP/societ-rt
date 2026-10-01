/**
 * MembershipStatus re-export from types.
 *
 * This file provides a convenient import path for MembershipStatus from the
 * entities folder, following Clean Architecture conventions where domain
 * types are accessible from the entities module.
 *
 * @see Requirements 2.2-2.8 (Member List Screen)
 * @see src/core/domains/membership/types/MembershipStatus.ts for implementation
 */

export {
  MembershipStatus,
  AUTHORITATIVE_STATUSES,
  NON_AUTHORITATIVE_STATUSES,
  TERMINAL_STATUSES,
  STATUS_TRANSITIONS,
  isValidStatusTransition,
  isAuthoritativeStatus,
  isTerminalStatus,
  ALL_MEMBERSHIP_STATUSES,
} from '../types/MembershipStatus';
