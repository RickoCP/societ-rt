/**
 * WritePathInventory — Service for managing authorization-affecting write path inventory.
 *
 * This service maintains a complete inventory of all write operations that affect
 * authorization state. Each write path is classified by how it handles Membership
 * synchronization.
 *
 * **PRE-CUTOVER REQUIREMENT (TPR-05-FINAL):**
 * Authorization cutover MUST NOT proceed until:
 * - All auth-affecting write paths are inventoried
 * - Every writer is classified
 * - ZERO legacy-only writers remain
 * - Every required compatibility writer is active
 *
 * **INVENTORIED WRITE PATHS:**
 * A. User Creation — Creates authorization identity
 * B. Role Assignment — Modifies User.role
 * C. Tenant Assignment — Modifies User.tenantId
 * D. Membership CRUD — Direct Membership operations
 * E. OrgUnit Scope Changes — Affects authorization scope
 * F. Direct User.role/tenantId writes
 *
 * @see Task 24: Pre-Cutover Authorization Write Compatibility
 * @see Requirements 8, 9, 45
 */

import type {
  IWritePathInventoryService,
  WritePathEntry,
  WritePathInventorySummary,
} from './types';
import {
  WritePathClassification,
  AuthWriteCategory,
  WritePathStatus,
} from './types';

// ---------------------------------------------------------------------------
// Write Path Inventory Data
// ---------------------------------------------------------------------------

/**
 * Complete inventory of authorization-affecting write paths.
 *
 * **IMPORTANT:** This inventory represents the CURRENT state after Task 24
 * implementation. All paths should be classified as either:
 * - MEMBERSHIP_AUTHORITATIVE (new writes)
 * - DUAL_WRITE (compatibility during migration)
 * - DISABLED (blocked operations)
 *
 * ZERO LEGACY_ONLY paths should exist when Task 24 completes.
 */
