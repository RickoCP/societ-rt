/**
 * ContextSwitchService Unit Tests
 *
 * Tests the context switch service that allows users to switch between
 * tenants and organizational units.
 *
 * @see FASE 1.8 Task 18: Context Switch Service
 * @see Requirements 4 (AC 1-8)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ok, fail } from '@core/utils';
import type { Membership, IMembershipRepository } from '@core/domains/membership';
import { MembershipRole, MembershipStatus } from '@core/domains/membership';
import type { IOrgUnitHierarchyReader, OrgUnit } from '@core/domains/orgunit';
import { OrgUnitType } from '@core/domains/orgunit';
import {
  ContextSwitchServiceImpl,
  type IContextSwitchService,
  type ContextSwitchParams,
  type ITenantNameResolver,
  type IOrgUnitNameResolver,
} from '../index';

// ---------------------------------------------------------------------------
// Test Fixtures and Factories
// ---------------------------------------------------------------------------

const TENANT_01_ID = 'tenant-01-uuid';
const TENANT_02_ID = 'tenant-02-uuid';
const USER_01_ID = 'user-01-uuid';
const USER_QUARANTINED_ID = 'user-quarantined-uuid';
const ORGUNIT_ROOT_ID = 'orgunit-root-uuid';
const ORGUNIT_CHILD_ID = 'orgunit-child-uuid';
const ORGUNIT_OTHER_ID = 'orgunit-other-uuid';
const MEMBERSHIP_01_ID = 'membership-01-uuid';
const MEMBERSHIP_02_ID = 'membership-02-uuid';
const MEMBERSHIP_TENANT_LEVEL_ID = 'membership-tenant-level-uuid';

/**
 * Create a test membership with default values.
 */
function createMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: MEMBERSHIP_01_ID,
    userId: USER_01_ID,
    tenantId: TENANT_01_ID,
    orgUnitId: ORGUNIT_ROOT_ID,
    role: MembershipRole.RESIDENT,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a tenant-level admin membership.
 */
function createTenantLevelMembership(
  overrides: Partial<Membership> = {},
): Membership {
  return createMembership({
    id: MEMBERSHIP_TENANT_LEVEL_ID,
    orgUnitId: null,
    role: MembershipRole.TENANT_OWNER,
    ...overrides,
  });
}

/**
 * Create a test OrgUnit.
 */
