/**
 * AuthContextCompat — Backward-compatible type union for gradual migration
 * from legacy AuthContext to new AuthorizationContext.
 *
 * This module provides:
 * 1. Type union for accepting both legacy and new context types
 * 2. Type guards for runtime discrimination
 * 3. Helper functions for safely accessing fields from either type
 *
 * MIGRATION STRATEGY:
 * - Use cases accept `AuthContextCompat` (union type)
 * - Type guards determine which fields are available
 * - New fields (permissions, orgUnitId, MembershipRole) used when available
 * - Legacy fields used as fallback during migration
 *
 * @see Requirements 6.2, 6.6 (UseCase AuthorizationContext Parameter Update)
 */

import type { AuthContext, UserRole } from '@core/protocols';
import type { AuthorizationContext } from './AuthorizationContext';
import { MembershipRole, mapLegacyRole } from '@core/domains/membership/types';
import { UserRole as UserRoleEnum } from '@core/protocols';

// ---------------------------------------------------------------------------
// Type Union for Migration Compatibility
// ---------------------------------------------------------------------------

/**
 * AuthContextCompat — Accepts either legacy AuthContext or new AuthorizationContext.
 *
 * During the migration period, use cases should use this type to accept both
 * the legacy AuthContext from routes not yet migrated to withPermission, and
 * the new AuthorizationContext from migrated routes.
 *
 * @see Requirements 6.2, 6.6
 */
export type AuthContextCompat = AuthContext | AuthorizationContext;

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

/**
 * Type guard: Determines if the context is the new AuthorizationContext.
 *
 * The key discriminator is the presence of `membershipId` which is only
 * present in AuthorizationContext (NEVER in legacy AuthContext).
 *
 * @param ctx - The auth context to check
 * @returns true if ctx is AuthorizationContext
 */
export function isAuthorizationContext(
  ctx: AuthContextCompat,
): ctx is AuthorizationContext {
  return (
    'membershipId' in ctx &&
    typeof (ctx as AuthorizationContext).membershipId === 'string'
  );
}

/**
 * Type guard: Determines if the context is the legacy AuthContext.
 *
 * @param ctx - The auth context to check
 * @returns true if ctx is legacy AuthContext
 */
export function isLegacyAuthContext(
  ctx: AuthContextCompat,
): ctx is AuthContext {
  return !isAuthorizationContext(ctx);
}

// ---------------------------------------------------------------------------
// Safe Accessor Functions
// ---------------------------------------------------------------------------

/**
 * Safely gets the orgUnitId from either context type.
 *
 * For AuthorizationContext: returns ctx.orgUnitId (may be null for tenant-level roles)
 * For legacy AuthContext: returns undefined (not available)
 *
 * @param ctx - The auth context
 * @returns orgUnitId if available, undefined otherwise
 */
export function getOrgUnitId(ctx: AuthContextCompat): string | null | undefined {
  if (isAuthorizationContext(ctx)) {
    return ctx.orgUnitId;
  }
  return undefined;
}

/**
 * Safely gets the permissions set from either context type.
 *
 * For AuthorizationContext: returns ctx.permissions
 * For legacy AuthContext: returns undefined (not available)
 *
 * @param ctx - The auth context
 * @returns permissions set if available, undefined otherwise
 */
export function getPermissions(
  ctx: AuthContextCompat,
): ReadonlySet<string> | undefined {
  if (isAuthorizationContext(ctx)) {
    return ctx.permissions;
  }
  return undefined;
}

/**
 * Checks if the context has a specific permission.
 *
 * For AuthorizationContext: checks ctx.permissions.has(permission)
 * For legacy AuthContext: returns undefined (caller must handle)
 *
 * @param ctx - The auth context
 * @param permission - The permission code to check
 * @returns true if has permission, false if not, undefined if not available
 */
export function hasPermission(
  ctx: AuthContextCompat,
  permission: string,
): boolean | undefined {
  if (isAuthorizationContext(ctx)) {
    return ctx.permissions.has(permission);
  }
  return undefined;
}

/**
 * Safely gets the membershipId from either context type.
 *
 * For AuthorizationContext: returns ctx.membershipId
 * For legacy AuthContext: returns undefined (not available)
 *
 * @param ctx - The auth context
 * @returns membershipId if available, undefined otherwise
 */
export function getMembershipId(ctx: AuthContextCompat): string | undefined {
  if (isAuthorizationContext(ctx)) {
    return ctx.membershipId;
  }
  return undefined;
}

/**
 * Gets the role as MembershipRole if available, or converts from UserRole.
 *
 * For AuthorizationContext: returns ctx.role (MembershipRole)
 * For legacy AuthContext: returns ctx.role (UserRole) - caller may need to map
 *
 * @param ctx - The auth context
 * @returns The role (MembershipRole or UserRole depending on context type)
 */
export function getRole(ctx: AuthContextCompat): MembershipRole | UserRole {
  return ctx.role;
}

/**
 * Gets the role as MembershipRole, with mapping for legacy context.
 *
 * This function uses the legacy role mapping to convert UserRole to MembershipRole
 * when needed, allowing use cases to work with MembershipRole consistently.
 *
 * @param ctx - The auth context
 * @returns The role as MembershipRole
 */
export function getMembershipRole(ctx: AuthContextCompat): MembershipRole {
  if (isAuthorizationContext(ctx)) {
    return ctx.role;
  }
  // Legacy roles map: Super_Admin→PLATFORM_ADMIN, Ketua_RT→RT_ADMIN, etc.
  return mapLegacyRole(ctx.role) as MembershipRole;
}

/**
 * Safely checks if the user has an authoritative membership.
 *
 * For AuthorizationContext: returns ctx.isAuthoritative
 * For legacy AuthContext: returns true (assumed authoritative in legacy system)
 *
 * @param ctx - The auth context
 * @returns true if membership is authoritative
 */