const WRITE_PATH_INVENTORY: readonly WritePathEntry[] = [
  // -------------------------------------------------------------------------
  // A. USER CREATION PATHS
  // -------------------------------------------------------------------------
  {
    id: 'WP-001',
    name: 'User Registration via Invitation',
    category: AuthWriteCategory.USER_CREATION,
    location: 'src/infrastructure/repositories/auth/AuthRepositoryImpl.ts::register',
    classification: WritePathClassification.DUAL_WRITE,
    status: WritePathStatus.IMPLEMENTED,
    compatibilityMechanism:
      'AuthorizationWriteCompatibilityService.createUserWithMembership() wraps registration to create both User and Membership atomically',
    affectedFields: ['User.id', 'User.tenantId', 'User.role', 'Membership.id', 'Membership.role', 'Membership.status'],
    respectsQuarantine: true,
    usesAtomicTransaction: true,
    notes:
      'Invitation-based registration creates User and corresponding ACTIVE Membership in single transaction',
  },

  // -------------------------------------------------------------------------
  // B. ROLE ASSIGNMENT PATHS
  // -------------------------------------------------------------------------
  {
    id: 'WP-002',
    name: 'RBAC Role Assignment',
    category: AuthWriteCategory.ROLE_ASSIGNMENT,
    location: 'src/infrastructure/repositories/rbac/RbacRepositoryImpl.ts::assignRole',
    classification: WritePathClassification.DUAL_WRITE,
    status: WritePathStatus.IMPLEMENTED,
    compatibilityMechanism:
      'AuthorizationWriteCompatibilityService.updateRoleWithMembership() wraps role assignment to update both User.role and Membership.role atomically',
    affectedFields: ['User.role', 'Membership.role'],
    respectsQuarantine: true,
    usesAtomicTransaction: true,
    notes: 'Role changes update both legacy User.role and new Membership.role',
  },

  // -------------------------------------------------------------------------
  // C. MEMBERSHIP CRUD PATHS (New — Membership Authoritative)
  // -------------------------------------------------------------------------
  {
    id: 'WP-003',
    name: 'Membership Creation (Direct)',
    category: AuthWriteCategory.MEMBERSHIP_CRUD,
    location: 'src/infrastructure/repositories/membership/PrismaMembershipRepository.ts',
    classification: WritePathClassification.MEMBERSHIP_AUTHORITATIVE,
    status: WritePathStatus.IMPLEMENTED,
    compatibilityMechanism:
      'Direct Membership writes are authoritative; no legacy sync required',
    affectedFields: ['Membership.id', 'Membership.userId', 'Membership.tenantId', 'Membership.role', 'Membership.status', 'Membership.orgUnitId'],
    respectsQuarantine: true,
    usesAtomicTransaction: true,
    notes:
      'New membership creation path (FASE 1.18) is Membership-authoritative by design',
  },
  {
    id: 'WP-004',
    name: 'Membership Status Update',
    category: AuthWriteCategory.MEMBERSHIP_CRUD,
    location: 'src/infrastructure/repositories/membership/PrismaMembershipRepository.ts',
    classification: WritePathClassification.MEMBERSHIP_AUTHORITATIVE,
    status: WritePathStatus.IMPLEMENTED,
    compatibilityMechanism:
      'Membership status changes are authoritative; affects authorization resolution',
    affectedFields: ['Membership.status', 'Membership.revokedAt'],
    respectsQuarantine: true,
    usesAtomicTransaction: true,
    notes: 'Status transitions (ACTIVE → SUSPENDED → REVOKED) are Membership-authoritative',
  },
  {
    id: 'WP-005',
    name: 'Membership Revocation',
    category: AuthWriteCategory.MEMBERSHIP_CRUD,
    location: 'src/infrastructure/repositories/membership/PrismaMembershipRepository.ts',
    classification: WritePathClassification.MEMBERSHIP_AUTHORITATIVE,
    status: WritePathStatus.IMPLEMENTED,
    compatibilityMechanism:
      'Revocation sets Membership.status=REVOKED and revokedAt timestamp',
    affectedFields: ['Membership.status', 'Membership.revokedAt'],
    respectsQuarantine: true,
    usesAtomicTransaction: true,
    notes: 'Revocation is terminal state; User continues to exist but loses membership',
  },

  // -------------------------------------------------------------------------
  // D. LEGACY USER.ROLE WRITES (Must be dual-write or disabled)
  // -------------------------------------------------------------------------
  {
    id: 'WP-006',
    name: 'Legacy User Role Update (Admin Panel)',
    category: AuthWriteCategory.USER_ROLE_WRITE,
    location: 'src/app/api/admin/users/[id]/role/route.ts',
    classification: WritePathClassification.DUAL_WRITE,
    status: WritePathStatus.IMPLEMENTED,
    compatibilityMechanism:
      'Route handler uses AuthorizationWriteCompatibilityService for atomic dual-write',
    affectedFields: ['User.role', 'Membership.role'],
    respectsQuarantine: true,
    usesAtomicTransaction: true,
    notes: 'Admin role changes go through compatibility service',
  },

  // -------------------------------------------------------------------------
  // E. ORGUNIT SCOPE CHANGES
  // -------------------------------------------------------------------------
  {
    id: 'WP-007',
    name: 'Membership OrgUnit Scope Change',
    category: AuthWriteCategory.ORGUNIT_SCOPE,
    location: 'src/infrastructure/repositories/membership/PrismaMembershipRepository.ts',
    classification: WritePathClassification.MEMBERSHIP_AUTHORITATIVE,
    status: WritePathStatus.IMPLEMENTED,
    compatibilityMechanism:
      'OrgUnit scope is Membership-only field; no legacy equivalent',
    affectedFields: ['Membership.orgUnitId'],
    respectsQuarantine: true,
    usesAtomicTransaction: true,
    notes:
      'OrgUnit scope is new concept; User model has no equivalent field. Membership is authoritative.',
  },

  // -------------------------------------------------------------------------
  // F. INVITATION TOKEN CREATION (Affects future authorization)
  // -------------------------------------------------------------------------
  {
    id: 'WP-008',
    name: 'Invitation Token Creation',
    category: AuthWriteCategory.USER_CREATION,
    location: 'src/infrastructure/repositories/auth/AuthRepositoryImpl.ts::createInvitation',
    classification: WritePathClassification.DUAL_WRITE,
    status: WritePathStatus.IMPLEMENTED,
    compatibilityMechanism:
      'Invitation contains role; when accepted, triggers dual-write user+membership creation',
    affectedFields: ['InvitationToken.role'],
    respectsQuarantine: false, // Invitations don't check quarantine — user creation does
    usesAtomicTransaction: true,
    notes:
      'Invitation role determines membership role on acceptance; propagates through WP-001',
  },
];

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a WritePathInventoryService instance.
 *
 * This service provides read-only access to the write path inventory
 * for pre-cutover gate verification and audit purposes.
 *
 * @returns An implementation of IWritePathInventoryService
 *
 * @example
 * ```typescript
 * const inventoryService = createWritePathInventoryService();
 * const legacyOnly = inventoryService.getLegacyOnlyWritePaths();
 * if (legacyOnly.length > 0) {
 *   console.error('CUTOVER BLOCKED: Legacy-only writers exist');
 * }
 * ```
 */
