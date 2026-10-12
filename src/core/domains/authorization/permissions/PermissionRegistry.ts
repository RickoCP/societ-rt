/**
 * PermissionRegistry — Central configuration mapping roles to explicit permission sets.
 *
 * CRITICAL DESIGN PRINCIPLES:
 * - NO INHERITANCE between roles — each role has its own EXPLICIT permission set
 * - SECURITY and RESIDENT have DISTINCT capability sets (NOT hierarchy levels)
 * - Unknown permission → fail closed with logging
 * - Registry is IMMUTABLE at runtime (loaded at startup, frozen)
 *
 * PLATFORM_ADMIN NOTE:
 * PLATFORM_ADMIN has NO implicit tenant data access. Cross-tenant operations
 * require the Privileged Execution Path (L11). PLATFORM_ADMIN permissions are
 * explicitly platform-level only.
 *
 * @see Requirements 2.2, 2.3, 2.5, 2.6, 2.7, 2.8
 * @see Design Components and Interfaces > 8. Permission Registry
 * @see Locked Decision L11 (Privileged Execution Path)
 */

import { MembershipRole } from '@core/domains/membership/types';
import { PERMISSIONS, PERMISSION_BY_CODE, isValidPermissionCode } from './Permission';

// ---------------------------------------------------------------------------
// Role to Permission Mapping — EXPLICIT, NO INHERITANCE
// ---------------------------------------------------------------------------

/**
 * ROLE_PERMISSIONS — Maps each MembershipRole to its EXPLICIT set of permissions.
 *
 * CRITICAL: This mapping is the single source of truth for role capabilities.
 * There is NO permission inheritance between roles. Each role's permissions
 * are explicitly listed.
 *
 * @see Requirements 2.2 — Role-permission mapping is explicit
 * @see Requirements 2.5 — Query returns ONLY explicitly mapped permissions
 * @see Design Decision D5 — Config-based static mapping
 */
