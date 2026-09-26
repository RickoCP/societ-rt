/**
 * Role Mapping Service
 *
 * Maps legacy UserRole values to MembershipRole values per Locked Decision L5.
 * Also determines the appropriate OrgUnit scope per Locked Decision L6.
 *
 * @see Task 33: Evidence-Based Remediation Workflow
 * @see Requirement 11 AC 3: Role mapping
 * @see Requirement 11 AC 4: OrgUnit scope for non-admin RT users
 * @see Locked Decision L5: Role mapping
 * @see Locked Decision L6: Non-admin RT users org-scoped to RT root
 */

import type { MembershipRole, UserRole } from '@/generated/prisma/client';

import type { RemediationClassification } from './types';
import { RemediationError } from './types';

// ---------------------------------------------------------------------------
// Role Mapping Configuration (Locked Decision L5)
// ---------------------------------------------------------------------------

/**
 * Role mapping from legacy UserRole to MembershipRole.
 * Per Locked Decision L5 — this mapping is FROZEN and cannot change.
 *
 * - Super_Admin → PLATFORM_ADMIN
 * - Ketua_RT → RT_ADMIN
 * - Pengurus → ORG_ADMIN
 * - Warga → RESIDENT
 * - Security_Guard → SECURITY
 */
export const ROLE_MAPPING: Readonly<Record<UserRole, MembershipRole>> = {
  Super_Admin: 'PLATFORM_ADMIN',
  Ketua_RT: 'RT_ADMIN',
  Pengurus: 'ORG_ADMIN',
  Warga: 'RESIDENT',
  Security_Guard: 'SECURITY',
} as const;

/**
 * Roles that require tenant-level scope (orgUnitId = null).
 * Per Locked Decision L6.
 */
export const TENANT_LEVEL_ROLES: ReadonlySet<MembershipRole> = new Set([
  'PLATFORM_ADMIN',
  'TENANT_OWNER',
]);

/**
 * Roles that require org-unit scope (orgUnitId = RT root).
 * Per Locked Decision L6 — non-admin RT users get RT root scope, NOT tenant-wide null.
 */
export const ORG_SCOPED_ROLES: ReadonlySet<MembershipRole> = new Set([
  'RT_ADMIN',
  'ORG_ADMIN',
  'SECURITY',
  'RESIDENT',
]);

// ---------------------------------------------------------------------------
// Role Mapping Service Interface
// ---------------------------------------------------------------------------

/**
 * Role Mapping Service interface.
 */
export interface IRoleMappingService {
  /**
   * Map a legacy UserRole to MembershipRole.
   *
   * @param legacyRole - The legacy UserRole value
   * @returns The mapped MembershipRole
   * @throws RemediationError if role cannot be mapped
   */
  mapRole(legacyRole: UserRole): MembershipRole;

  /**
   * Try to map a legacy UserRole to MembershipRole.
   *
   * @param legacyRole - The legacy UserRole value
   * @returns The mapped MembershipRole or null if mapping fails
   */
  tryMapRole(legacyRole: UserRole): MembershipRole | null;

  /**
   * Check if a role can be mapped.
   *
   * @param legacyRole - The legacy UserRole value
   * @returns true if the role can be mapped
   */
  canMapRole(legacyRole: UserRole | string): boolean;

  /**
   * Determine if a MembershipRole requires tenant-level scope.
   *
   * @param role - The MembershipRole
   * @returns true if the role requires tenant-level scope (orgUnitId = null)
   */
  requiresTenantLevelScope(role: MembershipRole): boolean;

  /**
   * Determine if a MembershipRole requires org-unit scope.
   *
   * @param role - The MembershipRole
   * @returns true if the role requires org-unit scope (orgUnitId != null)
   */
  requiresOrgUnitScope(role: MembershipRole): boolean;

  /**
   * Get the target OrgUnit ID for a role.
   *
   * @param role - The MembershipRole
   * @param rtRootOrgUnitId - The RT root OrgUnit ID for org-scoped roles
   * @returns null for tenant-level roles, rtRootOrgUnitId for org-scoped roles
   */
  getTargetOrgUnitId(role: MembershipRole, rtRootOrgUnitId: string): string | null;

