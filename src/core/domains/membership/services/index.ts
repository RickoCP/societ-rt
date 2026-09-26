/**
 * Membership services barrel export.
 *
 * @see FASE 1.6 — Membership Read Model / Repository
 * @see FASE 1.18 — Membership Lifecycle Management
 * @see Task 5: Membership Resolution Logic
 * @see Task 50: Membership Lifecycle Management
 * @see Task 51: Delegation Matrix Implementation
 * @see Task 53: Membership Invitation Flow
 */

// Resolution Service
export type {
  IMembershipResolutionService,
  MembershipResolutionResult,
  MembershipResolutionService,
} from './MembershipResolutionService';

export { MembershipResolutionServiceImpl } from './MembershipResolutionService';

// Lifecycle Service
export type {
  IMembershipLifecycleService,
  MembershipLifecycleService,
  CreateMembershipCommand,
  TransitionStatusCommand,
  CreateMembershipResult,
  TransitionStatusResult,
  IMembershipEventEmitter,
  MembershipLifecycleEvent,
} from './MembershipLifecycleService';

export {
  MembershipLifecycleServiceImpl,
  MembershipEventType,
  membershipAlreadyExists,
  invalidStatusTransition,
  membershipNotFound,
  orgUnitNotInTenant,
  invalidInitialStatus,
} from './MembershipLifecycleService';

// Delegation Matrix Service
export type {
  IDelegationMatrixService,
  DelegationMatrixService,
  DelegationValidationInput,
  DelegationCheckInput,
  DelegationValidationResult,
  DelegationAuditEvent,
  IDelegationAuditEmitter,
} from './DelegationMatrixService';

export {
  DelegationMatrixServiceImpl,
  DELEGATION_MATRIX,
  NON_DELEGATABLE_ROLES,
  DelegationDecisionReason,
  DelegationAuditEventType,
  canDelegate,
  getDelegatableRolesFor,
  isGrantableThroughDelegation,
} from './DelegationMatrixService';

// Delegated Membership Service (integrates delegation validation + membership creation)
export type {
  IDelegatedMembershipService,
  DelegatedMembershipService,
  DelegatedCreateMembershipInput,
  DelegatedCreateMembershipResult,
} from './DelegatedMembershipService';

export { DelegatedMembershipServiceImpl } from './DelegatedMembershipService';

// Membership Invitation Service
export type {
  IMembershipInvitationService,
  MembershipInvitationService,
  CreateInvitationCommand,
  AcceptInvitationCommand,
  RevokeInvitationCommand,
  ResendInvitationCommand,
  CreateInvitationResult,
  AcceptInvitationResult,
  RevokeInvitationResult,
  ResendInvitationResult,
  IInvitationEventEmitter,
  InvitationLifecycleEvent,
} from './MembershipInvitationService';

export {
  MembershipInvitationServiceImpl,
  InvitationEventType,
  generateInvitationToken,
  hashToken,
} from './MembershipInvitationService';

// Admin Membership Service (Task 54)
export type {
  IAdminMembershipService,
  AdminMembershipService,
  AdminContext,
  MembershipFilters,
  PaginationOptions,
  PaginatedResult,
  ExportFormat,
  MembershipExportData,
  BulkOperationItemResult,
  BulkOperationResult,
  AdminMembershipAuditEvent,
  IAdminMembershipAuditEmitter,
  IAdminMembershipRepository,
} from './AdminMembershipService';

export {
  AdminMembershipServiceImpl,
  ADMIN_ROLES,
  MAX_BULK_BATCH_SIZE,
  AdminActionType,
  isAdminRole,
  adminNotAuthorized,
  adminOutOfScope,
  membershipNotFoundForAdmin,
  invalidBulkOperation,
  bulkOperationPartialFailure,
} from './AdminMembershipService';