export const ROLE_PERMISSIONS: Readonly<Record<MembershipRole, readonly string[]>> = Object.freeze({
  // =========================================================================
  // PLATFORM_ADMIN — Full access to all features (Super Admin)
  // =========================================================================
  /**
   * PLATFORM_ADMIN has FULL access to all features across the platform.
   *
   * This role is the "super admin" with unrestricted access to:
   * - All platform-level operations
   * - All tenant-level operations (when operating within a tenant context)
   *
   * NOTE: While PLATFORM_ADMIN has all permissions, actual data access
   * is still scoped by the active tenant context in the authorization flow.
   *
   * @see Design Components > 8. Permission Registry > PLATFORM_ADMIN Rules
   */
  [MembershipRole.PLATFORM_ADMIN]: Object.freeze([
    // Platform-level permissions
    PERMISSIONS.PLATFORM_CONFIG_READ.code,
    PERMISSIONS.PLATFORM_CONFIG_WRITE.code,
    PERMISSIONS.PLATFORM_AUDIT_READ.code,
    PERMISSIONS.PLATFORM_TENANT_PROVISION.code,
    PERMISSIONS.PLATFORM_TENANT_SUSPEND.code,
    PERMISSIONS.PLATFORM_TENANT_TERMINATE.code,
    PERMISSIONS.PLATFORM_SUBSCRIPTION_MANAGE.code,
    PERMISSIONS.PLATFORM_ANOMALY_REVIEW.code,
    PERMISSIONS.PLATFORM_ANOMALY_REMEDIATE.code,
    // Tenant management
    PERMISSIONS.TENANT_MANAGE.code,
    PERMISSIONS.ORGUNIT_MANAGE.code,
    PERMISSIONS.ORGUNIT_READ.code,
    // Administration (letter requests)
    PERMISSIONS.ADMIN_READ.code,
    PERMISSIONS.ADMIN_WRITE.code,
    PERMISSIONS.ADMIN_MANAGE.code,
    // Role delegation
    PERMISSIONS.MEMBERSHIP_DELEGATE.code,
    PERMISSIONS.MEMBERSHIP_READ.code,
    // Financial access
    PERMISSIONS.FINANCE_READ.code,
    PERMISSIONS.FINANCE_WRITE.code,
    // Resident management
    PERMISSIONS.RESIDENT_READ.code,
    PERMISSIONS.RESIDENT_WRITE.code,
    PERMISSIONS.HOUSEHOLD_MANAGE.code,
    PERMISSIONS.HOUSEHOLD_READ.code,
    // Communication
    PERMISSIONS.ANNOUNCEMENT_READ.code,
    PERMISSIONS.ANNOUNCEMENT_PUBLISH.code,
    // Voting
    PERMISSIONS.VOTE_MANAGE.code,
    PERMISSIONS.VOTE_CAST.code,
    // IoT
    PERMISSIONS.IOT_COMMAND.code,
    PERMISSIONS.IOT_READ.code,
    PERMISSIONS.IOT_MANAGE.code,
    // Emergency
    PERMISSIONS.EMERGENCY_CREATE.code,
    PERMISSIONS.EMERGENCY_READ.code,
    PERMISSIONS.EMERGENCY_MANAGE.code,
    // Security
    PERMISSIONS.SECURITY_MANAGE.code,
    PERMISSIONS.SECURITY_READ.code,
    PERMISSIONS.PATROL_MANAGE.code,
    PERMISSIONS.PATROL_READ.code,
    PERMISSIONS.INCIDENT_MANAGE.code,
    PERMISSIONS.INCIDENT_REPORT.code,
    // Privacy
    PERMISSIONS.PRIVACY_READ.code,
    PERMISSIONS.PRIVACY_MANAGE.code,
  ]),

  // =========================================================================
  // TENANT_OWNER — Full tenant-wide scope (Admin)
  // =========================================================================
  /**
   * TENANT_OWNER can manage the entire tenant, delegate roles, and access
   * all tenant-level resources. This is the "admin" role for a tenant.
   */
  [MembershipRole.TENANT_OWNER]: Object.freeze([
    // Tenant management
    PERMISSIONS.TENANT_MANAGE.code,
    PERMISSIONS.ORGUNIT_MANAGE.code,
    PERMISSIONS.ORGUNIT_READ.code,
    // Administration (letter requests)
    PERMISSIONS.ADMIN_READ.code,
    PERMISSIONS.ADMIN_WRITE.code,
    PERMISSIONS.ADMIN_MANAGE.code,
    // Tenant-scoped audit log access (shares the audit:read code; the audit
    // repository scopes results by authContext.tenantId)
    PERMISSIONS.PLATFORM_AUDIT_READ.code,
    // Role delegation
    PERMISSIONS.MEMBERSHIP_DELEGATE.code,
    PERMISSIONS.MEMBERSHIP_READ.code,
    // Financial access
    PERMISSIONS.FINANCE_READ.code,
    PERMISSIONS.FINANCE_WRITE.code,
    // Resident management
    PERMISSIONS.RESIDENT_READ.code,
    PERMISSIONS.RESIDENT_WRITE.code,
    PERMISSIONS.HOUSEHOLD_MANAGE.code,
    PERMISSIONS.HOUSEHOLD_READ.code,
    // Communication
    PERMISSIONS.ANNOUNCEMENT_READ.code,
    PERMISSIONS.ANNOUNCEMENT_PUBLISH.code,
    // Voting
    PERMISSIONS.VOTE_MANAGE.code,
    PERMISSIONS.VOTE_CAST.code,
    // IoT
    PERMISSIONS.IOT_COMMAND.code,
    PERMISSIONS.IOT_READ.code,
    PERMISSIONS.IOT_MANAGE.code,
    // Emergency
    PERMISSIONS.EMERGENCY_CREATE.code,
    PERMISSIONS.EMERGENCY_READ.code,
    PERMISSIONS.EMERGENCY_MANAGE.code,
    // Security
    PERMISSIONS.SECURITY_MANAGE.code,
    PERMISSIONS.SECURITY_READ.code,
    PERMISSIONS.PATROL_MANAGE.code,
    PERMISSIONS.PATROL_READ.code,
    PERMISSIONS.INCIDENT_MANAGE.code,
    PERMISSIONS.INCIDENT_REPORT.code,
    // Privacy
    PERMISSIONS.PRIVACY_READ.code,
    PERMISSIONS.PRIVACY_MANAGE.code,
  ]),

  // =========================================================================
  // ORG_ADMIN — Organization-level scope
  // =========================================================================
  /**
   * ORG_ADMIN manages an OrgUnit subtree. Can delegate RT_ADMIN, SECURITY,
   * and RESIDENT roles within their scope.
   */
  [MembershipRole.ORG_ADMIN]: Object.freeze([
    // Role delegation (within scope)
    PERMISSIONS.MEMBERSHIP_DELEGATE.code,
    PERMISSIONS.MEMBERSHIP_READ.code,
    // OrgUnit read (not manage)
    PERMISSIONS.ORGUNIT_READ.code,
    // Administration (letter requests)
    PERMISSIONS.ADMIN_READ.code,
    PERMISSIONS.ADMIN_WRITE.code,
    PERMISSIONS.ADMIN_MANAGE.code,
    // Financial access
    PERMISSIONS.FINANCE_READ.code,
    PERMISSIONS.FINANCE_WRITE.code,
    // Resident management
    PERMISSIONS.RESIDENT_READ.code,
    PERMISSIONS.RESIDENT_WRITE.code,
    PERMISSIONS.HOUSEHOLD_MANAGE.code,
    PERMISSIONS.HOUSEHOLD_READ.code,
    // Communication
    PERMISSIONS.ANNOUNCEMENT_READ.code,
    PERMISSIONS.ANNOUNCEMENT_PUBLISH.code,
    // Voting
    PERMISSIONS.VOTE_MANAGE.code,
    PERMISSIONS.VOTE_CAST.code,
    // IoT (limited)
    PERMISSIONS.IOT_READ.code,
    // Emergency
    PERMISSIONS.EMERGENCY_CREATE.code,
    PERMISSIONS.EMERGENCY_READ.code,
    PERMISSIONS.EMERGENCY_MANAGE.code,
    // Security (read + manage for visitor/package logging)
    PERMISSIONS.SECURITY_READ.code,
    PERMISSIONS.SECURITY_MANAGE.code,
    PERMISSIONS.PATROL_MANAGE.code,
    PERMISSIONS.PATROL_READ.code,
    PERMISSIONS.INCIDENT_MANAGE.code,
    PERMISSIONS.INCIDENT_REPORT.code,
  ]),

  // =========================================================================
  // RT_ADMIN — RT-level scope
  // =========================================================================
  /**
   * RT_ADMIN manages RT-level operations. Can delegate SECURITY and RESIDENT
   * roles within their RT scope.
   */
  [MembershipRole.RT_ADMIN]: Object.freeze([
    // Role delegation (within scope)
    PERMISSIONS.MEMBERSHIP_DELEGATE.code,
    PERMISSIONS.MEMBERSHIP_READ.code,
    // Administration (letter requests)
    PERMISSIONS.ADMIN_READ.code,
    PERMISSIONS.ADMIN_WRITE.code,
    PERMISSIONS.ADMIN_MANAGE.code,
    // Tenant-scoped audit log access (shares the audit:read code; the audit
    // repository scopes results by authContext.tenantId)
    PERMISSIONS.PLATFORM_AUDIT_READ.code,
    // Financial access
    PERMISSIONS.FINANCE_READ.code,
    PERMISSIONS.FINANCE_WRITE.code,
    // Resident management
    PERMISSIONS.RESIDENT_READ.code,
    PERMISSIONS.RESIDENT_WRITE.code,
    PERMISSIONS.HOUSEHOLD_MANAGE.code,
    PERMISSIONS.HOUSEHOLD_READ.code,
    // Communication
    PERMISSIONS.ANNOUNCEMENT_READ.code,
    PERMISSIONS.ANNOUNCEMENT_PUBLISH.code,
    // Voting
    PERMISSIONS.VOTE_MANAGE.code,
    PERMISSIONS.VOTE_CAST.code,
    // IoT (full for RT-level)
    PERMISSIONS.IOT_COMMAND.code,
    PERMISSIONS.IOT_READ.code,
    PERMISSIONS.IOT_MANAGE.code,
    // Emergency
    PERMISSIONS.EMERGENCY_CREATE.code,
    PERMISSIONS.EMERGENCY_READ.code,
    PERMISSIONS.EMERGENCY_MANAGE.code,
    // Security (read + manage for visitor/package logging, alarms, CCTV)
    PERMISSIONS.SECURITY_READ.code,
    PERMISSIONS.SECURITY_MANAGE.code,
    PERMISSIONS.PATROL_MANAGE.code,
    PERMISSIONS.PATROL_READ.code,
    PERMISSIONS.INCIDENT_MANAGE.code,
    PERMISSIONS.INCIDENT_REPORT.code,
  ]),

  // =========================================================================
  // SECURITY — Security monitoring scope (DISTINCT from RESIDENT)
  // =========================================================================
  /**
   * SECURITY personnel monitor security, respond to alerts, and manage patrols.
   *
   * CRITICAL: SECURITY has DISTINCT capabilities from RESIDENT.
   * They are NOT hierarchy levels — they have different permission sets.
   *
   * @see Requirements 2.3 — SECURITY and RESIDENT are distinct capability sets
   */
  [MembershipRole.SECURITY]: Object.freeze([
    // Resident read (for identification)
    PERMISSIONS.RESIDENT_READ.code,
    // Emergency (can create and manage)
    PERMISSIONS.EMERGENCY_CREATE.code,
    PERMISSIONS.EMERGENCY_READ.code,
    PERMISSIONS.EMERGENCY_MANAGE.code,
    // Patrol (full access)
    PERMISSIONS.PATROL_MANAGE.code,
    PERMISSIONS.PATROL_READ.code,
    // Incident reporting
    PERMISSIONS.INCIDENT_REPORT.code,
    PERMISSIONS.INCIDENT_MANAGE.code,
    // Security (read + manage for visitor/package logging)
    PERMISSIONS.SECURITY_READ.code,
    PERMISSIONS.SECURITY_MANAGE.code,
    // IoT read (for monitoring)
    PERMISSIONS.IOT_READ.code,
    // Announcement read
    PERMISSIONS.ANNOUNCEMENT_READ.code,
    // Privacy (own data only — GDPR rights)
    PERMISSIONS.PRIVACY_READ.code,
    PERMISSIONS.PRIVACY_MANAGE.code,
  ]),

  // =========================================================================
  // RESIDENT — Basic resident scope (DISTINCT from SECURITY)
  // =========================================================================
  /**
   * RESIDENT has basic access rights for community participation.
   *
   * CRITICAL: RESIDENT has DISTINCT capabilities from SECURITY.
   * They are NOT hierarchy levels — they have different permission sets.
   *
   * NOTE: RESIDENT with `resident:read` can ONLY read their own data
   * (USER_SELF scope), NOT all residents in the RT.
   *
   * @see Requirements 2.3 — SECURITY and RESIDENT are distinct capability sets
   * @see Design > Resource Scope Matrix > RESIDENT Role Scope Clarification
   */
  [MembershipRole.RESIDENT]: Object.freeze([
    // Resident read (own data only — USER_SELF scope)
    PERMISSIONS.RESIDENT_READ.code,
    // Household read (own household only)
    PERMISSIONS.HOUSEHOLD_READ.code,
    // Emergency (can create for own safety)
    PERMISSIONS.EMERGENCY_CREATE.code,
    PERMISSIONS.EMERGENCY_READ.code,
    // Announcement read
    PERMISSIONS.ANNOUNCEMENT_READ.code,
    // Voting
    PERMISSIONS.VOTE_CAST.code,
    // Privacy (own data only — GDPR rights)
    PERMISSIONS.PRIVACY_READ.code,
    PERMISSIONS.PRIVACY_MANAGE.code,
  ]),
});

