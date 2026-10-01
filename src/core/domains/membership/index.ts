/**
 * Membership domain barrel export.
 *
 * This domain handles the membership-based authorization model that replaces
 * the legacy User.tenantId 1:1 relationship.
 *
 * @see FASE 1.6 — Membership Read Model / Repository
 * @see FASE 1.18 — Membership Lifecycle Management
 * @see Requirements 1, 2, 3, 22, 25
 * @see Requirements 2.2-2.8 (Member List Screen - Admin UI)
 */

// Entity types
export type {
  Membership,
  CreateMembershipInput,
  UpdateMembershipInput,
} from './entities';

// Admin UI Member entity (Task 5.1)
export type {
  Member,
  MemberSummary,
  RoleChangeHistory,
  PaginatedMembers,
} from './entities';

// Admin UI Member filters (Task 5.1)
export type {
  MemberFilters,
  MemberPaginationOptions,
  MemberSortOptions,
  MemberSortColumn,
  MemberListQueryOptions,
} from './entities';

export {
  VALID_PAGE_SIZES,
  DEFAULT_PAGINATION,
  DEFAULT_SORT,
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

// Admin UI Repository interface (Task 5.1)
export type {
  MembershipAdminRepository,
  InviteMemberInput,
  BulkInviteMemberInput,
  BulkInviteResult,
  ChangeMemberStatusInput,
  ChangeMemberRoleInput,
} from './repositories';
export { BULK_OPERATION_LIMITS } from './repositories';

// MembershipRepository alias (Task 5.1 - named export per spec)
export type { MembershipRepository } from './repositories';

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

// Use Cases (Multi-Tenant Admin UI)
export type {
  ListMembersUseCase,
  ListMembersInput,
} from './usecases';

export { ListMembersUseCaseImpl } from './usecases';

// Invite Member Use Case (Task 6.1)
export type {
  InviteMemberUseCase,
  InviteSingleMemberInput,
  InviteBulkMembersInput,
  SingleInviteResult,
} from './usecases';

export {
  InviteMemberUseCaseImpl,
  BULK_INVITATION_LIMIT,
  isValidEmail,
  parseBulkEmails,
} from './usecases';

// Change Member Role Use Case (Task 7.1)
export type {
  ChangeMemberRoleUseCase,
  ChangeMemberRoleUseCaseInput,
} from './usecases';

export { ChangeMemberRoleUseCaseImpl } from './usecases';

// Bulk Member Operations Use Case (Task 8.1)
export type {
  BulkMemberOperationUseCase,
  BulkOperationType,
  BulkOperationProgress,
  BulkOperationFailure,
  BulkOperationResult,
  BulkStatusChangeInput,
  BulkRoleChangeInput,
} from './usecases';

export { BulkMemberOperationUseCaseImpl } from './usecases';

// Assign Members to OrgUnit Use Case (Task 12.3)
export type {
  AssignMembersToOrgUnitUseCase,
  AssignMembersToOrgUnitInput,
  MemberAssignmentInfo,
  SingleAssignmentResult,
  AssignMembersToOrgUnitResult,
} from './usecases';

export { AssignMembersToOrgUnitUseCaseImpl, BULK_ASSIGNMENT_LIMIT } from './usecases';