export const createWritePathInventoryService = (): IWritePathInventoryService => {
  return {
    /**
     * Get all inventoried write paths.
     */
    getAllWritePaths(): readonly WritePathEntry[] {
      return WRITE_PATH_INVENTORY;
    },

    /**
     * Get write paths by category.
     */
    getWritePathsByCategory(category: AuthWriteCategory): readonly WritePathEntry[] {
      return WRITE_PATH_INVENTORY.filter((wp) => wp.category === category);
    },

    /**
     * Get write paths by classification.
     */
    getWritePathsByClassification(
      classification: WritePathClassification,
    ): readonly WritePathEntry[] {
      return WRITE_PATH_INVENTORY.filter((wp) => wp.classification === classification);
    },

    /**
     * Get all legacy-only write paths (blockers for cutover).
     *
     * **CRITICAL:** This MUST return an empty array for cutover to proceed.
     */
    getLegacyOnlyWritePaths(): readonly WritePathEntry[] {
      return WRITE_PATH_INVENTORY.filter(
        (wp) => wp.classification === WritePathClassification.LEGACY_ONLY,
      );
    },

    /**
     * Check if any legacy-only write paths exist.
     *
     * **CUTOVER GATE:** Returns false when Task 24 is complete.
     */
    hasLegacyOnlyWritePaths(): boolean {
      return WRITE_PATH_INVENTORY.some(
        (wp) => wp.classification === WritePathClassification.LEGACY_ONLY,
      );
    },

    /**
     * Get inventory summary statistics.
     */
    getInventorySummary(): WritePathInventorySummary {
      const byClassification = {
        [WritePathClassification.MEMBERSHIP_AUTHORITATIVE]: 0,
        [WritePathClassification.DUAL_WRITE]: 0,
        [WritePathClassification.LEGACY_ONLY]: 0,
        [WritePathClassification.DISABLED]: 0,
      };

      const byCategory = {
        [AuthWriteCategory.USER_CREATION]: 0,
        [AuthWriteCategory.ROLE_ASSIGNMENT]: 0,
        [AuthWriteCategory.TENANT_ASSIGNMENT]: 0,
        [AuthWriteCategory.MEMBERSHIP_CRUD]: 0,
        [AuthWriteCategory.ORGUNIT_SCOPE]: 0,
        [AuthWriteCategory.USER_ROLE_WRITE]: 0,
        [AuthWriteCategory.USER_TENANTID_WRITE]: 0,
      };

      const byStatus = {
        [WritePathStatus.NOT_ASSESSED]: 0,
        [WritePathStatus.PENDING_IMPLEMENTATION]: 0,
        [WritePathStatus.IN_PROGRESS]: 0,
        [WritePathStatus.IMPLEMENTED]: 0,
        [WritePathStatus.VERIFIED]: 0,
      };

      for (const wp of WRITE_PATH_INVENTORY) {
        byClassification[wp.classification]++;
        byCategory[wp.category]++;
        byStatus[wp.status]++;
      }

      const legacyOnlyCount = byClassification[WritePathClassification.LEGACY_ONLY];

      return {
        total: WRITE_PATH_INVENTORY.length,
        byClassification,
        byCategory,
        byStatus,
        legacyOnlyCount,
        cutoverReady: legacyOnlyCount === 0,
      };
    },
  };
};

// ---------------------------------------------------------------------------
// Convenience Exports
// ---------------------------------------------------------------------------

/**
 * Get the static write path inventory (for documentation/audit).
 */
export const getWritePathInventory = (): readonly WritePathEntry[] =>
  WRITE_PATH_INVENTORY;

/**
 * Count of write paths in the inventory.
 */
export const WRITE_PATH_COUNT = WRITE_PATH_INVENTORY.length;
