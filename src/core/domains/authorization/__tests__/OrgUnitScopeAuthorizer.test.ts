/**
 * OrgUnitScopeAuthorizer Unit Tests
 *
 * Tests for the OrgUnit Scope Authorizer (Task 15) that applies
 * authorization POLICY using Task 6 primitives.
 *
 * **Test Coverage:**
 * - Tenant check BEFORE OrgUnit scope check (security order)
 * - Tenant-level admins (PLATFORM_ADMIN, TENANT_OWNER) have full scope
 * - Org-scoped roles require resource OrgUnit within membership scope
 * - AUTH_TENANT_MISMATCH has higher priority than AUTH_OUT_OF_SCOPE
 * - Fail closed on unknown states (INV-AUTH-002)
 *
 * **Validates: Requirements 6 (AC 1-7)**
 * **Validates: Design Property 6 (OrgUnit Scope Containment)**
 *
 * @see Task 15: OrgUnit Scope Authorizer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, fail } from '@core/utils';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { Membership } from '@core/domains/membership/entities';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit/services';
import { orgUnitNotFound } from '@core/domains/orgunit/errors';
import type { AuthorizationContext } from '../types';
import {
  OrgUnitScopeAuthorizerImpl,
  type IOrgUnitScopeAuthorizer,
  type OrgUnitScopeCheckParams,
} from '../services/OrgUnitScopeAuthorizer';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TENANT_A_ID = 'tenant-a-uuid';
const TENANT_B_ID = 'tenant-b-uuid';

const ORG_ROOT_ID = 'org-root-uuid';
const ORG_CLUSTER_ID = 'org-cluster-uuid';
const ORG_RW_ID = 'org-rw-uuid';
const ORG_RT_ID = 'org-rt-uuid';
const ORG_SIBLING_ID = 'org-sibling-uuid';

/**
 * Create a mock membership for testing.
 */
function createMockMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: 'membership-uuid',
    userId: 'user-uuid',
    tenantId: TENANT_A_ID,
    orgUnitId: ORG_RW_ID,
    role: MembershipRole.ORG_ADMIN,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock authorization context for testing.
 */
function createMockAuthContext(
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  const membership = createMockMembership(overrides.membership ? undefined : {
    role: overrides.role ?? MembershipRole.ORG_ADMIN,
    orgUnitId: overrides.orgUnitId ?? ORG_RW_ID,
    tenantId: overrides.tenantId ?? TENANT_A_ID,
  });

  return {
    userId: 'user-uuid',
    tenantId: TENANT_A_ID,
    membershipId: 'membership-uuid',
    orgUnitId: ORG_RW_ID,
    role: MembershipRole.ORG_ADMIN,
    permissions: new Set(['resident:read', 'finance:read']),
    tokenVersion: 1,
    isAuthoritative: true,
    isTenantLevel: false,
    membership,
    ...overrides,
  };
}

/**
 * Create mock OrgUnitHierarchyReader.
 */
