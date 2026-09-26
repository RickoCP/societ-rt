/**
 * OrgUnitCrudService Unit Tests
 *
 * Tests authorization-aware CRUD operations for OrgUnits:
 * - Permission validation for each operation
 * - Scope validation via OrgUnitScopeAuthorizer
 * - Integration with OrgUnitManagementService
 * - Authorization-aware list operations
 *
 * **VALIDATES: Requirements 6 (AC 1-7), Requirements 34 (OrgUnit CRUD)**
 *
 * @see FASE 1.19 Task 58: OrgUnit CRUD Operations (Req 34)
 * @see Requirements 6 (OrgUnit Scope Authorization)
 */

import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import type { OrgUnit } from '../../entities';
import type { IOrgUnitRepository } from '../../repositories';
import type { IOrgUnitHierarchyReader } from '../OrgUnitHierarchyReader';
import type {
  IOrgUnitManagementService,
  CreateOrgUnitResult,
  UpdateOrgUnitResult,
  MoveOrgUnitResult,
  DeleteOrgUnitResult,
} from '../OrgUnitManagementService';
import type { IOrgUnitScopeAuthorizer } from '@core/domains/authorization/services/OrgUnitScopeAuthorizer';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import { OrgUnitCrudServiceImpl, ORGUNIT_PERMISSIONS } from '../OrgUnitCrudService';
import { OrgUnitType } from '../../types';
import { MembershipRole } from '@core/domains/membership/types';
import { ok, fail } from '@core/utils';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TENANT_01_ID = 'tenant-01-uuid';
const TENANT_02_ID = 'tenant-02-uuid';

const ORG_ROOT_ID = 'org-root-uuid';
const CLUSTER_01_ID = 'cluster-01-uuid';
const RW_01_ID = 'rw-01-uuid';
const RT_01_ID = 'rt-01-uuid';

const USER_01_ID = 'user-01-uuid';
const MEMBERSHIP_01_ID = 'membership-01-uuid';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Create a mock OrgUnit for testing.
 */