  /**
   * Get the classification for a legacy role.
   *
   * @param legacyRole - The legacy UserRole value
   * @returns Classification result
   */
  getClassification(legacyRole: UserRole | string): RemediationClassification;
}

// ---------------------------------------------------------------------------
// Role Mapping Service Implementation
// ---------------------------------------------------------------------------

/**
 * Creates a RoleMappingService instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @returns RoleMappingService instance
 *
 * @example
 * ```typescript
 * const mapper = createRoleMappingService();
 *
 * const membershipRole = mapper.mapRole('Ketua_RT'); // → 'RT_ADMIN'
 * const orgUnitId = mapper.getTargetOrgUnitId('RT_ADMIN', rtRootId); // → rtRootId
 * ```
 */
export function createRoleMappingService(): IRoleMappingService {
  return {
    mapRole(legacyRole: UserRole): MembershipRole {
      const mapped = ROLE_MAPPING[legacyRole];

      if (!mapped) {
        throw new RemediationError(
          'ROLE_MAPPING_FAILED',
          `Cannot map legacy role '${legacyRole}' to MembershipRole. ` +
            `Valid legacy roles are: ${Object.keys(ROLE_MAPPING).join(', ')}`,
          { legacyRole },
        );
      }

      return mapped;
    },

    tryMapRole(legacyRole: UserRole): MembershipRole | null {
      return ROLE_MAPPING[legacyRole] ?? null;
    },

    canMapRole(legacyRole: UserRole | string): boolean {
      return legacyRole in ROLE_MAPPING;
    },

    requiresTenantLevelScope(role: MembershipRole): boolean {
      return TENANT_LEVEL_ROLES.has(role);
    },

    requiresOrgUnitScope(role: MembershipRole): boolean {
      return ORG_SCOPED_ROLES.has(role);
    },

    getTargetOrgUnitId(role: MembershipRole, rtRootOrgUnitId: string): string | null {
      // Tenant-level roles get null orgUnitId
      if (TENANT_LEVEL_ROLES.has(role)) {
        return null;
      }

      // Org-scoped roles get RT root OrgUnit ID per L6
      // Non-admin RT users are org-scoped to RT root (NOT tenant-wide null)
      return rtRootOrgUnitId;
    },

    getClassification(legacyRole: UserRole | string): RemediationClassification {
      if (this.canMapRole(legacyRole)) {
        return 'known-pattern';
      }
      return 'invalid-role';
    },
  };
}

// ---------------------------------------------------------------------------
// Default Instance
// ---------------------------------------------------------------------------

/**
 * Default service instance for convenience imports.
 */
const defaultService = createRoleMappingService();

/**
 * Map a legacy UserRole to MembershipRole.
 *
 * Convenience function using default service.
 *
 * @param legacyRole - The legacy UserRole value
 * @returns The mapped MembershipRole
 * @throws RemediationError if role cannot be mapped
 */
export function mapLegacyRole(legacyRole: UserRole): MembershipRole {
  return defaultService.mapRole(legacyRole);
}

/**
 * Try to map a legacy UserRole to MembershipRole.
 *
 * Convenience function using default service.
 *
 * @param legacyRole - The legacy UserRole value
 * @returns The mapped MembershipRole or null if mapping fails
 */
export function tryMapLegacyRole(legacyRole: UserRole): MembershipRole | null {
  return defaultService.tryMapRole(legacyRole);
}

/**
 * Check if a role can be mapped.
 *
 * Convenience function using default service.
 *
 * @param legacyRole - The legacy UserRole value
 * @returns true if the role can be mapped
 */
export function canMapLegacyRole(legacyRole: UserRole | string): boolean {
  return defaultService.canMapRole(legacyRole);
}

/**
 * Get the target OrgUnit ID for a mapped role.
 *
 * Convenience function using default service.
 *
 * @param role - The MembershipRole
 * @param rtRootOrgUnitId - The RT root OrgUnit ID
 * @returns null for tenant-level roles, rtRootOrgUnitId for org-scoped roles
 */
export function getTargetOrgUnitId(
  role: MembershipRole,
  rtRootOrgUnitId: string,
): string | null {
  return defaultService.getTargetOrgUnitId(role, rtRootOrgUnitId);
}