// ---------------------------------------------------------------------------
// Permission Registry Interface
// ---------------------------------------------------------------------------

/**
 * PermissionRegistry — Frozen registry loaded at startup.
 *
 * This object is the runtime representation of the permission system.
 * It is IMMUTABLE after initialization (Object.freeze at module load).
 *
 * @see Requirements 2.6 — Loadable at startup, immutable during runtime
 */
export interface PermissionRegistry {
  /** All defined permissions */
  readonly permissions: ReadonlyMap<string, typeof PERMISSIONS[keyof typeof PERMISSIONS]>;
  /** Role to permission set mapping */
  readonly rolePermissions: Readonly<Record<MembershipRole, ReadonlySet<string>>>;
}

// ---------------------------------------------------------------------------
// Create the frozen permission registry
// ---------------------------------------------------------------------------

/**
 * Convert ROLE_PERMISSIONS arrays to Sets for O(1) lookup.
 */
const rolePermissionSets: Record<MembershipRole, ReadonlySet<string>> = {
  [MembershipRole.PLATFORM_ADMIN]: new Set(ROLE_PERMISSIONS[MembershipRole.PLATFORM_ADMIN]),
  [MembershipRole.TENANT_OWNER]: new Set(ROLE_PERMISSIONS[MembershipRole.TENANT_OWNER]),
  [MembershipRole.ORG_ADMIN]: new Set(ROLE_PERMISSIONS[MembershipRole.ORG_ADMIN]),
  [MembershipRole.RT_ADMIN]: new Set(ROLE_PERMISSIONS[MembershipRole.RT_ADMIN]),
  [MembershipRole.SECURITY]: new Set(ROLE_PERMISSIONS[MembershipRole.SECURITY]),
  [MembershipRole.RESIDENT]: new Set(ROLE_PERMISSIONS[MembershipRole.RESIDENT]),
};