export function isAuthoritative(ctx: AuthContextCompat): boolean {
  if (isAuthorizationContext(ctx)) {
    return ctx.isAuthoritative;
  }
  // Legacy context assumed authoritative
  return true;
}

/**
 * Safely checks if the context is tenant-level (no org unit scope).
 *
 * For AuthorizationContext: returns ctx.isTenantLevel
 * For legacy AuthContext: checks if role is Super_Admin or Ketua_RT
 *
 * @param ctx - The auth context
 * @returns true if tenant-level
 */
export function isTenantLevel(ctx: AuthContextCompat): boolean {
  if (isAuthorizationContext(ctx)) {
    return ctx.isTenantLevel;
  }
  // For legacy context, check role
  return (
    ctx.role === UserRoleEnum.Super_Admin || ctx.role === UserRoleEnum.Ketua_RT
  );
}

// ---------------------------------------------------------------------------
// Common Accessors (available in both types)
// ---------------------------------------------------------------------------

/**
 * Gets the userId from either context type.
 * This field is available in both types.
 *
 * @param ctx - The auth context
 * @returns The user ID
 */
export function getUserId(ctx: AuthContextCompat): string {
  return ctx.userId;
}

/**
 * Gets the tenantId from either context type.
 * This field is available in both types.
 *
 * @param ctx - The auth context
 * @returns The tenant ID
 */
export function getTenantId(ctx: AuthContextCompat): string {
  return ctx.tenantId;
}

// ---------------------------------------------------------------------------
// Role Checking Helpers for Migration Compatibility
// ---------------------------------------------------------------------------

/**
 * Maps UserRole to MembershipRole equivalent for comparison.
 * This allows checking legacy UserRole values against MembershipRole.
 */
const USER_ROLE_TO_MEMBERSHIP_ROLE: ReadonlyMap<UserRole, MembershipRole> = new Map([
  [UserRoleEnum.Super_Admin, MembershipRole.PLATFORM_ADMIN],
  [UserRoleEnum.Ketua_RT, MembershipRole.RT_ADMIN],
  [UserRoleEnum.Pengurus, MembershipRole.ORG_ADMIN],
  [UserRoleEnum.Warga, MembershipRole.RESIDENT],
  [UserRoleEnum.Security_Guard, MembershipRole.SECURITY],
]);

/**
 * Maps MembershipRole back to UserRole for checking legacy UserRole sets.
 */
const MEMBERSHIP_ROLE_TO_USER_ROLE: ReadonlyMap<MembershipRole, UserRole> = new Map([
  [MembershipRole.PLATFORM_ADMIN, UserRoleEnum.Super_Admin],
  [MembershipRole.RT_ADMIN, UserRoleEnum.Ketua_RT],
  [MembershipRole.TENANT_OWNER, UserRoleEnum.Ketua_RT], // TENANT_OWNER maps to Ketua_RT for legacy compatibility
  [MembershipRole.ORG_ADMIN, UserRoleEnum.Pengurus],
  [MembershipRole.RESIDENT, UserRoleEnum.Warga],
  [MembershipRole.SECURITY, UserRoleEnum.Security_Guard],
]);

/**
 * Checks if the auth context has one of the allowed UserRole values.
 * 
 * For AuthorizationContext: converts MembershipRole to UserRole and checks against the set
 * For legacy AuthContext: checks directly against the set
 * 
 * This is useful during migration when use cases check against UserRole enum values.
 *
 * @param ctx - The auth context
 * @param allowedRoles - Set of allowed UserRole values
 * @returns true if the context's role is in the allowed set
 */
export function hasAllowedUserRole(
  ctx: AuthContextCompat,
  allowedRoles: ReadonlySet<UserRole>,
): boolean {
  if (isAuthorizationContext(ctx)) {
    const legacyRole = MEMBERSHIP_ROLE_TO_USER_ROLE.get(ctx.role);
    return legacyRole !== undefined && allowedRoles.has(legacyRole);
  }
  return allowedRoles.has(ctx.role);
}

/**
 * Checks if the auth context has one of the allowed MembershipRole values.
 * 
 * For AuthorizationContext: checks directly against the set
 * For legacy AuthContext: converts UserRole to MembershipRole and checks
 * 
 * This is useful for new use cases that use MembershipRole.
 *
 * @param ctx - The auth context
 * @param allowedRoles - Set of allowed MembershipRole values
 * @returns true if the context's role is in the allowed set
 */
export function hasAllowedMembershipRole(
  ctx: AuthContextCompat,
  allowedRoles: ReadonlySet<MembershipRole>,
): boolean {
  if (isAuthorizationContext(ctx)) {
    return allowedRoles.has(ctx.role);
  }
  const membershipRole = USER_ROLE_TO_MEMBERSHIP_ROLE.get(ctx.role);
  return membershipRole !== undefined && allowedRoles.has(membershipRole);
}

/**
 * Checks if the auth context has a specific UserRole (or its MembershipRole equivalent).
 * 
 * @param ctx - The auth context
 * @param role - The UserRole to check
 * @returns true if the context has the role
 */
export function hasUserRole(ctx: AuthContextCompat, role: UserRole): boolean {
  if (isAuthorizationContext(ctx)) {
    const legacyRole = MEMBERSHIP_ROLE_TO_USER_ROLE.get(ctx.role);
    return legacyRole === role;
  }
  return ctx.role === role;
}

/**
 * Gets impersonatorId if available in the context.
 * 
 * @param ctx - The auth context
 * @returns The impersonator ID if available, undefined otherwise
 */
export function getImpersonatorId(ctx: AuthContextCompat): string | undefined {
  return (ctx as AuthContext).impersonatorId;
}