function createMockHierarchyReader(): IOrgUnitHierarchyReader {
  return {
    isDescendantOrEqual: vi.fn(),
    isDescendantOf: vi.fn(),
    isRoot: vi.fn(),
    getOrgUnitPath: vi.fn(),
    getOrgUnitDepth: vi.fn(),
    getOrgUnit: vi.fn(),
    validatePathDepthInvariant: vi.fn(),
    validateRootInvariant: vi.fn(),
    validateOrgUnitInvariants: vi.fn(),
    getAncestors: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('OrgUnitScopeAuthorizer', () => {
  let authorizer: IOrgUnitScopeAuthorizer;
  let mockHierarchyReader: ReturnType<typeof createMockHierarchyReader>;

  beforeEach(() => {
    mockHierarchyReader = createMockHierarchyReader();
    authorizer = OrgUnitScopeAuthorizerImpl({
      orgUnitHierarchyReader: mockHierarchyReader,
    });
  });

  // =========================================================================
  // hasTenantLevelScope Tests (POLICY decision)
  // =========================================================================

  describe('hasTenantLevelScope', () => {
    it('should return true for PLATFORM_ADMIN with null orgUnitId', () => {
      expect(authorizer.hasTenantLevelScope(MembershipRole.PLATFORM_ADMIN, null)).toBe(true);
    });

    it('should return true for TENANT_OWNER with null orgUnitId', () => {
      expect(authorizer.hasTenantLevelScope(MembershipRole.TENANT_OWNER, null)).toBe(true);
    });

    it('should return false for PLATFORM_ADMIN with non-null orgUnitId', () => {
      expect(authorizer.hasTenantLevelScope(MembershipRole.PLATFORM_ADMIN, ORG_RW_ID)).toBe(false);
    });

    it('should return false for TENANT_OWNER with non-null orgUnitId', () => {
      expect(authorizer.hasTenantLevelScope(MembershipRole.TENANT_OWNER, ORG_RW_ID)).toBe(false);
    });

    it('should return false for ORG_ADMIN with null orgUnitId', () => {
      expect(authorizer.hasTenantLevelScope(MembershipRole.ORG_ADMIN, null)).toBe(false);
    });

    it('should return false for RT_ADMIN with null orgUnitId', () => {
      expect(authorizer.hasTenantLevelScope(MembershipRole.RT_ADMIN, null)).toBe(false);
    });

    it('should return false for SECURITY role', () => {
      expect(authorizer.hasTenantLevelScope(MembershipRole.SECURITY, null)).toBe(false);
      expect(authorizer.hasTenantLevelScope(MembershipRole.SECURITY, ORG_RW_ID)).toBe(false);
    });

    it('should return false for RESIDENT role', () => {
      expect(authorizer.hasTenantLevelScope(MembershipRole.RESIDENT, null)).toBe(false);
      expect(authorizer.hasTenantLevelScope(MembershipRole.RESIDENT, ORG_RW_ID)).toBe(false);
    });
  });

  // =========================================================================
  // Tenant Check Tests (MUST be FIRST — Security Order)
  // =========================================================================

  describe('Tenant Check (Security Order)', () => {
    it('should return AUTH_TENANT_MISMATCH when resource tenant differs', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.ORG_ADMIN,
        orgUnitId: ORG_RW_ID,
      });

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_B_ID, // Different tenant!
        resourceOrgUnitId: ORG_RT_ID,
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TENANT_MISMATCH');
      }

      // Hierarchy reader should NOT be called — tenant check is first
      expect(mockHierarchyReader.isDescendantOrEqual).not.toHaveBeenCalled();
    });

    it('should prioritize AUTH_TENANT_MISMATCH over AUTH_OUT_OF_SCOPE', async () => {
      // Even if OrgUnit is out of scope, tenant mismatch should come first
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.RT_ADMIN,
        orgUnitId: ORG_RT_ID,
      });

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_B_ID, // Wrong tenant
        resourceOrgUnitId: ORG_SIBLING_ID, // Also out of scope
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should be tenant mismatch, NOT out of scope
        expect(result.error.code).toBe('AUTH_TENANT_MISMATCH');
      }
    });

    it('should not call hierarchy reader when tenant mismatches', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.PLATFORM_ADMIN,
        orgUnitId: null,
      });

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_B_ID,
        resourceOrgUnitId: ORG_RT_ID,
      };

      await authorizer.checkScope(params);

      // Even PLATFORM_ADMIN should fail on tenant mismatch without hierarchy check
      expect(mockHierarchyReader.isDescendantOrEqual).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Tenant-Level Admin Tests (POLICY Decision)
  // =========================================================================

  describe('Tenant-Level Admins (Full Tenant Scope)', () => {
    it('should allow PLATFORM_ADMIN full tenant scope', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.PLATFORM_ADMIN,
        orgUnitId: null, // Tenant-level
        isTenantLevel: true,
      });

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RT_ID, // Any OrgUnit
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(true);
      // Hierarchy reader should NOT be called for tenant-level admins
      expect(mockHierarchyReader.isDescendantOrEqual).not.toHaveBeenCalled();
    });

    it('should allow TENANT_OWNER full tenant scope', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.TENANT_OWNER,
        orgUnitId: null, // Tenant-level
        isTenantLevel: true,
      });

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_CLUSTER_ID, // Any OrgUnit
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(true);
      expect(mockHierarchyReader.isDescendantOrEqual).not.toHaveBeenCalled();
    });

    it('should return TENANT_LEVEL_ADMIN reason for audit', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.TENANT_OWNER,
        orgUnitId: null,
        isTenantLevel: true,
      });

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_ROOT_ID,
      };

      const result = await authorizer.checkScopeWithReason(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.reason).toBe('TENANT_LEVEL_ADMIN');
      }
    });

    it('should check hierarchy for TENANT_OWNER with non-null orgUnitId', async () => {
      // Edge case: TENANT_OWNER scoped to specific OrgUnit (unusual but valid)
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.TENANT_OWNER,
        orgUnitId: ORG_CLUSTER_ID, // Scoped to cluster
        isTenantLevel: false,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(true));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RW_ID,
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(true);
      expect(mockHierarchyReader.isDescendantOrEqual).toHaveBeenCalledWith(
        ORG_RW_ID,
        ORG_CLUSTER_ID,
        TENANT_A_ID,
      );
    });
  });

  // =========================================================================
  // Org-Scoped Role Tests
  // =========================================================================

  describe('Org-Scoped Roles (Hierarchy Check)', () => {
    it('should allow access when resource is at same OrgUnit', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.RT_ADMIN,
        orgUnitId: ORG_RT_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(true));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RT_ID, // Same as membership
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(true);
    });

    it('should allow access when resource is descendant of membership OrgUnit', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.ORG_ADMIN,
        orgUnitId: ORG_CLUSTER_ID, // Higher in hierarchy
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(true));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RT_ID, // Descendant
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(true);
      expect(mockHierarchyReader.isDescendantOrEqual).toHaveBeenCalledWith(
        ORG_RT_ID,       // Resource OrgUnit
        ORG_CLUSTER_ID,  // Membership scope
        TENANT_A_ID,     // Tenant
      );
    });

    it('should deny access when resource is outside membership scope', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.RT_ADMIN,
        orgUnitId: ORG_RT_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(false));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_SIBLING_ID, // Sibling OrgUnit
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_OUT_OF_SCOPE');
      }
    });

    it('should deny access when resource is parent of membership scope', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.RT_ADMIN,
        orgUnitId: ORG_RT_ID, // Lower in hierarchy
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(false));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_CLUSTER_ID, // Parent (can't access up)
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_OUT_OF_SCOPE');
      }
    });

    it('should return SAME_ORGUNIT reason when resource equals membership', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.ORG_ADMIN,
        orgUnitId: ORG_RW_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(true));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RW_ID, // Same
      };

      const result = await authorizer.checkScopeWithReason(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.reason).toBe('SAME_ORGUNIT');
      }
    });

    it('should return DESCENDANT_ORGUNIT reason when resource is descendant', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.ORG_ADMIN,
        orgUnitId: ORG_RW_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(true));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RT_ID, // Different, so descendant
      };

      const result = await authorizer.checkScopeWithReason(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.reason).toBe('DESCENDANT_ORGUNIT');
      }
    });

    it('should return OUT_OF_SCOPE reason when denied', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.RESIDENT,
        orgUnitId: ORG_RT_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(false));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_SIBLING_ID,
      };

      const result = await authorizer.checkScopeWithReason(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.reason).toBe('OUT_OF_SCOPE');
      }
    });
  });

  // =========================================================================
  // Error Handling Tests (Fail Closed — INV-AUTH-002)
  // =========================================================================

  describe('Error Handling (Fail Closed)', () => {
    it('should fail closed when hierarchy reader returns error', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.ORG_ADMIN,
        orgUnitId: ORG_RW_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(
        fail(orgUnitNotFound(ORG_RT_ID)),
      );

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RT_ID,
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_FOUND');
      }
    });

    it('should fail closed when org-scoped role has null orgUnitId', async () => {
      // This should not happen in production, but we need to handle it
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.ORG_ADMIN, // Org-scoped role
        orgUnitId: null, // Invalid! Org-scoped roles need orgUnitId
      });

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RT_ID,
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_SCOPE_CHECK_FAILED');
      }
    });

    it('should fail closed when unexpected exception occurs', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.ORG_ADMIN,
        orgUnitId: ORG_RW_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockRejectedValue(
        new Error('Unexpected database error'),
      );

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RT_ID,
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_SCOPE_CHECK_FAILED');
        expect(result.error.type).toBe('unexpected');
      }
    });
  });

  // =========================================================================
  // Role-Specific Tests
  // =========================================================================

  describe('Role-Specific Behavior', () => {
    it('should check hierarchy for SECURITY role', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.SECURITY,
        orgUnitId: ORG_RW_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(true));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RT_ID,
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(true);
      expect(mockHierarchyReader.isDescendantOrEqual).toHaveBeenCalled();
    });

    it('should check hierarchy for RESIDENT role', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.RESIDENT,
        orgUnitId: ORG_RT_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(true));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_RT_ID,
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // Security Considerations
  // =========================================================================

  describe('Security Considerations', () => {
    it('should not expose tenant IDs in user-facing error message', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
      });

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_B_ID,
        resourceOrgUnitId: ORG_RT_ID,
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.userMessage).not.toContain(TENANT_A_ID);
        expect(result.error.userMessage).not.toContain(TENANT_B_ID);
      }
    });

    it('should not expose OrgUnit IDs in user-facing error message', async () => {
      const authContext = createMockAuthContext({
        tenantId: TENANT_A_ID,
        role: MembershipRole.RT_ADMIN,
        orgUnitId: ORG_RT_ID,
      });

      vi.mocked(mockHierarchyReader.isDescendantOrEqual).mockResolvedValue(ok(false));

      const params: OrgUnitScopeCheckParams = {
        authContext,
        resourceTenantId: TENANT_A_ID,
        resourceOrgUnitId: ORG_SIBLING_ID,
      };

      const result = await authorizer.checkScope(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.userMessage).not.toContain(ORG_RT_ID);
        expect(result.error.userMessage).not.toContain(ORG_SIBLING_ID);
      }
    });
  });
});
