/**
 * Membership domain barrel export.
 *
 * This domain handles the membership-based authorization model that replaces
 * the legacy User.tenantId 1:1 relationship.
 *
 * @see FASE 1.6 — Membership Read Model / Repository
 * @see FASE 1.18 — Membership Lifecycle Management
 * @see Requirements 1, 2, 3, 22, 25
 */

// Entity types
export type {
  Membership,
  CreateMembershipInput,
  UpdateMembershipInput,
} from './entities';

// Value objects and enums
export {
  MembershipRole,
  TENANT_LEVEL_ROLES,
  ORG_SCOPED_ROLES,
  isTenantLevelRole,
  isOrgScopedRole,
  ALL_MEMBERSHIP_ROLES,
} from './types';

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
} from './types';

export type { MembershipResolutionKey } from './types';
export { isValidResolutionKey, createResolutionKey } from './types';

export {
  LEGACY_ROLE_MAPPING,
  MEMBERSHIP_TO_LEGACY_MAPPING,
  mapLegacyRole,
  mapToLegacyRole,
  hasLegacyMapping,
  hasMembershipMapping,
} from './types';

// Repository interfaces (Task 2: FASE 1.6, Task 50: FASE 1.18)
export type { IMembershipRepository } from './repositories';
export type {
  MembershipWriteRepository,
  UpdateMembershipData,
} from './repositories';
export type {
  MembershipQueryOptions,
  FindByUserIdOptions,
  ResolvedQueryOptions,
} from './repositories';
export { resolveQueryOptions } from './repositories';

// Error factory functions
export {
  authNoMembership,
  authMembershipInactive,
  authUserQuarantined,
  authMembershipContextInvalid,
  authOutOfScope,
  authInvalidScope,
  authTenantMismatch,
  authInsufficientPermission,
  authTokenRevoked,
  authTokenReuseDetected,
  authDelegationViolation,
  contextSwitchInvalid,
  membershipInvariantViolation,
} from './errors';

// Services (Task 5: FASE 1.6, Task 50: FASE 1.18)
export type {
  IMembershipResolutionService,
  MembershipResolutionResult,
  MembershipResolutionService,
} from './services';

export { MembershipResolutionServiceImpl } from './services';

// Lifecycle Service (Task 50: FASE 1.18)
export type {
  IMembershipLifecycleService,
  MembershipLifecycleService,
  CreateMembershipCommand,
  TransitionStatusCommand,
  CreateMembershipResult,
  TransitionStatusResult,
  IMembershipEventEmitter,
  MembershipLifecycleEvent,
} from './services';

export {
  MembershipLifecycleServiceImpl,
  MembershipEventType,
  membershipAlreadyExists,
  invalidStatusTransition,
  membershipNotFound,
  orgUnitNotInTenant,
  invalidInitialStatus,
} from './services';

// Delegation Matrix Service (Task 51: FASE 1.18)
export type {
  IDelegationMatrixService,
  DelegationMatrixService,
  DelegationValidationInput,
  DelegationCheckInput,
  DelegationValidationResult,
  DelegationAuditEvent,
  IDelegationAuditEmitter,
} from './services';

export {
  DelegationMatrixServiceImpl,
  DELEGATION_MATRIX,
  NON_DELEGATABLE_ROLES,
  DelegationDecisionReason,
  DelegationAuditEventType,
  canDelegate,
  getDelegatableRolesFor,
  isGrantableThroughDelegation,
} from './services';

// Delegated Membership Service (Task 51: FASE 1.18)
export type {
  IDelegatedMembershipService,
  DelegatedMembershipService,
  DelegatedCreateMembershipInput,
  DelegatedCreateMembershipResult,
} from './services';

export { DelegatedMembershipServiceImpl } from './services';
