/**
 * Unit tests for MultiClusterService.
 *
 * Tests the multi-cluster support functionality including:
 * - Cluster creation and deletion
 * - Cluster listing and details retrieval
 * - Cluster context switching
 * - Cross-cluster navigation
 * - Cluster-level scope validation
 *
 * @see FASE 1.19 Task 59: Multi-Cluster Support (Req 58)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  MultiClusterServiceImpl,
  type IMultiClusterService,
  CLUSTER_PERMISSIONS,
} from '../MultiClusterService';
import type { IOrgUnitRepository } from '../../repositories';
import type { IOrgUnitManagementService } from '../OrgUnitManagementService';
import type { IOrgUnitHierarchyReader } from '../OrgUnitHierarchyReader';
import type { IOrgUnitScopeAuthorizer } from '@core/domains/authorization/services/OrgUnitScopeAuthorizer';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { OrgUnit } from '../../entities';
import { OrgUnitType } from '../../types';
import { MembershipRole } from '@core/domains/membership/types';
import { ok, fail } from '@core/utils';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-123';
const USER_ID = 'user-456';
const CLUSTER_ID = 'cluster-789';
const ORG_ID = 'org-001';
const RW_ID = 'rw-001';
const RT_ID = 'rt-001';

const createMockOrgUnit = (
  id: string,
  type: OrgUnitType,
  parentId: string | null = null,
  path: string[] = [id],
  depth = 0,
): OrgUnit => ({
  id,
  tenantId: TENANT_ID,
  parentId,
  type,
  name: `Test ${type} ${id}`,
  path,
  depth,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createMockAuthContext = (
  role: MembershipRole,
  orgUnitId: string | null,
  permissions: string[] = [],
): AuthorizationContext => ({
  userId: USER_ID,
  tenantId: TENANT_ID,
  membershipId: 'membership-123',
  orgUnitId,
  role,
  permissions: new Set(permissions),
  tokenVersion: 1,
});

// Mock OrgUnits for testing
const mockOrganization = createMockOrgUnit(ORG_ID, OrgUnitType.ORGANIZATION, null, [ORG_ID], 0);
const mockCluster = createMockOrgUnit(
  CLUSTER_ID,
  OrgUnitType.CLUSTER,
  ORG_ID,
  [ORG_ID, CLUSTER_ID],
  1,
);
const mockRw = createMockOrgUnit(
  RW_ID,
  OrgUnitType.RW,
  CLUSTER_ID,
  [ORG_ID, CLUSTER_ID, RW_ID],
  2,
);
const mockRt = createMockOrgUnit(
  RT_ID,
  OrgUnitType.RT,
  RW_ID,
  [ORG_ID, CLUSTER_ID, RW_ID, RT_ID],
  3,
);

// ---------------------------------------------------------------------------
// Mock Factory
// ---------------------------------------------------------------------------

const createMockDependencies = () => {
  const orgUnitRepository: {
    findById: Mock;
    exists: Mock;
    findAllInTenant: Mock;
    findChildren: Mock;
    findDescendants: Mock;
    findRoots: Mock;
    findAncestors: Mock;
    getPath: Mock;
    getDepth: Mock;
  } = {
    findById: vi.fn(),
    exists: vi.fn(),
    findAllInTenant: vi.fn(),
    findChildren: vi.fn(),
    findDescendants: vi.fn(),
    findRoots: vi.fn(),
    findAncestors: vi.fn(),
    getPath: vi.fn(),
    getDepth: vi.fn(),
  };

  const orgUnitManagementService: {
    create: Mock;
    update: Mock;
    move: Mock;
    delete: Mock;
    getById: Mock;
    computePath: Mock;
    computeDepth: Mock;
    repairPaths: Mock;
    wouldCreateCycle: Mock;
    isValidPlacement: Mock;
  } = {
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

  const hierarchyReader: {
    isDescendantOrEqual: Mock;
    isDescendantOf: Mock;
    isRoot: Mock;
    getOrgUnitPath: Mock;
    getOrgUnitDepth: Mock;
    getOrgUnit: Mock;
    validatePathDepthInvariant: Mock;
    validateRootInvariant: Mock;
    validateOrgUnitInvariants: Mock;
    getAncestors: Mock;
  } = {
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

  const orgUnitScopeAuthorizer: {
    checkScope: Mock;
    isInScope: Mock;
  } = {
    checkScope: vi.fn(),
    isInScope: vi.fn(),
  };

  return {
    orgUnitRepository: orgUnitRepository as unknown as IOrgUnitRepository,
    orgUnitManagementService: orgUnitManagementService as unknown as IOrgUnitManagementService,
    hierarchyReader: hierarchyReader as unknown as IOrgUnitHierarchyReader,
    orgUnitScopeAuthorizer: orgUnitScopeAuthorizer as unknown as IOrgUnitScopeAuthorizer,
    mocks: {
      orgUnitRepository,
      orgUnitManagementService,
      hierarchyReader,
      orgUnitScopeAuthorizer,
    },
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MultiClusterService', () => {
  let service: IMultiClusterService;
  let deps: ReturnType<typeof createMockDependencies>;

  beforeEach(() => {
    deps = createMockDependencies();
    service = MultiClusterServiceImpl({
      orgUnitRepository: deps.orgUnitRepository,
      orgUnitManagementService: deps.orgUnitManagementService,
      hierarchyReader: deps.hierarchyReader,
      orgUnitScopeAuthorizer: deps.orgUnitScopeAuthorizer,
    });
  });

  // -------------------------------------------------------------------------
  // createCluster Tests
  // -------------------------------------------------------------------------

  describe('createCluster', () => {
    it('should create a cluster under an organization with valid permissions', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.CREATE],
      );

      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockOrganization);
      deps.mocks.orgUnitScopeAuthorizer.checkScope.mockResolvedValue(ok(undefined));
      deps.mocks.orgUnitManagementService.create.mockResolvedValue(
        ok({
          orgUnit: mockCluster,
          event: {
            type: 'ORGUNIT_CREATED',
            payload: {},
            metadata: { timestamp: new Date(), correlationId: 'test' },
          },
        }),
      );

      const result = await service.createCluster({
        tenantId: TENANT_ID,
        parentId: ORG_ID,
        name: 'New Cluster',
        authContext,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.orgUnit.type).toBe(OrgUnitType.CLUSTER);
      }
      expect(deps.mocks.orgUnitManagementService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          parentId: ORG_ID,
          type: OrgUnitType.CLUSTER,
          name: 'New Cluster',
        }),
      );
    });

    it('should reject cluster creation without permission', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RESIDENT,
        CLUSTER_ID,
        [], // No permissions
      );

      const result = await service.createCluster({
        tenantId: TENANT_ID,
        parentId: ORG_ID,
        name: 'New Cluster',
        authContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });

    it('should reject cluster creation under invalid parent type', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.CREATE],
      );

      // Parent is RW (not ORGANIZATION) - invalid for CLUSTER
      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockRw);

      const result = await service.createCluster({
        tenantId: TENANT_ID,
        parentId: RW_ID,
        name: 'New Cluster',
        authContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CLUSTER_INVALID_PARENT');
      }
    });

    it('should reject cluster creation in different tenant', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.CREATE],
      );

      const result = await service.createCluster({
        tenantId: 'different-tenant',
        parentId: ORG_ID,
        name: 'New Cluster',
        authContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TENANT_MISMATCH');
      }
    });

    it('should allow root cluster creation by tenant-level admin', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.CREATE],
      );

      deps.mocks.orgUnitManagementService.create.mockResolvedValue(
        ok({
          orgUnit: { ...mockCluster, parentId: null, path: [CLUSTER_ID], depth: 0 },
          event: {
            type: 'ORGUNIT_CREATED',
            payload: {},
            metadata: { timestamp: new Date(), correlationId: 'test' },
          },
        }),
      );

      const result = await service.createCluster({
        tenantId: TENANT_ID,
        parentId: null,
        name: 'Root Cluster',
        authContext,
      });

      expect(result.success).toBe(true);
    });

    it('should reject root cluster creation by non-tenant-level admin', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RT_ADMIN,
        CLUSTER_ID, // Has org scope, not tenant level
        [CLUSTER_PERMISSIONS.CREATE],
      );

      const result = await service.createCluster({
        tenantId: TENANT_ID,
        parentId: null,
        name: 'Root Cluster',
        authContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_OUT_OF_SCOPE');
      }
    });
  });

  // -------------------------------------------------------------------------
  // listClusters Tests
  // -------------------------------------------------------------------------

  describe('listClusters', () => {
    it('should list all clusters for tenant-level admin', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.READ],
      );

      const cluster2 = createMockOrgUnit(
        'cluster-002',
        OrgUnitType.CLUSTER,
        ORG_ID,
        [ORG_ID, 'cluster-002'],
        1,
      );

      deps.mocks.orgUnitRepository.findAllInTenant.mockResolvedValue([
        mockOrganization,
        mockCluster,
        cluster2,
        mockRw,
        mockRt,
      ]);

      const result = await service.listClusters(TENANT_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.clusters).toHaveLength(2);
        expect(result.data.clusters.every((c) => c.type === OrgUnitType.CLUSTER)).toBe(true);
      }
    });

    it('should filter clusters by user scope for org-scoped user', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RT_ADMIN,
        CLUSTER_ID,
        [CLUSTER_PERMISSIONS.READ],
      );

      const cluster2 = createMockOrgUnit(
        'cluster-002',
        OrgUnitType.CLUSTER,
        ORG_ID,
        [ORG_ID, 'cluster-002'],
        1,
      );

      deps.mocks.orgUnitRepository.findAllInTenant.mockResolvedValue([
        mockOrganization,
        mockCluster,
        cluster2,
      ]);

      // Cluster 1 is in scope (user's membership is in this cluster)
      deps.mocks.hierarchyReader.isDescendantOrEqual
        .mockResolvedValueOnce(ok(false)) // cluster-789 is not descendant of cluster-789 (wrong direction)
        .mockResolvedValueOnce(ok(true)) // cluster-789 includes cluster-789 (self)
        .mockResolvedValueOnce(ok(false)) // cluster-002 is not descendant of cluster-789
        .mockResolvedValueOnce(ok(false)); // cluster-789 is not descendant of cluster-002

      const result = await service.listClusters(TENANT_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.clusters).toHaveLength(1);
        expect(result.data.clusters[0]!.id).toBe(CLUSTER_ID);
      }
    });

    it('should reject list without permission', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RESIDENT,
        CLUSTER_ID,
        [], // No permissions
      );

      const result = await service.listClusters(TENANT_ID, authContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });
  });

  // -------------------------------------------------------------------------
  // getClusterDetails Tests
  // -------------------------------------------------------------------------

  describe('getClusterDetails', () => {
    it('should return cluster details with children and descendants', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.READ],
      );

      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockCluster);
      deps.mocks.orgUnitRepository.exists.mockResolvedValue(true);
      deps.mocks.orgUnitRepository.findChildren.mockResolvedValue([mockRw]);
      deps.mocks.orgUnitRepository.findDescendants.mockResolvedValue([mockRw, mockRt]);
      deps.mocks.hierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

      const result = await service.getClusterDetails(CLUSTER_ID, TENANT_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cluster.id).toBe(CLUSTER_ID);
        expect(result.data.children).toHaveLength(1);
        expect(result.data.descendants).toHaveLength(2);
        expect(result.data.descendantCount).toBe(2);
      }
    });

    it('should reject details for non-CLUSTER type', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.READ],
      );

      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockRw); // RW, not CLUSTER

      const result = await service.getClusterDetails(RW_ID, TENANT_ID, authContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CLUSTER_TYPE_MISMATCH');
      }
    });

    it('should reject details for non-existent cluster', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.READ],
      );

      deps.mocks.orgUnitRepository.findById.mockResolvedValue(null);

      const result = await service.getClusterDetails('non-existent', TENANT_ID, authContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CLUSTER_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // switchCluster Tests
  // -------------------------------------------------------------------------

  describe('switchCluster', () => {
    it('should allow cluster switch for tenant-level admin', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [],
      );

      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockCluster);
      deps.mocks.orgUnitRepository.exists.mockResolvedValue(true);

      const result = await service.switchCluster({
        clusterId: CLUSTER_ID,
        tenantId: TENANT_ID,
        authContext,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.newActiveOrgUnitId).toBe(CLUSTER_ID);
        expect(result.data.cluster?.id).toBe(CLUSTER_ID);
      }
    });

    it('should allow cluster switch for user with cluster scope', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RT_ADMIN,
        CLUSTER_ID, // Membership is in this cluster
        [],
      );

      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockCluster);
      deps.mocks.hierarchyReader.isDescendantOrEqual
        .mockResolvedValueOnce(ok(true)); // cluster-789 is descendant/equal of cluster-789

      const result = await service.switchCluster({
        clusterId: CLUSTER_ID,
        tenantId: TENANT_ID,
        authContext,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
      }
    });

    it('should reject cluster switch to different tenant', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [],
      );

      const result = await service.switchCluster({
        clusterId: CLUSTER_ID,
        tenantId: 'different-tenant',
        authContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CLUSTER_SWITCH_TENANT_MISMATCH');
      }
    });

    it('should reject cluster switch to out-of-scope cluster', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RT_ADMIN,
        'other-cluster', // Membership is in a different cluster
        [],
      );

      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockCluster);
      deps.mocks.hierarchyReader.isDescendantOrEqual
        .mockResolvedValueOnce(ok(false)) // CLUSTER_ID is not descendant of other-cluster
        .mockResolvedValueOnce(ok(false)); // other-cluster is not descendant of CLUSTER_ID

      const result = await service.switchCluster({
        clusterId: CLUSTER_ID,
        tenantId: TENANT_ID,
        authContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CLUSTER_SWITCH_OUT_OF_SCOPE');
      }
    });
  });

  // -------------------------------------------------------------------------
  // canNavigateToCluster Tests
  // -------------------------------------------------------------------------

  describe('canNavigateToCluster', () => {
    it('should return true for tenant-level admin', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [],
      );

      deps.mocks.orgUnitRepository.exists.mockResolvedValue(true);

      const result = await service.canNavigateToCluster(CLUSTER_ID, TENANT_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return true when cluster is in user scope', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RT_ADMIN,
        CLUSTER_ID,
        [],
      );

      deps.mocks.hierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

      const result = await service.canNavigateToCluster(CLUSTER_ID, TENANT_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false when cluster is out of scope', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RT_ADMIN,
        'other-cluster',
        [],
      );

      deps.mocks.hierarchyReader.isDescendantOrEqual
        .mockResolvedValueOnce(ok(false))
        .mockResolvedValueOnce(ok(false));

      const result = await service.canNavigateToCluster(CLUSTER_ID, TENANT_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // isWithinCluster Tests
  // -------------------------------------------------------------------------

  describe('isWithinCluster', () => {
    it('should return true when OrgUnit is within cluster', async () => {
      deps.mocks.hierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

      const result = await service.isWithinCluster(RW_ID, CLUSTER_ID, TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false when OrgUnit is not within cluster', async () => {
      deps.mocks.hierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(false));

      const result = await service.isWithinCluster(ORG_ID, CLUSTER_ID, TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // getContainingCluster Tests
  // -------------------------------------------------------------------------

  describe('getContainingCluster', () => {
    it('should return the cluster for an OrgUnit within it', async () => {
      deps.mocks.orgUnitRepository.findById
        .mockResolvedValueOnce(mockRw) // Initial lookup
        .mockResolvedValueOnce(mockOrganization) // ORG_ID ancestor
        .mockResolvedValueOnce(mockCluster); // CLUSTER_ID ancestor

      const result = await service.getContainingCluster(RW_ID, TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.id).toBe(CLUSTER_ID);
        expect(result.data?.type).toBe(OrgUnitType.CLUSTER);
      }
    });

    it('should return the cluster itself when querying a cluster', async () => {
      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockCluster);

      const result = await service.getContainingCluster(CLUSTER_ID, TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.id).toBe(CLUSTER_ID);
      }
    });

    it('should return null when OrgUnit is not in any cluster', async () => {
      deps.mocks.orgUnitRepository.findById
        .mockResolvedValueOnce(mockOrganization) // Initial lookup - ORGANIZATION type
        .mockResolvedValueOnce(null); // No ancestors

      const result = await service.getContainingCluster(ORG_ID, TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('should fail when OrgUnit not found', async () => {
      deps.mocks.orgUnitRepository.findById.mockResolvedValue(null);

      const result = await service.getContainingCluster('non-existent', TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // deleteCluster Tests
  // -------------------------------------------------------------------------

  describe('deleteCluster', () => {
    it('should delete a cluster with valid permissions', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.DELETE],
      );

      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockCluster);
      deps.mocks.orgUnitScopeAuthorizer.checkScope.mockResolvedValue(ok(undefined));
      deps.mocks.orgUnitManagementService.delete.mockResolvedValue(
        ok({
          deletedCount: 1,
          event: {
            type: 'ORGUNIT_DELETED',
            payload: {},
            metadata: { timestamp: new Date(), correlationId: 'test' },
          },
        }),
      );

      const result = await service.deleteCluster({
        clusterId: CLUSTER_ID,
        tenantId: TENANT_ID,
        authContext,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deletedCount).toBe(1);
      }
    });

    it('should reject delete without permission', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RESIDENT,
        CLUSTER_ID,
        [], // No permissions
      );

      const result = await service.deleteCluster({
        clusterId: CLUSTER_ID,
        tenantId: TENANT_ID,
        authContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });

    it('should reject delete for non-CLUSTER type', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [CLUSTER_PERMISSIONS.DELETE],
      );

      deps.mocks.orgUnitRepository.findById.mockResolvedValue(mockRw); // RW, not CLUSTER

      const result = await service.deleteCluster({
        clusterId: RW_ID,
        tenantId: TENANT_ID,
        authContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CLUSTER_TYPE_MISMATCH');
      }
    });
  });

  // -------------------------------------------------------------------------
  // getAvailableClusters Tests
  // -------------------------------------------------------------------------

  describe('getAvailableClusters', () => {
    it('should return all clusters for tenant-level admin with hasFullTenantScope true', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.TENANT_OWNER,
        null,
        [],
      );

      const cluster2 = createMockOrgUnit(
        'cluster-002',
        OrgUnitType.CLUSTER,
        ORG_ID,
        [ORG_ID, 'cluster-002'],
        1,
      );

      deps.mocks.orgUnitRepository.findAllInTenant.mockResolvedValue([
        mockOrganization,
        mockCluster,
        cluster2,
      ]);

      const result = await service.getAvailableClusters(TENANT_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessibleClusters).toHaveLength(2);
        expect(result.data.totalClustersInTenant).toBe(2);
        expect(result.data.hasFullTenantScope).toBe(true);
      }
    });

    it('should filter clusters by scope for org-scoped user', async () => {
      const authContext = createMockAuthContext(
        MembershipRole.RT_ADMIN,
        CLUSTER_ID,
        [],
      );

      const cluster2 = createMockOrgUnit(
        'cluster-002',
        OrgUnitType.CLUSTER,
        ORG_ID,
        [ORG_ID, 'cluster-002'],
        1,
      );

      deps.mocks.orgUnitRepository.findAllInTenant.mockResolvedValue([
        mockOrganization,
        mockCluster,
        cluster2,
      ]);

      deps.mocks.hierarchyReader.isDescendantOrEqual
        .mockResolvedValueOnce(ok(false))
        .mockResolvedValueOnce(ok(true)) // CLUSTER_ID contains CLUSTER_ID
        .mockResolvedValueOnce(ok(false))
        .mockResolvedValueOnce(ok(false));

      const result = await service.getAvailableClusters(TENANT_ID, authContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessibleClusters).toHaveLength(1);
        expect(result.data.totalClustersInTenant).toBe(2);
        expect(result.data.hasFullTenantScope).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Authorization Context Validation Tests
  // -------------------------------------------------------------------------

  describe('authorization context validation', () => {
    it('should reject operations with null authContext', async () => {
      const result = await service.createCluster({
        tenantId: TENANT_ID,
        parentId: ORG_ID,
        name: 'Test',
        authContext: null as unknown as AuthorizationContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_CONTEXT_REQUIRED');
      }
    });

    it('should reject operations with undefined authContext', async () => {
      const result = await service.createCluster({
        tenantId: TENANT_ID,
        parentId: ORG_ID,
        name: 'Test',
        authContext: undefined as unknown as AuthorizationContext,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_CONTEXT_REQUIRED');
      }
    });
  });
});
