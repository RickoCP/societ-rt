/**
 * Membership types barrel export.
 *
 * @see Requirements 1, 2, 3
 */

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

export type { MembershipResolutionKey } from './MembershipResolutionKey';
export {
  isValidResolutionKey,
  createResolutionKey,
} from './MembershipResolutionKey';

export {
  LEGACY_ROLE_MAPPING,
  MEMBERSHIP_TO_LEGACY_MAPPING,
  mapLegacyRole,
  mapToLegacyRole,
  hasLegacyMapping,
  hasMembershipMapping,
} from './LegacyRoleMapping';