/**
 * PERMISSION_REGISTRY — The frozen, immutable permission registry.
 *
 * This is the single source of truth at runtime. Loaded at module init,
 * frozen immediately, cannot be modified.
 */
export const PERMISSION_REGISTRY: PermissionRegistry = Object.freeze({
  permissions: PERMISSION_BY_CODE,
  rolePermissions: Object.freeze(rolePermissionSets),
});

// ---------------------------------------------------------------------------
// Permission Lookup Helpers
// ---------------------------------------------------------------------------

/**
 * Gets the set of permissions for a given role.
 *
 * Returns ONLY the explicitly mapped permissions for that role.
 * No inheritance from other roles.
 *
 * @see Requirements 2.5 — Returns ONLY explicitly mapped permissions
 */
export function getPermissionsForRole(role: MembershipRole): ReadonlySet<string> {
  const permissions = PERMISSION_REGISTRY.rolePermissions[role];
  if (!permissions) {
    // Unknown role — return empty set (fail closed)
    return new Set();
  }
  return permissions;
}

/**
 * Checks if a role has a specific permission.
 *
 * @param role - The membership role to check
 * @param permissionCode - The permission code (e.g., 'resident:read')
 * @returns true if the role has the permission, false otherwise
 *
 * @see Requirements 2.7 — Unknown permission fails closed
 */
