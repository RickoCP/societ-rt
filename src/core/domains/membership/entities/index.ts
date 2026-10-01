/**
 * Membership entities barrel export.
 *
 * @see Requirements 1, 3, 22
 * @see Requirements 2.2-2.8 (Member List Screen)
 * @see FASE 1.18 Task 50, 53
 */

export type {
  Membership,
  CreateMembershipInput,
  UpdateMembershipInput,
} from './Membership';

export {
  MembershipInvitationStatus,
  isTerminalInvitationStatus,
  isInvitationExpired,
  canAcceptInvitation,
  canRevokeInvitation,
  canResendInvitation,
  calculateExpiryDate,
  DEFAULT_INVITATION_EXPIRY_MS,
  DEFAULT_INVITATION_EXPIRY_DAYS,
  INVITATION_TOKEN_BYTES,
} from './MembershipInvitation';

export type {
  MembershipInvitation,
  CreateInvitationInput,
  UpdateInvitationInput,
} from './MembershipInvitation';

// Admin UI Member entity (Task 5.1)
export type {
  Member,
  MemberSummary,
  RoleChangeHistory,
  PaginatedMembers,
} from './Member';

// Admin UI Member filters (Task 5.1)
export type {
  MemberFilters,
  MemberPaginationOptions,
  MemberSortOptions,
  MemberSortColumn,
  MemberListQueryOptions,
} from './MemberFilters';

export {
  VALID_PAGE_SIZES,
  DEFAULT_PAGINATION,
  DEFAULT_SORT,
} from './MemberFilters';

// MembershipRole and MembershipStatus re-exports (Task 5.1)
export {
  MembershipRole,
  TENANT_LEVEL_ROLES,
  ORG_SCOPED_ROLES,
  isTenantLevelRole,
  isOrgScopedRole,
  ALL_MEMBERSHIP_ROLES,
} from './MembershipRole';

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
} from './MembershipStatus';
