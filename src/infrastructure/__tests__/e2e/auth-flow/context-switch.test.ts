/**
 * Context Switch E2E Integration Tests
 *
 * Tests the complete context switching flow for multi-tenant users including:
 * - Tenant context switch for users with multiple memberships
 * - OrgUnit context switch within the same tenant
 * - AuthorizationContext updates after context switch
 * - RLS context (`app.current_tenant_id`) updates after switch
 * - Permission reflection after context switch
 *
 * @see FASE 2.12 — Integration Test Suite for Auth Flow
 * @see Requirements 13.5, 13.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok, fail } from '@core/utils';
import type { Membership } from '@core/domains/membership/entities';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { OrgUnit } from '@core/domains/orgunit';
import { OrgUnitType } from '@core/domains/orgunit';
import {
  ContextSwitchServiceImpl,
  type IContextSwitchService,
  type ContextSwitchParams,
  type ITenantNameResolver,
  type IOrgUnitNameResolver,
} from '@core/domains/context';
import type { IMembershipRepository } from '@core/domains/membership';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit';
import {
  AuthorizationContextResolverImpl,
  type IAuthorizationContextResolver,
} from '@core/domains/authorization/services/AuthorizationContextResolver';
import type { IMembershipResolutionService } from '@core/domains/membership/services';
import { getPermissionsForRole } from '@core/domains/authorization/permissions/PermissionRegistry';
import { createRlsSessionContextService, type IRlsSessionContextService } from '@infrastructure/rls/RlsSessionContext';
import type { AuthorizationContext, PartialJWTClaims, AuthorizationContextInput } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Test Fixtures — Multi-Tenant User Scenario
// ---------------------------------------------------------------------------

// Tenant identifiers
const TENANT_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// User identifiers
const MULTI_TENANT_USER_ID = 'user-multi-tenant-uuid';

// OrgUnit identifiers
const TENANT_A_ROOT_ORGUNIT_ID = 'orgunit-tenant-a-root';
const TENANT_A_CHILD_ORGUNIT_ID = 'orgunit-tenant-a-child';
const TENANT_A_SIBLING_ORGUNIT_ID = 'orgunit-tenant-a-sibling';
const TENANT_B_ROOT_ORGUNIT_ID = 'orgunit-tenant-b-root';

// Membership identifiers
const MEMBERSHIP_TENANT_A_ROOT_ID = 'membership-tenant-a-root';
const MEMBERSHIP_TENANT_A_CHILD_ID = 'membership-tenant-a-child';
const MEMBERSHIP_TENANT_B_ID = 'membership-tenant-b';
const MEMBERSHIP_TENANT_A_OWNER_ID = 'membership-tenant-a-owner';

// ---------------------------------------------------------------------------
// Test Fixture Factories
// ---------------------------------------------------------------------------

function createMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: MEMBERSHIP_TENANT_A_ROOT_ID,
    userId: MULTI_TENANT_USER_ID,
    tenantId: TENANT_A_ID,
    orgUnitId: TENANT_A_ROOT_ORGUNIT_ID,
    role: MembershipRole.RESIDENT,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createTenantLevelMembership(overrides: Partial<Membership> = {}): Membership {
  return createMembership({
    id: MEMBERSHIP_TENANT_A_OWNER_ID,
    orgUnitId: null,
    role: MembershipRole.TENANT_OWNER,
    ...overrides,
  });
}

function createOrgUnit(overrides: Partial<OrgUnit> = {}): OrgUnit {
  return {
    id: TENANT_A_ROOT_ORGUNIT_ID,
    tenantId: TENANT_A_ID,
    parentId: null,
    type: OrgUnitType.RT,
    name: 'Root OrgUnit',
    path: [TENANT_A_ROOT_ORGUNIT_ID],
    depth: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createContextSwitchParams(overrides: Partial<ContextSwitchParams> = {}): ContextSwitchParams {
  return {
    userId: MULTI_TENANT_USER_ID,
    targetTenantId: TENANT_A_ID,
    targetOrgUnitId: TENANT_A_ROOT_ORGUNIT_ID,
    ...overrides,
  };
}

function createJWTClaims(overrides: Partial<PartialJWTClaims> = {}): PartialJWTClaims {
  return {
    userId: MULTI_TENANT_USER_ID,
    activeTenantId: TENANT_A_ID,
    activeOrgUnitId: TENANT_A_ROOT_ORGUNIT_ID,
    tokenVersion: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Factory for Multi-Tenant Scenario
// ---------------------------------------------------------------------------

interface MockContextSwitchDependencies {
  membershipRepository: {
    isQuarantined: ReturnType<typeof vi.fn>;
    findActiveByUserAndTenant: ReturnType<typeof vi.fn>;
    findByUserId: ReturnType<typeof vi.fn>;
  };
  orgUnitHierarchyReader: {
    getOrgUnit: ReturnType<typeof vi.fn>;
    isDescendantOrEqual: ReturnType<typeof vi.fn>;
  };
  tenantNameResolver?: {
    resolveName: ReturnType<typeof vi.fn>;
    resolveNames: ReturnType<typeof vi.fn>;
  };
  orgUnitNameResolver?: {
    resolveName: ReturnType<typeof vi.fn>;
    resolveNames: ReturnType<typeof vi.fn>;
  };
}

function createMockContextSwitchDependencies(): MockContextSwitchDependencies {
  return {
    membershipRepository: {
      isQuarantined: vi.fn().mockResolvedValue(false),
      findActiveByUserAndTenant: vi.fn().mockResolvedValue([]),
      findByUserId: vi.fn().mockResolvedValue([]),
    },
    orgUnitHierarchyReader: {
      getOrgUnit: vi.fn().mockResolvedValue(ok(createOrgUnit())),
      isDescendantOrEqual: vi.fn().mockResolvedValue(ok(true)),
    },
    tenantNameResolver: {
      resolveName: vi.fn().mockResolvedValue(null),
      resolveNames: vi.fn().mockResolvedValue(new Map()),
    },
    orgUnitNameResolver: {
      resolveName: vi.fn().mockResolvedValue(null),
      resolveNames: vi.fn().mockResolvedValue(new Map()),
    },
  };
}

function createContextSwitchService(
  mocks: MockContextSwitchDependencies,
  options: {
    withTenantNameResolver?: boolean;
    withOrgUnitNameResolver?: boolean;
  } = {},
): IContextSwitchService {
  return ContextSwitchServiceImpl({
    membershipRepository: mocks.membershipRepository as unknown as IMembershipRepository,
    orgUnitHierarchyReader: mocks.orgUnitHierarchyReader as unknown as IOrgUnitHierarchyReader,
    tenantNameResolver: options.withTenantNameResolver
      ? (mocks.tenantNameResolver as unknown as ITenantNameResolver)
      : undefined,
    orgUnitNameResolver: options.withOrgUnitNameResolver
      ? (mocks.orgUnitNameResolver as unknown as IOrgUnitNameResolver)
      : undefined,
  });
}

// Mock dependencies for AuthorizationContextResolver
function createMockMembershipResolutionService(
  membership: Membership,
  membershipCount: number = 1,
): IMembershipResolutionService {
  return {
    resolve: vi.fn().mockResolvedValue(ok({
      membership,
      isAuthoritative: membership.status === MembershipStatus.ACTIVE,
      membershipCountInTenant: membershipCount,
      isTenantLevel: membership.orgUnitId === null,
    })),
    validateKey: vi.fn().mockReturnValue(ok(undefined)),
    isUserQuarantined: vi.fn().mockResolvedValue(false),
    hasResolvableMembership: vi.fn().mockResolvedValue(true),
    validateScopeInvariant: vi.fn().mockReturnValue(ok(undefined)),
  };
}

// ---------------------------------------------------------------------------
// Test Suites — Context Switch E2E Tests
// ---------------------------------------------------------------------------

describe('Context Switch E2E Integration Tests', () => {
  /**
   * @see Requirements 13.5, 13.6
   */
  describe('Multi-Tenant User — Tenant Context Switch', () => {
    let contextSwitchService: IContextSwitchService;
    let mocks: MockContextSwitchDependencies;
    let rlsContextService: IRlsSessionContextService;

    /**
     * Scenario: User has memberships in Tenant A (RESIDENT) and Tenant B (RT_ADMIN)
     */
    const tenantAMembership = createMembership({
      id: MEMBERSHIP_TENANT_A_ROOT_ID,
      tenantId: TENANT_A_ID,
      orgUnitId: TENANT_A_ROOT_ORGUNIT_ID,
      role: MembershipRole.RESIDENT,
    });

    const tenantBMembership = createMembership({
      id: MEMBERSHIP_TENANT_B_ID,
      tenantId: TENANT_B_ID,
      orgUnitId: TENANT_B_ROOT_ORGUNIT_ID,
      role: MembershipRole.RT_ADMIN,
    });

    beforeEach(() => {
      mocks = createMockContextSwitchDependencies();
      rlsContextService = createRlsSessionContextService();

      // Setup: User has memberships in both tenants
      mocks.membershipRepository.findByUserId.mockResolvedValue([
        tenantAMembership,
        tenantBMembership,
      ]);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should allow multi-tenant user to switch from Tenant A to Tenant B', async () => {
      // Setup: User currently in Tenant A, switching to Tenant B
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        tenantBMembership,
      ]);
      mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        userId: MULTI_TENANT_USER_ID,
        targetTenantId: TENANT_B_ID,
        targetOrgUnitId: TENANT_B_ROOT_ORGUNIT_ID,
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newContext.tenantId).toBe(TENANT_B_ID);
        expect(result.data.newContext.orgUnitId).toBe(TENANT_B_ROOT_ORGUNIT_ID);
        expect(result.data.newContext.role).toBe(MembershipRole.RT_ADMIN);
        expect(result.data.membershipId).toBe(MEMBERSHIP_TENANT_B_ID);
      }
    });

    it('should update AuthorizationContext correctly after tenant switch', async () => {
      // Setup: User switches to Tenant B
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        tenantBMembership,
      ]);
      mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

      contextSwitchService = createContextSwitchService(mocks);

      // Perform context switch
      const switchResult = await contextSwitchService.switchContext(
        createContextSwitchParams({
          targetTenantId: TENANT_B_ID,
          targetOrgUnitId: TENANT_B_ROOT_ORGUNIT_ID,
        }),
      );

      expect(switchResult.success).toBe(true);
      if (!switchResult.success) return;

      // Simulate AuthorizationContext resolution with new context
      const membershipResolutionService = createMockMembershipResolutionService(tenantBMembership);
      const authResolver = AuthorizationContextResolverImpl({
        membershipResolutionService,
      });

      const newClaims = createJWTClaims({
        activeTenantId: TENANT_B_ID,
        activeOrgUnitId: TENANT_B_ROOT_ORGUNIT_ID,
      });

      const authInput: AuthorizationContextInput = {
        jwtClaims: newClaims,
        currentTokenVersion: 1,
      };

      const authResult = await authResolver.resolve(authInput);

      expect(authResult.success).toBe(true);
      if (authResult.success) {
        const ctx = authResult.data.context;
        expect(ctx.tenantId).toBe(TENANT_B_ID);
        expect(ctx.orgUnitId).toBe(TENANT_B_ROOT_ORGUNIT_ID);
        expect(ctx.role).toBe(MembershipRole.RT_ADMIN);
        expect(ctx.membershipId).toBe(MEMBERSHIP_TENANT_B_ID);

        // Verify permissions reflect new role
        const expectedPermissions = getPermissionsForRole(MembershipRole.RT_ADMIN);
        expect(ctx.permissions).toEqual(expectedPermissions);
      }
    });

    it('should generate correct RLS context SQL after tenant switch', async () => {
      // Perform context switch to Tenant B
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        tenantBMembership,
      ]);
      contextSwitchService = createContextSwitchService(mocks);

      const switchResult = await contextSwitchService.switchContext(
        createContextSwitchParams({
          targetTenantId: TENANT_B_ID,
          targetOrgUnitId: TENANT_B_ROOT_ORGUNIT_ID,
        }),
      );

      expect(switchResult.success).toBe(true);
      if (!switchResult.success) return;

      // Verify RLS context SQL is generated correctly for new tenant
      const newTenantId = switchResult.data.newContext.tenantId;
      const setContextSql = rlsContextService.getSetContextSql(newTenantId);

      expect(setContextSql).toBe(`SET LOCAL "app.current_tenant_id" = '${TENANT_B_ID}';`);
    });

    it('should reject tenant switch when user has no membership in target tenant', async () => {
      // User tries to switch to a tenant where they have no membership
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);

      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        targetTenantId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', // Non-existent membership
        targetOrgUnitId: 'some-orgunit',
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_NO_MEMBERSHIP');
      }
    });

    it('should list all available tenant contexts for multi-tenant user', async () => {
      contextSwitchService = createContextSwitchService(mocks, {
        withTenantNameResolver: true,
      });

      // Setup tenant names
      mocks.tenantNameResolver!.resolveNames.mockResolvedValue(
        new Map([
          [TENANT_A_ID, 'Tenant Alpha'],
          [TENANT_B_ID, 'Tenant Beta'],
        ]),
      );

      const result = await contextSwitchService.getAvailableContexts(MULTI_TENANT_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenants).toHaveLength(2);
        expect(result.data.totalMemberships).toBe(2);

        const tenantA = result.data.tenants.find(t => t.tenantId === TENANT_A_ID);
        const tenantB = result.data.tenants.find(t => t.tenantId === TENANT_B_ID);

        expect(tenantA).toBeDefined();
        expect(tenantB).toBeDefined();
        expect(tenantA?.tenantName).toBe('Tenant Alpha');
        expect(tenantB?.tenantName).toBe('Tenant Beta');
      }
    });
  });

  describe('OrgUnit Context Switch Within Same Tenant', () => {
    let contextSwitchService: IContextSwitchService;
    let mocks: MockContextSwitchDependencies;

    // Memberships at different OrgUnit levels in Tenant A
    const rootOrgUnitMembership = createMembership({
      id: MEMBERSHIP_TENANT_A_ROOT_ID,
      tenantId: TENANT_A_ID,
      orgUnitId: TENANT_A_ROOT_ORGUNIT_ID,
      role: MembershipRole.ORG_ADMIN,
    });

    const childOrgUnitMembership = createMembership({
      id: MEMBERSHIP_TENANT_A_CHILD_ID,
      tenantId: TENANT_A_ID,
      orgUnitId: TENANT_A_CHILD_ORGUNIT_ID,
      role: MembershipRole.RT_ADMIN,
    });

    const tenantOwnerMembership = createTenantLevelMembership({
      tenantId: TENANT_A_ID,
    });

    const rootOrgUnit = createOrgUnit({
      id: TENANT_A_ROOT_ORGUNIT_ID,
      tenantId: TENANT_A_ID,
      parentId: null,
      path: [TENANT_A_ROOT_ORGUNIT_ID],
      depth: 0,
    });

    const childOrgUnit = createOrgUnit({
      id: TENANT_A_CHILD_ORGUNIT_ID,
      tenantId: TENANT_A_ID,
      parentId: TENANT_A_ROOT_ORGUNIT_ID,
      path: [TENANT_A_ROOT_ORGUNIT_ID, TENANT_A_CHILD_ORGUNIT_ID],
      depth: 1,
    });

    const siblingOrgUnit = createOrgUnit({
      id: TENANT_A_SIBLING_ORGUNIT_ID,
      tenantId: TENANT_A_ID,
      parentId: TENANT_A_ROOT_ORGUNIT_ID,
      path: [TENANT_A_ROOT_ORGUNIT_ID, TENANT_A_SIBLING_ORGUNIT_ID],
      depth: 1,
    });

    beforeEach(() => {
      mocks = createMockContextSwitchDependencies();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should allow OrgUnit switch to child OrgUnit within membership scope', async () => {
      // User has ORG_ADMIN at root, can switch to child
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        rootOrgUnitMembership,
      ]);
      mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        userId: MULTI_TENANT_USER_ID,
        targetTenantId: TENANT_A_ID,
        targetOrgUnitId: TENANT_A_CHILD_ORGUNIT_ID,
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newContext.tenantId).toBe(TENANT_A_ID);
        expect(result.data.newContext.orgUnitId).toBe(TENANT_A_CHILD_ORGUNIT_ID);
        expect(result.data.newContext.role).toBe(MembershipRole.ORG_ADMIN);
      }
    });

    it('should use exact membership match when user has membership at target OrgUnit', async () => {
      // User has multiple memberships: ORG_ADMIN at root, RT_ADMIN at child
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        rootOrgUnitMembership,
        childOrgUnitMembership,
      ]);

      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        targetOrgUnitId: TENANT_A_CHILD_ORGUNIT_ID,
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should use the exact match (RT_ADMIN at child), not the broader scope
        expect(result.data.membershipId).toBe(MEMBERSHIP_TENANT_A_CHILD_ID);
        expect(result.data.newContext.role).toBe(MembershipRole.RT_ADMIN);
        expect(result.data.newContext.orgUnitId).toBe(TENANT_A_CHILD_ORGUNIT_ID);
      }
    });

    it('should allow tenant-level admin to switch to any OrgUnit in tenant', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        tenantOwnerMembership,
      ]);
      mocks.orgUnitHierarchyReader.getOrgUnit.mockResolvedValue(ok(siblingOrgUnit));

      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        targetOrgUnitId: TENANT_A_SIBLING_ORGUNIT_ID,
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membershipId).toBe(MEMBERSHIP_TENANT_A_OWNER_ID);
        expect(result.data.newContext.orgUnitId).toBe(TENANT_A_SIBLING_ORGUNIT_ID);
        expect(result.data.newContext.role).toBe(MembershipRole.TENANT_OWNER);
      }
    });

    it('should reject OrgUnit switch outside membership scope', async () => {
      // User only has membership at root, tries to switch to sibling (out of scope)
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        childOrgUnitMembership, // Only has child membership, not root
      ]);
      mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(false));

      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        targetOrgUnitId: TENANT_A_SIBLING_ORGUNIT_ID, // sibling of child, not a descendant
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_OUT_OF_SCOPE');
      }
    });

    it('should update permissions correctly after OrgUnit switch', async () => {
      // Switch from RT_ADMIN at child to using ORG_ADMIN at root scope
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        rootOrgUnitMembership,
        childOrgUnitMembership,
      ]);
      mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

      contextSwitchService = createContextSwitchService(mocks);

      // Switch to sibling using root membership scope
      const params = createContextSwitchParams({
        targetOrgUnitId: TENANT_A_SIBLING_ORGUNIT_ID,
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Verify permissions match the ORG_ADMIN role (from root membership)
      const membershipResolutionService = createMockMembershipResolutionService(rootOrgUnitMembership);
      const authResolver = AuthorizationContextResolverImpl({
        membershipResolutionService,
      });

      const authInput: AuthorizationContextInput = {
        jwtClaims: createJWTClaims({
          activeOrgUnitId: TENANT_A_SIBLING_ORGUNIT_ID,
        }),
        currentTokenVersion: 1,
      };

      const authResult = await authResolver.resolve(authInput);

      expect(authResult.success).toBe(true);
      if (authResult.success) {
        const ctx = authResult.data.context;
        // Permissions should reflect ORG_ADMIN role
        const expectedPermissions = getPermissionsForRole(MembershipRole.ORG_ADMIN);
        expect(ctx.permissions).toEqual(expectedPermissions);
      }
    });

    it('should allow switch from OrgUnit scope to tenant-level (null OrgUnit)', async () => {
      // Tenant owner can switch to null OrgUnit
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        tenantOwnerMembership,
        rootOrgUnitMembership,
      ]);

      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        targetOrgUnitId: null, // Tenant-level
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newContext.orgUnitId).toBeNull();
        expect(result.data.newContext.role).toBe(MembershipRole.TENANT_OWNER);
        expect(result.data.membershipId).toBe(MEMBERSHIP_TENANT_A_OWNER_ID);
      }
    });

    it('should reject non-admin role from using null OrgUnit', async () => {
      // RESIDENT cannot switch to tenant-level
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership({ role: MembershipRole.RESIDENT }),
      ]);

      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        targetOrgUnitId: null,
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_INVALID_SCOPE');
      }
    });
  });

  describe('RLS Context Updates After Context Switch', () => {
    let contextSwitchService: IContextSwitchService;
    let mocks: MockContextSwitchDependencies;
    let rlsContextService: IRlsSessionContextService;

    const tenantAMembership = createMembership({
      id: MEMBERSHIP_TENANT_A_ROOT_ID,
      tenantId: TENANT_A_ID,
    });

    const tenantBMembership = createMembership({
      id: MEMBERSHIP_TENANT_B_ID,
      tenantId: TENANT_B_ID,
      orgUnitId: TENANT_B_ROOT_ORGUNIT_ID,
      role: MembershipRole.RT_ADMIN,
    });

    beforeEach(() => {
      mocks = createMockContextSwitchDependencies();
      rlsContextService = createRlsSessionContextService();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should validate RLS tenant ID format before setting context', () => {
      // Valid UUID should pass
      expect(rlsContextService.validateTenantId(TENANT_A_ID)).toBe(true);
      expect(rlsContextService.validateTenantId(TENANT_B_ID)).toBe(true);

      // Invalid UUIDs should fail
      expect(rlsContextService.validateTenantId('invalid-uuid')).toBe(false);
      expect(rlsContextService.validateTenantId('')).toBe(false);
    });

    it('should generate correct SET LOCAL SQL for tenant context', () => {
      const setSql = rlsContextService.getSetContextSql(TENANT_A_ID);
      expect(setSql).toBe(`SET LOCAL "app.current_tenant_id" = '${TENANT_A_ID}';`);
    });

    it('should generate correct RESET SQL for clearing context', () => {
      const clearSql = rlsContextService.getClearContextSql();
      expect(clearSql).toBe(`RESET "app.current_tenant_id";`);
    });

    it('should properly wrap query with RLS context', () => {
      const querySql = 'SELECT * FROM residents WHERE id = $1';
      const wrappedSql = rlsContextService.wrapQueryWithContext(TENANT_A_ID, querySql);

      expect(wrappedSql).toContain('BEGIN;');
      expect(wrappedSql).toContain(`SET LOCAL "app.current_tenant_id" = '${TENANT_A_ID}'`);
      expect(wrappedSql).toContain(querySql);
      expect(wrappedSql).toContain('COMMIT;');
    });

    it('should throw error for invalid tenant ID in RLS context', () => {
      expect(() => rlsContextService.getSetContextSql('invalid')).toThrow();
      expect(() => rlsContextService.wrapQueryWithContext('invalid', 'SELECT 1')).toThrow();
    });

    it('should update RLS context when switching tenants in context switch flow', async () => {
      // Initial context: Tenant A
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        tenantBMembership,
      ]);
      contextSwitchService = createContextSwitchService(mocks);

      // Perform switch to Tenant B
      const switchResult = await contextSwitchService.switchContext(
        createContextSwitchParams({
          targetTenantId: TENANT_B_ID,
          targetOrgUnitId: TENANT_B_ROOT_ORGUNIT_ID,
        }),
      );

      expect(switchResult.success).toBe(true);

      if (switchResult.success) {
        // After switch, RLS context should use new tenant ID
        const newTenantId = switchResult.data.newContext.tenantId;
        const setContextSql = rlsContextService.getSetContextSql(newTenantId);

        expect(newTenantId).toBe(TENANT_B_ID);
        expect(setContextSql).toContain(TENANT_B_ID);
        expect(setContextSql).not.toContain(TENANT_A_ID);
      }
    });

    it('should return correct session variable name', () => {
      expect(rlsContextService.getSessionVariableName()).toBe('app.current_tenant_id');
    });
  });

  describe('Context Switch with Quarantined User', () => {
    let contextSwitchService: IContextSwitchService;
    let mocks: MockContextSwitchDependencies;

    beforeEach(() => {
      mocks = createMockContextSwitchDependencies();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should reject context switch for quarantined user', async () => {
      mocks.membershipRepository.isQuarantined.mockResolvedValue(true);
      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams();
      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_USER_QUARANTINED');
      }
    });

    it('should reject available contexts query for quarantined user', async () => {
      mocks.membershipRepository.isQuarantined.mockResolvedValue(true);
      contextSwitchService = createContextSwitchService(mocks);

      const result = await contextSwitchService.getAvailableContexts(MULTI_TENANT_USER_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_USER_QUARANTINED');
      }
    });

    it('should check quarantine before membership lookup', async () => {
      mocks.membershipRepository.isQuarantined.mockResolvedValue(true);
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership(),
      ]);
      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams();
      await contextSwitchService.switchContext(params);

      // Membership lookup should NOT be called if user is quarantined
      expect(mocks.membershipRepository.isQuarantined).toHaveBeenCalledWith(MULTI_TENANT_USER_ID);
      expect(mocks.membershipRepository.findActiveByUserAndTenant).not.toHaveBeenCalled();
    });
  });

  describe('Context Switch with Suspended Membership', () => {
    let contextSwitchService: IContextSwitchService;
    let mocks: MockContextSwitchDependencies;

    beforeEach(() => {
      mocks = createMockContextSwitchDependencies();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should reject context switch when membership is SUSPENDED', async () => {
      const suspendedMembership = createMembership({
        status: MembershipStatus.SUSPENDED,
      });
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        suspendedMembership,
      ]);
      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams();
      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_MEMBERSHIP_INACTIVE');
      }
    });

    it('should reject context switch when membership is REVOKED', async () => {
      const revokedMembership = createMembership({
        status: MembershipStatus.REVOKED,
      });
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        revokedMembership,
      ]);
      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams();
      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_MEMBERSHIP_INACTIVE');
      }
    });
  });

  describe('Context Switch Validation (validateSwitch)', () => {
    let contextSwitchService: IContextSwitchService;
    let mocks: MockContextSwitchDependencies;

    beforeEach(() => {
      mocks = createMockContextSwitchDependencies();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should validate switch would succeed without performing it', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership(),
      ]);
      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams();
      const result = await contextSwitchService.validateSwitch(params);

      expect(result.success).toBe(true);
    });

    it('should return error when switch validation fails', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);
      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        targetTenantId: 'nonexistent-tenant',
      });
      const result = await contextSwitchService.validateSwitch(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_NO_MEMBERSHIP');
      }
    });
  });

  describe('Available Contexts For Single Tenant', () => {
    let contextSwitchService: IContextSwitchService;
    let mocks: MockContextSwitchDependencies;

    const multiOrgMemberships = [
      createMembership({
        id: MEMBERSHIP_TENANT_A_ROOT_ID,
        orgUnitId: TENANT_A_ROOT_ORGUNIT_ID,
        role: MembershipRole.ORG_ADMIN,
      }),
      createMembership({
        id: MEMBERSHIP_TENANT_A_CHILD_ID,
        orgUnitId: TENANT_A_CHILD_ORGUNIT_ID,
        role: MembershipRole.RT_ADMIN,
      }),
    ];

    beforeEach(() => {
      mocks = createMockContextSwitchDependencies();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should list all OrgUnit contexts available within a tenant', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue(multiOrgMemberships);
      contextSwitchService = createContextSwitchService(mocks, {
        withTenantNameResolver: true,
      });
      mocks.tenantNameResolver!.resolveName.mockResolvedValue('Tenant Alpha');

      const result = await contextSwitchService.getAvailableContextsForTenant(
        MULTI_TENANT_USER_ID,
        TENANT_A_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenantId).toBe(TENANT_A_ID);
        expect(result.data.tenantName).toBe('Tenant Alpha');
        expect(result.data.memberships).toHaveLength(2);

        const rootMembership = result.data.memberships.find(
          m => m.membershipId === MEMBERSHIP_TENANT_A_ROOT_ID,
        );
        const childMembership = result.data.memberships.find(
          m => m.membershipId === MEMBERSHIP_TENANT_A_CHILD_ID,
        );

        expect(rootMembership?.role).toBe(MembershipRole.ORG_ADMIN);
        expect(childMembership?.role).toBe(MembershipRole.RT_ADMIN);
      }
    });

    it('should return error when user has no membership in requested tenant', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);
      contextSwitchService = createContextSwitchService(mocks);

      const result = await contextSwitchService.getAvailableContextsForTenant(
        MULTI_TENANT_USER_ID,
        'nonexistent-tenant-id',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_NO_MEMBERSHIP');
      }
    });
  });

  describe('Context Switch Audit Trail (for observability)', () => {
    /**
     * This test verifies that context switch results contain sufficient
     * information for audit logging per Requirements 15.2
     */
    let contextSwitchService: IContextSwitchService;
    let mocks: MockContextSwitchDependencies;

    const tenantAMembership = createMembership({
      id: MEMBERSHIP_TENANT_A_ROOT_ID,
      tenantId: TENANT_A_ID,
    });

    const tenantBMembership = createMembership({
      id: MEMBERSHIP_TENANT_B_ID,
      tenantId: TENANT_B_ID,
      orgUnitId: TENANT_B_ROOT_ORGUNIT_ID,
      role: MembershipRole.RT_ADMIN,
    });

    beforeEach(() => {
      mocks = createMockContextSwitchDependencies();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should return sufficient data for audit logging on successful switch', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        tenantBMembership,
      ]);
      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        targetTenantId: TENANT_B_ID,
        targetOrgUnitId: TENANT_B_ROOT_ORGUNIT_ID,
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(true);
      if (result.success) {
        // Verify audit-relevant fields are present
        const { newContext, membershipId } = result.data;

        // For audit logging: correlationId, userId, fromTenantId, toTenantId, fromOrgUnitId, toOrgUnitId, success
        expect(newContext.tenantId).toBeDefined();
        expect(newContext.orgUnitId).toBeDefined();
        expect(newContext.role).toBeDefined();
        expect(membershipId).toBeDefined();

        // These can be used to construct audit log entry
        expect(newContext.tenantId).toBe(TENANT_B_ID);
        expect(newContext.orgUnitId).toBe(TENANT_B_ROOT_ORGUNIT_ID);
      }
    });

    it('should return sufficient error data for audit logging on failed switch', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);
      contextSwitchService = createContextSwitchService(mocks);

      const params = createContextSwitchParams({
        targetTenantId: 'nonexistent-tenant',
      });

      const result = await contextSwitchService.switchContext(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        // For audit logging of failures
        expect(result.error.code).toBeDefined();
        expect(result.error.message).toBeDefined();
        // userMessage should be safe for logging (no internal details)
        expect(result.error.userMessage).toBeDefined();
      }
    });
  });
});
