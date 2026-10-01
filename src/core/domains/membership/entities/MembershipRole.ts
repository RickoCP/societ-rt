/**
 * MembershipRole re-export from types.
 *
 * This file provides a convenient import path for MembershipRole from the
 * entities folder, following Clean Architecture conventions where domain
 * types are accessible from the entities module.
 *
 * @see Requirements 2.2-2.8 (Member List Screen)
 * @see src/core/domains/membership/types/MembershipRole.ts for implementation
 */

export {
  MembershipRole,
  TENANT_LEVEL_ROLES,
  ORG_SCOPED_ROLES,
  isTenantLevelRole,
  isOrgScopedRole,
  ALL_MEMBERSHIP_ROLES,
} from '../types/MembershipRole';