function createOrgUnit(overrides: Partial<OrgUnit> = {}): OrgUnit {
  return {
    id: ORG_ROOT_ID,
    tenantId: TENANT_01_ID,
    parentId: null,
    type: OrgUnitType.ORGANIZATION,
    name: 'Test Org',
    path: [ORG_ROOT_ID],
    depth: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a standard hierarchy for testing.
 */
function createHierarchy(tenantId: string = TENANT_01_ID): Map<string, OrgUnit> {
  const orgRoot = createOrgUnit({
    id: ORG_ROOT_ID,
    tenantId,
    parentId: null,
    type: OrgUnitType.ORGANIZATION,
    name: 'Housing Complex',
    path: [ORG_ROOT_ID],
    depth: 0,
  });

  const cluster01 = createOrgUnit({
    id: CLUSTER_01_ID,
    tenantId,
    parentId: ORG_ROOT_ID,
    type: OrgUnitType.CLUSTER,
    name: 'Tower North',
    path: [ORG_ROOT_ID, CLUSTER_01_ID],
    depth: 1,
  });

  const rw01 = createOrgUnit({
    id: RW_01_ID,
    tenantId,
    parentId: CLUSTER_01_ID,
    type: OrgUnitType.RW,
    name: 'RW 01',
    path: [ORG_ROOT_ID, CLUSTER_01_ID, RW_01_ID],
    depth: 2,
  });

  const rt01 = createOrgUnit({
    id: RT_01_ID,
    tenantId,
    parentId: RW_01_ID,
    type: OrgUnitType.RT,
    name: 'RT 001',
    path: [ORG_ROOT_ID, CLUSTER_01_ID, RW_01_ID, RT_01_ID],
    depth: 3,
  });

  const map = new Map<string, OrgUnit>();
  map.set(ORG_ROOT_ID, orgRoot);
  map.set(CLUSTER_01_ID, cluster01);
  map.set(RW_01_ID, rw01);
  map.set(RT_01_ID, rt01);
  return map;
}

/**
 * Create an authorization context for testing.
 */
function createAuthContext(
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  return {
    userId: USER_01_ID,
    tenantId: TENANT_01_ID,
    membershipId: MEMBERSHIP_01_ID,
    orgUnitId: RW_01_ID,
    role: MembershipRole.ORG_ADMIN,
    permissions: new Set([
      ORGUNIT_PERMISSIONS.CREATE,
      ORGUNIT_PERMISSIONS.READ,
      ORGUNIT_PERMISSIONS.UPDATE,
      ORGUNIT_PERMISSIONS.DELETE,
      ORGUNIT_PERMISSIONS.MOVE,
    ]),
    tokenVersion: 1,
    ...overrides,
  };
}

/**
 * Create a tenant-level admin authorization context.
 */
function createTenantAdminAuthContext(
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  return createAuthContext({
    role: MembershipRole.TENANT_OWNER,
    orgUnitId: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Mock Factory Functions
// ---------------------------------------------------------------------------

function createMockOrgUnitManagementService(): Mocked<IOrgUnitManagementService> {
  return {
    create: vi.fn(),
    update: vi.fn(),
    move: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
    computePath: vi.fn(),
    computeDepth: vi.fn(),
    repairPaths: vi.fn(),
    wouldCreateCycle: vi.fn(),
    isValidPlacement: vi.fn(),
  };
}

function createMockOrgUnitScopeAuthorizer(): Mocked<IOrgUnitScopeAuthorizer> {
  return {
    checkScope: vi.fn().mockResolvedValue(ok(undefined)),
    checkScopeWithReason: vi.fn(),
    hasTenantLevelScope: vi.fn(),
  };
}

function createMockOrgUnitRepository(
  hierarchy: Map<string, OrgUnit> = createHierarchy(),
): Mocked<IOrgUnitRepository> {
  return {
    findById: vi.fn(async (orgUnitId: string, tenantId: string) => {
      const ou = hierarchy.get(orgUnitId);
      if (ou && ou.tenantId === tenantId) {
        return ou;
      }
      return null;
    }),
    exists: vi.fn(async (orgUnitId: string, tenantId: string) => {
      const ou = hierarchy.get(orgUnitId);
      return ou !== undefined && ou.tenantId === tenantId;
    }),
    findRoots: vi.fn(async (tenantId: string) => {
      return Array.from(hierarchy.values()).filter(
        ou => ou.tenantId === tenantId && ou.parentId === null,
      );
    }),
    findAllInTenant: vi.fn(async (tenantId: string) => {
      return Array.from(hierarchy.values()).filter(ou => ou.tenantId === tenantId);
    }),
    findChildren: vi.fn(async (parentId: string, tenantId: string) => {
      return Array.from(hierarchy.values()).filter(
        ou => ou.tenantId === tenantId && ou.parentId === parentId,
      );
    }),
    findDescendants: vi.fn(async (ancestorId: string, tenantId: string) => {
      return Array.from(hierarchy.values()).filter(
        ou => ou.tenantId === tenantId && ou.path.includes(ancestorId) && ou.id !== ancestorId,
      );
    }),
    findAncestors: vi.fn(async (orgUnitId: string, tenantId: string) => {
      const ou = hierarchy.get(orgUnitId);
      if (!ou || ou.tenantId !== tenantId) return [];
      const ancestors: OrgUnit[] = [];
      for (let i = 0; i < ou.path.length - 1; i++) {
        const ancestor = hierarchy.get(ou.path[i]!);
        if (ancestor) ancestors.push(ancestor);
      }
      return ancestors;
    }),
    getPath: vi.fn(async (orgUnitId: string, tenantId: string) => {
      const ou = hierarchy.get(orgUnitId);
      if (ou && ou.tenantId === tenantId) {
        return ou.path;
      }
      return null;
    }),
    getDepth: vi.fn(async (orgUnitId: string, tenantId: string) => {
      const ou = hierarchy.get(orgUnitId);
      if (ou && ou.tenantId === tenantId) {
        return ou.depth;
      }
      return null;
    }),
  };
}

function createMockHierarchyReader(
  hierarchy: Map<string, OrgUnit> = createHierarchy(),
): Mocked<IOrgUnitHierarchyReader> {
  return {
    isDescendantOrEqual: vi.fn(async (resourceOrgUnitId, membershipOrgUnitId, tenantId) => {
      if (resourceOrgUnitId === membershipOrgUnitId) {
        return ok(true);
      }
      const resource = hierarchy.get(resourceOrgUnitId);
      if (!resource || resource.tenantId !== tenantId) {
        return fail({ code: 'ORGUNIT_NOT_FOUND', message: 'Not found', type: 'not_found' });
      }
      return ok(resource.path.includes(membershipOrgUnitId));
    }),
    isDescendantOf: vi.fn(),
    isRoot: vi.fn(),
    getOrgUnitPath: vi.fn(),
    getOrgUnitDepth: vi.fn(),
    getOrgUnit: vi.fn(),
    validatePathDepthInvariant: vi.fn(() => ({ isValid: true })),
    validateRootInvariant: vi.fn(() => ({ isValid: true })),
    validateOrgUnitInvariants: vi.fn(() => ok(undefined)),
    getAncestors: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrgUnitCrudService', () => {
  let hierarchy: Map<string, OrgUnit>;
  let mockManagementService: Mocked<IOrgUnitManagementService>;
  let mockScopeAuthorizer: Mocked<IOrgUnitScopeAuthorizer>;
  let mockRepository: Mocked<IOrgUnitRepository>;
  let mockHierarchyReader: Mocked<IOrgUnitHierarchyReader>;
  let service: ReturnType<typeof OrgUnitCrudServiceImpl>;

  beforeEach(() => {
    hierarchy = createHierarchy();
    mockManagementService = createMockOrgUnitManagementService();
    mockScopeAuthorizer = createMockOrgUnitScopeAuthorizer();
    mockRepository = createMockOrgUnitRepository(hierarchy);
    mockHierarchyReader = createMockHierarchyReader(hierarchy);

    service = OrgUnitCrudServiceImpl({
      orgUnitManagementService: mockManagementService,
      orgUnitScopeAuthorizer: mockScopeAuthorizer,
      orgUnitRepository: mockRepository,
      hierarchyReader: mockHierarchyReader,
    });
  });

  // -------------------------------------------------------------------------
  // Permission Validation Tests
  // -------------------------------------------------------------------------

  describe('permission validation', () => {
    it('should deny create when user lacks CREATE permission', async () => {
      const authContext = createAuthContext({
        permissions: new Set([ORGUNIT_PERMISSIONS.READ]),
      });

      const result = await service.create({
        authContext,
        tenantId: TENANT_01_ID,
        parentId: RW_01_ID,
        type: OrgUnitType.RT,
        name: 'New RT',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });

    it('should deny update when user lacks UPDATE permission', async () => {
      const authContext = createAuthContext({
        permissions: new Set([ORGUNIT_PERMISSIONS.READ]),
      });

      const result = await service.update({
        authContext,
        orgUnitId: RT_01_ID,
        tenantId: TENANT_01_ID,
        name: 'Updated Name',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });

    it('should deny delete when user lacks DELETE permission', async () => {
      const authContext = createAuthContext({
        permissions: new Set([ORGUNIT_PERMISSIONS.READ]),
      });

      const result = await service.delete({
        authContext,
        orgUnitId: RT_01_ID,
        tenantId: TENANT_01_ID,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });

    it('should deny move when user lacks MOVE permission', async () => {
      const authContext = createAuthContext({
        permissions: new Set([ORGUNIT_PERMISSIONS.READ]),
      });

      const result = await service.move({
        authContext,
        orgUnitId: RT_01_ID,
        tenantId: TENANT_01_ID,
        newParentId: CLUSTER_01_ID,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });

    it('should deny getById when user lacks READ permission', async () => {
      const authContext = createAuthContext({
        permissions: new Set([ORGUNIT_PERMISSIONS.CREATE]),
      });

      const result = await service.getById(RT_01_ID, authContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Scope Authorization Tests
  // -------------------------------------------------------------------------

  describe('scope authorization', () => {
    it('should deny create when user lacks scope over parent OrgUnit', async () => {
      mockScopeAuthorizer.checkScope.mockResolvedValueOnce(
        fail({
          code: 'AUTH_OUT_OF_SCOPE',
          type: 'authorization',
          message: 'Out of scope',
        }),
      );

      const authContext = createAuthContext();
      const result = await service.create({
        authContext,
        tenantId: TENANT_01_ID,
        parentId: ORG_ROOT_ID, // User has scope over RW_01, not ORG_ROOT
        type: OrgUnitType.CLUSTER,
        name: 'New Cluster',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_OUT_OF_SCOPE');
      }
    });

    it('should allow tenant-level admin to create root OrgUnit', async () => {
      const authContext = createTenantAdminAuthContext();

      mockManagementService.create.mockResolvedValueOnce(
        ok({
          orgUnit: createOrgUnit({ name: 'New Root' }),
          event: { type: 'ORGUNIT_CREATED' } as any,
        }),
      );

      const result = await service.create({
        authContext,
        tenantId: TENANT_01_ID,
        parentId: null,
        type: OrgUnitType.ORGANIZATION,
        name: 'New Root',
      });

      expect(result.success).toBe(true);
      expect(mockManagementService.create).toHaveBeenCalled();
    });

    it('should deny org-scoped user from creating root OrgUnit', async () => {
      const authContext = createAuthContext(); // Org-scoped user

      const result = await service.create({
        authContext,
        tenantId: TENANT_01_ID,
        parentId: null,
        type: OrgUnitType.ORGANIZATION,
        name: 'New Root',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_OUT_OF_SCOPE');
      }
    });

    it('should deny update when user lacks scope over target OrgUnit', async () => {
      mockScopeAuthorizer.checkScope.mockResolvedValueOnce(
        fail({
          code: 'AUTH_OUT_OF_SCOPE',
          type: 'authorization',
          message: 'Out of scope',
        }),
      );

      const authContext = createAuthContext();
      const result = await service.update({
        authContext,
        orgUnitId: ORG_ROOT_ID,
        tenantId: TENANT_01_ID,
        name: 'Updated Name',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_OUT_OF_SCOPE');
      }
    });

    it('should deny move when user lacks scope over destination', async () => {
      // First scope check passes (source), second fails (destination)
      mockScopeAuthorizer.checkScope
        .mockResolvedValueOnce(ok(undefined)) // source
        .mockResolvedValueOnce(
          fail({
            code: 'AUTH_OUT_OF_SCOPE',
            type: 'authorization',
            message: 'Out of scope',
          }),
        ); // destination

      const authContext = createAuthContext();
      const result = await service.move({
        authContext,
        orgUnitId: RT_01_ID,
        tenantId: TENANT_01_ID,
        newParentId: ORG_ROOT_ID,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_OUT_OF_SCOPE');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tenant Boundary Tests
  // -------------------------------------------------------------------------

  describe('tenant boundary', () => {
    it('should deny create when tenant mismatch', async () => {
      const authContext = createAuthContext({ tenantId: TENANT_01_ID });

      const result = await service.create({
        authContext,
        tenantId: TENANT_02_ID, // Different tenant
        parentId: RW_01_ID,
        type: OrgUnitType.RT,
        name: 'New RT',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TENANT_MISMATCH');
      }
    });

    it('should deny update when tenant mismatch', async () => {
      const authContext = createAuthContext({ tenantId: TENANT_01_ID });

      const result = await service.update({
        authContext,
        orgUnitId: RT_01_ID,
        tenantId: TENANT_02_ID,
        name: 'Updated Name',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TENANT_MISMATCH');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Successful Operation Tests
  // -------------------------------------------------------------------------

  describe('successful operations', () => {
    it('should create OrgUnit when all checks pass', async () => {
      const authContext = createAuthContext();
      const mockResult: CreateOrgUnitResult = {
        orgUnit: createOrgUnit({
          id: 'new-rt-id',
          parentId: RW_01_ID,
          type: OrgUnitType.RT,
          name: 'New RT',
        }),
        event: { type: 'ORGUNIT_CREATED' } as any,
      };

      mockManagementService.create.mockResolvedValueOnce(ok(mockResult));

      const result = await service.create({
        authContext,
        tenantId: TENANT_01_ID,
        parentId: RW_01_ID,
        type: OrgUnitType.RT,
        name: 'New RT',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.orgUnit.name).toBe('New RT');
      }
      expect(mockManagementService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_01_ID,
          parentId: RW_01_ID,
          type: OrgUnitType.RT,
          name: 'New RT',
          performedBy: USER_01_ID,
        }),
      );
    });

    it('should update OrgUnit when all checks pass', async () => {
      const authContext = createAuthContext();
      const mockResult: UpdateOrgUnitResult = {
        orgUnit: createOrgUnit({
          id: RT_01_ID,
          name: 'Updated Name',
        }),
        event: { type: 'ORGUNIT_UPDATED' } as any,
      };

      mockManagementService.update.mockResolvedValueOnce(ok(mockResult));

      const result = await service.update({
        authContext,
        orgUnitId: RT_01_ID,
        tenantId: TENANT_01_ID,
        name: 'Updated Name',
      });

      expect(result.success).toBe(true);
      expect(mockManagementService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          orgUnitId: RT_01_ID,
          name: 'Updated Name',
          performedBy: USER_01_ID,
        }),
      );
    });

    it('should delete OrgUnit when all checks pass', async () => {
      const authContext = createAuthContext();
      const mockResult: DeleteOrgUnitResult = {
        deletedCount: 1,
        event: { type: 'ORGUNIT_DELETED' } as any,
      };

      mockManagementService.delete.mockResolvedValueOnce(ok(mockResult));

      const result = await service.delete({
        authContext,
        orgUnitId: RT_01_ID,
        tenantId: TENANT_01_ID,
      });

      expect(result.success).toBe(true);
      expect(mockManagementService.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          orgUnitId: RT_01_ID,
          performedBy: USER_01_ID,
        }),
      );
    });

    it('should move OrgUnit when all checks pass', async () => {
      const authContext = createTenantAdminAuthContext();
      const mockResult: MoveOrgUnitResult = {
        orgUnit: createOrgUnit({ id: RT_01_ID }),
        descendantsUpdated: 0,
        event: { type: 'ORGUNIT_MOVED' } as any,
      };

      mockManagementService.move.mockResolvedValueOnce(ok(mockResult));

      const result = await service.move({
        authContext,
        orgUnitId: RT_01_ID,
        tenantId: TENANT_01_ID,
        newParentId: CLUSTER_01_ID,
      });

      expect(result.success).toBe(true);
      expect(mockManagementService.move).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Read Operation Tests
  // -------------------------------------------------------------------------

  describe('read operations', () => {
    it('should get OrgUnit by ID when authorized', async () => {
      const authContext = createAuthContext();
      mockManagementService.getById.mockResolvedValueOnce(
        createOrgUnit({ id: RT_01_ID }),
      );

      const result = await service.getById(RT_01_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(RT_01_ID);
      }
    });

    it('should return not found when OrgUnit does not exist', async () => {
      const authContext = createAuthContext();
      mockManagementService.getById.mockResolvedValueOnce(null);

      const result = await service.getById('non-existent', authContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_FOUND');
      }
    });

    it('should list all OrgUnits for tenant-level admin', async () => {
      const authContext = createTenantAdminAuthContext();

      const result = await service.list({ authContext });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.orgUnits.length).toBe(4); // All 4 in hierarchy
        expect(result.data.totalCount).toBe(4);
      }
    });

    it('should list only in-scope OrgUnits for org-scoped user', async () => {
      const authContext = createAuthContext({ orgUnitId: RW_01_ID });

      const result = await service.list({ authContext });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should include RW_01 and its descendants (RT_01)
        expect(result.data.orgUnits.length).toBe(2);
        expect(result.data.orgUnits.map(ou => ou.id)).toContain(RW_01_ID);
        expect(result.data.orgUnits.map(ou => ou.id)).toContain(RT_01_ID);
      }
    });

    it('should get children when authorized', async () => {
      const authContext = createAuthContext();

      const result = await service.getChildren(RW_01_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(1);
        expect(result.data[0]!.id).toBe(RT_01_ID);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Helper Method Tests
  // -------------------------------------------------------------------------

  describe('helper methods', () => {
    it('should check if user has permission', () => {
      const authContext = createAuthContext();

      expect(service.hasPermission(authContext, ORGUNIT_PERMISSIONS.READ)).toBe(true);
      expect(service.hasPermission(authContext, 'unknown:permission')).toBe(false);
    });

    it('should check if OrgUnit is in scope', async () => {
      const authContext = createAuthContext();

      const result = await service.isInScope(RT_01_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false when OrgUnit is out of scope', async () => {
      mockScopeAuthorizer.checkScope.mockResolvedValueOnce(
        fail({
          code: 'AUTH_OUT_OF_SCOPE',
          type: 'authorization',
          message: 'Out of scope',
        }),
      );

      const authContext = createAuthContext();

      const result = await service.isInScope(ORG_ROOT_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Auth Context Validation Tests
  // -------------------------------------------------------------------------

  describe('auth context validation', () => {
    it('should deny when auth context is null', async () => {
      const result = await service.create({
        authContext: null as any,
        tenantId: TENANT_01_ID,
        parentId: RW_01_ID,
        type: OrgUnitType.RT,
        name: 'New RT',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_CONTEXT_REQUIRED');
      }
    });

    it('should deny when auth context is undefined', async () => {
      const result = await service.update({
        authContext: undefined as any,
        orgUnitId: RT_01_ID,
        tenantId: TENANT_01_ID,
        name: 'Updated Name',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_CONTEXT_REQUIRED');
      }
    });
  });
});
