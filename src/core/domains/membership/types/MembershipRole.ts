/**
 * MembershipRole — Enumeration of all valid roles in the membership-based
 * authorization system.
 *
 * This enum replaces the legacy UserRole for authorization purposes.
 * Role mapping is LOCKED (L5):
 * - Super_Admin → PLATFORM_ADMIN
 * - Ketua_RT → RT_ADMIN
 * - Pengurus → ORG_ADMIN
 * - Warga → RESIDENT
 * - Security_Guard → SECURITY
 *
 * CRITICAL: SECURITY and RESIDENT are DISTINCT capability sets with
 * different permissions (NOT hierarchy levels).
 *
 * @see Requirements 2.2, 2.3, Design L5
 */

export enum MembershipRole {
  /**
   * Platform administrator — explicit platform-level permissions only.
   * Has NO implicit tenant data access; cross-tenant operations require
   * Privileged Execution Path.
   */
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',

  /**
   * Tenant owner — full tenant-wide scope, can delegate most roles.
   * orgUnitId is NULL for tenant-level scope.
   */
  TENANT_OWNER = 'TENANT_OWNER',

  /**
   * Organization administrator — manages OrgUnit subtree.
   * Can delegate RT_ADMIN, SECURITY, RESIDENT within scope.
   */
  ORG_ADMIN = 'ORG_ADMIN',

  /**
   * RT administrator — manages RT-level operations.
   * Can delegate SECURITY, RESIDENT within RT scope.
   */
  RT_ADMIN = 'RT_ADMIN',

  /**
   * Security personnel — monitors security, responds to alerts.
   * Has distinct capability set from RESIDENT (NOT equivalent hierarchy).
   */
  SECURITY = 'SECURITY',

  /**
   * Community resident — basic access rights.
   * Has distinct capability set from SECURITY (NOT equivalent hierarchy).
   */
  RESIDENT = 'RESIDENT',
}

/**
 * Roles that are tenant-level scoped (orgUnitId MUST be null).
 * @see INV-MEM-002
 */
export const TENANT_LEVEL_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
]);

/**
 * Roles that require org-scoped assignment (orgUnitId MUST NOT be null).
 * @see INV-MEM-003
 */
export const ORG_SCOPED_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.ORG_ADMIN,
  MembershipRole.RT_ADMIN,
  MembershipRole.SECURITY,
  MembershipRole.RESIDENT,
]);

/**
 * Type guard: checks if a role is tenant-level.
 */
export function isTenantLevelRole(role: MembershipRole): boolean {
  return TENANT_LEVEL_ROLES.has(role);
}

/**
 * Type guard: checks if a role requires org-scoped assignment.
 */
export function isOrgScopedRole(role: MembershipRole): boolean {
  return ORG_SCOPED_ROLES.has(role);
}

/**
 * All valid MembershipRole values for exhaustiveness checking.
 */
export const ALL_MEMBERSHIP_ROLES: readonly MembershipRole[] = Object.freeze([
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
  MembershipRole.ORG_ADMIN,
  MembershipRole.RT_ADMIN,
  MembershipRole.SECURITY,
  MembershipRole.RESIDENT,
]);