function createOrgUnit(overrides: Partial<OrgUnit> = {}): OrgUnit {
  return {
    id: ORGUNIT_ROOT_ID,
    tenantId: TENANT_01_ID,
    parentId: null,
    type: OrgUnitType.RT,
    name: 'Test OrgUnit',
    path: [ORGUNIT_ROOT_ID],
    depth: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create context switch params.
 */
function createParams(overrides: Partial<ContextSwitchParams> = {}): ContextSwitchParams {
  return {
    userId: USER_01_ID,
    targetTenantId: TENANT_01_ID,
    targetOrgUnitId: ORGUNIT_ROOT_ID,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Factory
// ---------------------------------------------------------------------------

interface MockDependencies {
  membershipRepository: {
    isQuarantined: Mock;
    findActiveByUserAndTenant: Mock;
    findByUserId: Mock;
  };
  orgUnitHierarchyReader: {
    getOrgUnit: Mock;
    isDescendantOrEqual: Mock;
  };
  tenantNameResolver?: {
    resolveName: Mock;
    resolveNames: Mock;
  };
  orgUnitNameResolver?: {
    resolveName: Mock;
    resolveNames: Mock;
  };
}

function createMockDependencies(): MockDependencies {
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

function createService(
  mocks: MockDependencies,
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

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('ContextSwitchService', () => {
  let mocks: MockDependencies;
  let service: IContextSwitchService;

  beforeEach(() => {
    mocks = createMockDependencies();
    service = createService(mocks);
  });

  // =========================================================================
  // switchContext Tests
  // =========================================================================

  describe('switchContext', () => {
    describe('Quarantine Check', () => {
      it('should reject quarantined users', async () => {
        mocks.membershipRepository.isQuarantined.mockResolvedValue(true);

        const result = await service.switchContext(
          createParams({ userId: USER_QUARANTINED_ID }),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONTEXT_SWITCH_USER_QUARANTINED');
        }
      });

      it('should allow non-quarantined users to proceed', async () => {
        mocks.membershipRepository.isQuarantined.mockResolvedValue(false);
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          createMembership(),
        ]);

        const result = await service.switchContext(createParams());

        expect(mocks.membershipRepository.isQuarantined).toHaveBeenCalledWith(
          USER_01_ID,
        );
        expect(result.success).toBe(true);
      });
    });

    describe('Membership Validation', () => {
      it('should reject if user has no membership in target tenant', async () => {
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);

        const result = await service.switchContext(createParams());

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONTEXT_SWITCH_NO_MEMBERSHIP');
        }
      });

      it('should accept if user has active membership in target tenant', async () => {
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          createMembership(),
        ]);

        const result = await service.switchContext(createParams());

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.newContext.tenantId).toBe(TENANT_01_ID);
          expect(result.data.membershipId).toBe(MEMBERSHIP_01_ID);
        }
      });

      it('should reject if membership status is not ACTIVE', async () => {
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          createMembership({ status: MembershipStatus.SUSPENDED }),
        ]);

        const result = await service.switchContext(createParams());

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONTEXT_SWITCH_MEMBERSHIP_INACTIVE');
        }
      });
    });

    describe('Tenant-Level Scope (null OrgUnit)', () => {
      it('should allow tenant-level admin to switch to null OrgUnit', async () => {
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          createTenantLevelMembership(),
        ]);

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: null }),
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.newContext.orgUnitId).toBe(null);
          expect(result.data.newContext.role).toBe(MembershipRole.TENANT_OWNER);
        }
      });

      it('should reject non-admin role from using null OrgUnit', async () => {
        // User only has RESIDENT role membership
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          createMembership({ role: MembershipRole.RESIDENT }),
        ]);

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: null }),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONTEXT_SWITCH_INVALID_SCOPE');
        }
      });

      it('should reject PLATFORM_ADMIN with non-null orgUnitId in their membership from null switch', async () => {
        // Edge case: PLATFORM_ADMIN with org-scoped membership (shouldn't happen per INV-MEM-002)
        // but we test defensive behavior
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          createMembership({
            role: MembershipRole.PLATFORM_ADMIN,
            orgUnitId: ORGUNIT_ROOT_ID, // Violation of INV-MEM-002
          }),
        ]);

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: null }),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONTEXT_SWITCH_INVALID_SCOPE');
        }
      });
    });

    describe('OrgUnit Scope Validation', () => {
      it('should allow switch to OrgUnit within membership scope', async () => {
        const membership = createMembership({ orgUnitId: ORGUNIT_ROOT_ID });
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          membership,
        ]);
        mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: ORGUNIT_CHILD_ID }),
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.newContext.orgUnitId).toBe(ORGUNIT_CHILD_ID);
        }
      });

      it('should reject switch to OrgUnit outside membership scope', async () => {
        const membership = createMembership({ orgUnitId: ORGUNIT_ROOT_ID });
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          membership,
        ]);
        mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(false));

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: ORGUNIT_OTHER_ID }),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONTEXT_SWITCH_OUT_OF_SCOPE');
        }
      });

      it('should reject if target OrgUnit does not exist', async () => {
        const membership = createMembership({ orgUnitId: ORGUNIT_ROOT_ID });
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          membership,
        ]);
        mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(
          fail({
            type: 'not_found',
            code: 'ORGUNIT_NOT_FOUND',
            message: 'OrgUnit not found',
          }),
        );

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: 'nonexistent-uuid' }),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONTEXT_SWITCH_ORGUNIT_NOT_FOUND');
        }
      });

      it('should allow tenant-level admin to switch to any OrgUnit in tenant', async () => {
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          createTenantLevelMembership(),
        ]);
        mocks.orgUnitHierarchyReader.getOrgUnit.mockResolvedValue(
          ok(createOrgUnit({ id: ORGUNIT_CHILD_ID })),
        );

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: ORGUNIT_CHILD_ID }),
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.newContext.orgUnitId).toBe(ORGUNIT_CHILD_ID);
          expect(result.data.newContext.role).toBe(MembershipRole.TENANT_OWNER);
        }
      });
    });

    describe('Multi-Membership Resolution', () => {
      it('should find exact match when multiple memberships exist', async () => {
        const memberships = [
          createMembership({
            id: MEMBERSHIP_01_ID,
            orgUnitId: ORGUNIT_ROOT_ID,
            role: MembershipRole.ORG_ADMIN,
          }),
          createMembership({
            id: MEMBERSHIP_02_ID,
            orgUnitId: ORGUNIT_CHILD_ID,
            role: MembershipRole.RT_ADMIN,
          }),
        ];
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue(
          memberships,
        );

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: ORGUNIT_CHILD_ID }),
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.membershipId).toBe(MEMBERSHIP_02_ID);
          expect(result.data.newContext.role).toBe(MembershipRole.RT_ADMIN);
        }
      });

      it('should use tenant-level membership if available when no exact match', async () => {
        const memberships = [
          createTenantLevelMembership({ id: MEMBERSHIP_TENANT_LEVEL_ID }),
          createMembership({
            id: MEMBERSHIP_01_ID,
            orgUnitId: ORGUNIT_ROOT_ID,
            role: MembershipRole.ORG_ADMIN,
          }),
        ];
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue(
          memberships,
        );
        mocks.orgUnitHierarchyReader.getOrgUnit.mockResolvedValue(
          ok(createOrgUnit({ id: ORGUNIT_OTHER_ID })),
        );

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: ORGUNIT_OTHER_ID }),
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.membershipId).toBe(MEMBERSHIP_TENANT_LEVEL_ID);
        }
      });

      it('should reject ambiguous membership when no scope matches', async () => {
        const memberships = [
          createMembership({
            id: MEMBERSHIP_01_ID,
            orgUnitId: ORGUNIT_ROOT_ID,
            role: MembershipRole.ORG_ADMIN,
          }),
          createMembership({
            id: MEMBERSHIP_02_ID,
            orgUnitId: ORGUNIT_CHILD_ID,
            role: MembershipRole.RT_ADMIN,
          }),
        ];
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue(
          memberships,
        );
        // Neither membership scope includes the target
        mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(false));

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: ORGUNIT_OTHER_ID }),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONTEXT_SWITCH_AMBIGUOUS_MEMBERSHIP');
        }
      });
    });

    describe('Success Response', () => {
      it('should return correct context on successful switch', async () => {
        const membership = createMembership({
          role: MembershipRole.RT_ADMIN,
          orgUnitId: ORGUNIT_ROOT_ID,
        });
        mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
          membership,
        ]);
        mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

        const result = await service.switchContext(
          createParams({ targetOrgUnitId: ORGUNIT_CHILD_ID }),
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.newContext).toEqual({
            tenantId: TENANT_01_ID,
            orgUnitId: ORGUNIT_CHILD_ID,
            role: MembershipRole.RT_ADMIN,
          });
          expect(result.data.membershipId).toBe(MEMBERSHIP_01_ID);
        }
      });
    });
  });

  // =========================================================================
  // validateSwitch Tests
  // =========================================================================

  describe('validateSwitch', () => {
    it('should return success when switch would be valid', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership(),
      ]);

      const result = await service.validateSwitch(createParams());

      expect(result.success).toBe(true);
    });

    it('should return error when switch would be invalid', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);

      const result = await service.validateSwitch(createParams());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_NO_MEMBERSHIP');
      }
    });
  });

  // =========================================================================
  // getAvailableContexts Tests
  // =========================================================================

  describe('getAvailableContexts', () => {
    it('should reject quarantined users', async () => {
      mocks.membershipRepository.isQuarantined.mockResolvedValue(true);

      const result = await service.getAvailableContexts(USER_QUARANTINED_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_USER_QUARANTINED');
      }
    });

    it('should return empty tenants array if user has no memberships', async () => {
      mocks.membershipRepository.findByUserId.mockResolvedValue([]);

      const result = await service.getAvailableContexts(USER_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenants).toHaveLength(0);
        expect(result.data.totalMemberships).toBe(0);
      }
    });

    it('should group memberships by tenant', async () => {
      const memberships = [
        createMembership({ tenantId: TENANT_01_ID }),
        createMembership({
          id: MEMBERSHIP_02_ID,
          tenantId: TENANT_02_ID,
        }),
      ];
      mocks.membershipRepository.findByUserId.mockResolvedValue(memberships);

      const result = await service.getAvailableContexts(USER_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenants).toHaveLength(2);
        expect(result.data.totalMemberships).toBe(2);

        const tenant01 = result.data.tenants.find(
          (t) => t.tenantId === TENANT_01_ID,
        );
        const tenant02 = result.data.tenants.find(
          (t) => t.tenantId === TENANT_02_ID,
        );

        expect(tenant01?.memberships).toHaveLength(1);
        expect(tenant02?.memberships).toHaveLength(1);
      }
    });

    it('should include multiple memberships for same tenant', async () => {
      const memberships = [
        createMembership({
          id: MEMBERSHIP_01_ID,
          orgUnitId: ORGUNIT_ROOT_ID,
          role: MembershipRole.ORG_ADMIN,
        }),
        createMembership({
          id: MEMBERSHIP_02_ID,
          orgUnitId: ORGUNIT_CHILD_ID,
          role: MembershipRole.RT_ADMIN,
        }),
      ];
      mocks.membershipRepository.findByUserId.mockResolvedValue(memberships);

      const result = await service.getAvailableContexts(USER_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenants).toHaveLength(1);
        const firstTenant = result.data.tenants[0];
        expect(firstTenant).toBeDefined();
        expect(firstTenant?.memberships).toHaveLength(2);
      }
    });

    it('should resolve tenant names when resolver is available', async () => {
      service = createService(mocks, { withTenantNameResolver: true });
      mocks.membershipRepository.findByUserId.mockResolvedValue([
        createMembership(),
      ]);
      mocks.tenantNameResolver!.resolveNames.mockResolvedValue(
        new Map([[TENANT_01_ID, 'Tenant One Name']]),
      );

      const result = await service.getAvailableContexts(USER_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        const firstTenant = result.data.tenants[0];
        expect(firstTenant).toBeDefined();
        expect(firstTenant?.tenantName).toBe('Tenant One Name');
      }
    });

    it('should use tenantId as fallback when name resolver is not available', async () => {
      mocks.membershipRepository.findByUserId.mockResolvedValue([
        createMembership(),
      ]);

      const result = await service.getAvailableContexts(USER_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        const firstTenant = result.data.tenants[0];
        expect(firstTenant).toBeDefined();
        expect(firstTenant?.tenantName).toBe(TENANT_01_ID);
      }
    });
  });

  // =========================================================================
  // getAvailableContextsForTenant Tests
  // =========================================================================

  describe('getAvailableContextsForTenant', () => {
    it('should reject quarantined users', async () => {
      mocks.membershipRepository.isQuarantined.mockResolvedValue(true);

      const result = await service.getAvailableContextsForTenant(
        USER_QUARANTINED_ID,
        TENANT_01_ID,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_USER_QUARANTINED');
      }
    });

    it('should return error if user has no membership in tenant', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);

      const result = await service.getAvailableContextsForTenant(
        USER_01_ID,
        TENANT_01_ID,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_NO_MEMBERSHIP');
      }
    });

    it('should return tenant context with memberships', async () => {
      const memberships = [
        createMembership({
          id: MEMBERSHIP_01_ID,
          role: MembershipRole.ORG_ADMIN,
          orgUnitId: ORGUNIT_ROOT_ID,
        }),
        createMembership({
          id: MEMBERSHIP_02_ID,
          role: MembershipRole.RT_ADMIN,
          orgUnitId: ORGUNIT_CHILD_ID,
        }),
      ];
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue(
        memberships,
      );

      const result = await service.getAvailableContextsForTenant(
        USER_01_ID,
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenantId).toBe(TENANT_01_ID);
        expect(result.data.memberships).toHaveLength(2);
      }
    });

    it('should resolve tenant name when resolver is available', async () => {
      service = createService(mocks, { withTenantNameResolver: true });
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership(),
      ]);
      mocks.tenantNameResolver!.resolveName.mockResolvedValue('Tenant One Name');

      const result = await service.getAvailableContextsForTenant(
        USER_01_ID,
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenantName).toBe('Tenant One Name');
      }
    });
  });

  // =========================================================================
  // Edge Cases and Security Tests
  // =========================================================================

  describe('Security Edge Cases', () => {
    it('should prevent cross-tenant switch without membership', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);

      const result = await service.switchContext(
        createParams({ targetTenantId: TENANT_02_ID }),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_NO_MEMBERSHIP');
      }
    });

    it('should check quarantine before membership lookup', async () => {
      mocks.membershipRepository.isQuarantined.mockResolvedValue(true);
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership(),
      ]);

      const result = await service.switchContext(createParams());

      expect(result.success).toBe(false);
      // Quarantine check should happen first, even though membership exists
      expect(mocks.membershipRepository.findActiveByUserAndTenant).not.toHaveBeenCalled();
    });

    it('should not expose internal membershipId resolution in error messages', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);

      const result = await service.switchContext(createParams());

      expect(result.success).toBe(false);
      if (!result.success) {
        // Error message should not contain internal IDs
        expect(result.error.userMessage).not.toContain(MEMBERSHIP_01_ID);
        expect(result.error.userMessage).toBeDefined();
      }
    });
  });

  // =========================================================================
  // Requirement 4 AC Validation
  // =========================================================================

  describe('Requirement 4 Acceptance Criteria', () => {
    /**
     * AC 1: THE System SHALL store the active tenant context (activeTenantId) in the JWT access token claims
     * Note: JWT issuance is handled by caller; service returns the context data
     */
    it('AC 1: returns tenantId in new context for JWT claims', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership(),
      ]);

      const result = await service.switchContext(createParams());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newContext.tenantId).toBeDefined();
        expect(result.data.newContext.tenantId).toBe(TENANT_01_ID);
      }
    });

    /**
     * AC 2: THE System SHALL store the active OrgUnit context (activeOrgUnitId) in the JWT access token claims
     */
    it('AC 2: returns orgUnitId in new context for JWT claims', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership(),
      ]);

      const result = await service.switchContext(createParams());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newContext).toHaveProperty('orgUnitId');
        expect(result.data.newContext.orgUnitId).toBe(ORGUNIT_ROOT_ID);
      }
    });

    /**
     * AC 3: WHEN a user requests to switch active tenant, THE Context_Switcher SHALL validate 
     * that the user has an ACTIVE membership in the target tenant
     */
    it('AC 3: validates ACTIVE membership in target tenant', async () => {
      // No membership
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);

      const result = await service.switchContext(createParams());

      expect(result.success).toBe(false);
      expect(mocks.membershipRepository.findActiveByUserAndTenant).toHaveBeenCalledWith(
        USER_01_ID,
        TENANT_01_ID,
      );
    });

    /**
     * AC 4: WHEN a user requests to switch active OrgUnit, THE Context_Switcher SHALL validate 
     * that the target OrgUnit belongs to the active tenant
     */
    it('AC 4: validates OrgUnit belongs to active tenant', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createTenantLevelMembership(),
      ]);
      mocks.orgUnitHierarchyReader.getOrgUnit.mockResolvedValue(
        fail({
          type: 'not_found',
          code: 'ORGUNIT_NOT_FOUND',
          message: 'OrgUnit not found in tenant',
        }),
      );

      const result = await service.switchContext(
        createParams({ targetOrgUnitId: 'invalid-orgunit-uuid' }),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_ORGUNIT_NOT_FOUND');
      }
    });

    /**
     * AC 5: WHEN a user requests to switch active OrgUnit, THE Context_Switcher SHALL validate 
     * that the user's membership scope includes the target OrgUnit
     */
    it('AC 5: validates membership scope includes target OrgUnit', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership({ orgUnitId: ORGUNIT_ROOT_ID }),
      ]);
      mocks.orgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(false));

      const result = await service.switchContext(
        createParams({ targetOrgUnitId: ORGUNIT_OTHER_ID }),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_OUT_OF_SCOPE');
      }
    });

    /**
     * AC 6: WHEN a valid context switch is completed, THE Context_Switcher SHALL issue 
     * a new access token with updated activeTenantId and activeOrgUnitId
     * Note: Token issuance handled by caller; service returns context for new JWT
     */
    it('AC 6: returns new context data for token issuance', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership(),
      ]);

      const result = await service.switchContext(createParams());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newContext.tenantId).toBeDefined();
        expect(result.data.newContext.orgUnitId).toBeDefined();
        expect(result.data.newContext.role).toBeDefined();
      }
    });

    /**
     * AC 7: IF a context switch request targets an invalid tenant or OrgUnit, 
     * THEN THE Context_Switcher SHALL return an error with code CONTEXT_SWITCH_INVALID 
     * and not modify the session
     */
    it('AC 7: returns CONTEXT_SWITCH_* error on invalid switch', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([]);

      const result = await service.switchContext(createParams());

      expect(result.success).toBe(false);
      if (!result.success) {
        // Error code should start with CONTEXT_SWITCH_
        expect(result.error.code).toMatch(/^CONTEXT_SWITCH_/);
      }
    });

    /**
     * AC 8: THE System SHALL allow activeOrgUnitId to be null ONLY for users 
     * with tenant-level admin roles (PLATFORM_ADMIN, TENANT_OWNER)
     */
    it('AC 8: allows null orgUnitId only for tenant-level admin roles', async () => {
      // TENANT_OWNER should be allowed
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createTenantLevelMembership({ role: MembershipRole.TENANT_OWNER }),
      ]);

      const resultOwner = await service.switchContext(
        createParams({ targetOrgUnitId: null }),
      );
      expect(resultOwner.success).toBe(true);

      // RESIDENT should be rejected
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createMembership({ role: MembershipRole.RESIDENT }),
      ]);

      const resultResident = await service.switchContext(
        createParams({ targetOrgUnitId: null }),
      );
      expect(resultResident.success).toBe(false);
      if (!resultResident.success) {
        expect(resultResident.error.code).toBe('CONTEXT_SWITCH_INVALID_SCOPE');
      }
    });

    it('AC 8: PLATFORM_ADMIN can use null orgUnitId', async () => {
      mocks.membershipRepository.findActiveByUserAndTenant.mockResolvedValue([
        createTenantLevelMembership({ role: MembershipRole.PLATFORM_ADMIN }),
      ]);

      const result = await service.switchContext(
        createParams({ targetOrgUnitId: null }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newContext.orgUnitId).toBe(null);
      }
    });
  });
});