export function roleHasPermission(
  role: MembershipRole,
  permissionCode: string,
): boolean {
  // Validate the permission code exists
  if (!isValidPermissionCode(permissionCode)) {
    // Unknown permission — fail closed (treated as "not having it")
    // Logging should be handled by the caller
    return false;
  }

  const permissions = getPermissionsForRole(role);
  return permissions.has(permissionCode);
}

/**
 * Checks if a role has ALL the specified permissions.
 *
 * @param role - The membership role to check
 * @param requiredPermissions - Array of required permission codes
 * @returns true if the role has ALL permissions, false otherwise
 *
 * @see Requirements 5.3 — Access granted IFF all required permissions present
 */
export function roleHasAllPermissions(
  role: MembershipRole,
  requiredPermissions: readonly string[],
): boolean {
  if (requiredPermissions.length === 0) {
    return true;
  }

  const rolePermissions = getPermissionsForRole(role);

  for (const required of requiredPermissions) {
    // Unknown permission check
    if (!isValidPermissionCode(required)) {
      // Unknown permission — fail closed
      return false;
    }

    if (!rolePermissions.has(required)) {
      return false;
    }
  }

  return true;
}

/**
 * Gets the list of missing permissions for a role.
 *
 * Returns an array of permission codes that are required but not present
 * in the role's permission set.
 *
 * @param role - The membership role to check
 * @param requiredPermissions - Array of required permission codes
 * @returns Array of missing permission codes (empty if all present)
 */
export function getMissingPermissions(
  role: MembershipRole,
  requiredPermissions: readonly string[],
): string[] {
  if (requiredPermissions.length === 0) {
    return [];
  }

  const rolePermissions = getPermissionsForRole(role);
  const missing: string[] = [];

  for (const required of requiredPermissions) {
    // Include unknown permissions as missing (fail closed)
    if (!isValidPermissionCode(required) || !rolePermissions.has(required)) {
      missing.push(required);
    }
  }

  return missing;
}

// ---------------------------------------------------------------------------
// Registry Validation (for startup)
// ---------------------------------------------------------------------------

/**
 * Validates the permission registry consistency.
 *
 * Checks that all permissions referenced in ROLE_PERMISSIONS exist in PERMISSIONS.
 * Should be called at application startup.
 *
 * @returns Array of validation errors (empty if valid)
 */
export function validatePermissionRegistry(): string[] {
  const errors: string[] = [];

  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permCode of permissions) {
      if (!isValidPermissionCode(permCode)) {
        errors.push(
          `Role ${role} references undefined permission: ${permCode}`,
        );
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Module initialization — validate registry on load
// ---------------------------------------------------------------------------

const registryErrors = validatePermissionRegistry();
if (registryErrors.length > 0) {
  // This should never happen in production — indicates a code bug
  throw new Error(
    `PermissionRegistry validation failed:\n${registryErrors.join('\n')}`,
  );
}
