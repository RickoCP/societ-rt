/**
 * OrgUnitHierarchyReader Unit Tests
 *
 * Tests the POLICY-NEUTRAL hierarchy read operations per Task 6 requirements:
 * - isDescendantOrEqual for direct match
 * - isDescendantOrEqual for descendant via path array
 * - isDescendantOrEqual for sibling → false
 * - Property: depth = path.length - 1 for all test OrgUnits
 *
 * **TPR-02 APPLIED:**
 * Tests verify that the service is POLICY-NEUTRAL:
 * - Returns boolean primitives, NOT ALLOW/DENY
 * - Validates invariants, NOT authorization decisions
 *
 * @see FASE 1.6 Task 6: OrgUnit Hierarchy Read Support
 * @see Requirements 1 (AC 6), 6 (AC 1-2, 5)
 * @see Design OrgUnit Hierarchy Model, INV-ORG-003, INV-ORG-004
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OrgUnit } from '../../entities';
import type { IOrgUnitRepository } from '../../repositories';
import { OrgUnitType } from '../../types';
import {
  OrgUnitHierarchyReaderImpl,
  type IOrgUnitHierarchyReader,
} from '../OrgUnitHierarchyReader';

// ---------------------------------------------------------------------------
// Test Fixtures - M2 Frozen OrgUnits (L1)
// ---------------------------------------------------------------------------

/**
 * M2 Frozen OrgUnits:
 * - rt01 root: 2459b0bb-115e-52ce-88cd-c176a9aa1e39
 * - rt02 root: 50197f3e-5ebc-5547-91ba-e54b604e0edb
 */
const RT01_ROOT_ID = '2459b0bb-115e-52ce-88cd-c176a9aa1e39';
const RT02_ROOT_ID = '50197f3e-5ebc-5547-91ba-e54b604e0edb';
const TENANT_01_ID = 'tenant-001';
const TENANT_02_ID = 'tenant-002';

/**
 * Create an OrgUnit fixture with defaults.
 */
const createOrgUnit = (overrides: Partial<OrgUnit> = {}): OrgUnit => ({
  id: RT01_ROOT_ID,
  tenantId: TENANT_01_ID,
  parentId: null,
  type: OrgUnitType.RT,
  name: 'RT 01 Root',
  path: [RT01_ROOT_ID],
  depth: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

/**
 * Create a hierarchy of OrgUnits for testing.
 *
 * Structure:
 *   organization-001 (depth=0)
 *     └── cluster-001 (depth=1)
 *           └── rw-001 (depth=2)
 *                 └── rt-001 (depth=3)
 *                 └── rt-002 (depth=3)
 *           └── rw-002 (depth=2)
 *                 └── rt-003 (depth=3)
 */
const createHierarchy = (tenantId: string = TENANT_01_ID) => {
  const org001: OrgUnit = {
    id: 'organization-001',
    tenantId,
    parentId: null,
    type: OrgUnitType.ORGANIZATION,
    name: 'Housing Complex A',
    path: ['organization-001'],
    depth: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const cluster001: OrgUnit = {
    id: 'cluster-001',
    tenantId,
    parentId: 'organization-001',
    type: OrgUnitType.CLUSTER,
    name: 'Tower North',
    path: ['organization-001', 'cluster-001'],
    depth: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const rw001: OrgUnit = {
    id: 'rw-001',
    tenantId,
    parentId: 'cluster-001',
    type: OrgUnitType.RW,
    name: 'RW 01',
    path: ['organization-001', 'cluster-001', 'rw-001'],
    depth: 2,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const rt001: OrgUnit = {
    id: 'rt-001',
    tenantId,
    parentId: 'rw-001',
    type: OrgUnitType.RT,
    name: 'RT 001',
    path: ['organization-001', 'cluster-001', 'rw-001', 'rt-001'],
    depth: 3,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const rt002: OrgUnit = {
    id: 'rt-002',
    tenantId,
    parentId: 'rw-001',
    type: OrgUnitType.RT,
    name: 'RT 002',
    path: ['organization-001', 'cluster-001', 'rw-001', 'rt-002'],
    depth: 3,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const rw002: OrgUnit = {
    id: 'rw-002',
    tenantId,
    parentId: 'cluster-001',
    type: OrgUnitType.CLUSTER,
    name: 'RW 02',
    path: ['organization-001', 'cluster-001', 'rw-002'],
    depth: 2,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const rt003: OrgUnit = {
    id: 'rt-003',
    tenantId,
    parentId: 'rw-002',
    type: OrgUnitType.RT,
    name: 'RT 003',
    path: ['organization-001', 'cluster-001', 'rw-002', 'rt-003'],
    depth: 3,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  return { org001, cluster001, rw001, rt001, rt002, rw002, rt003 };
};

// ---------------------------------------------------------------------------
// Mock Repository Factory
// ---------------------------------------------------------------------------

const createMockRepository = (
  overrides: Partial<IOrgUnitRepository> = {},
): IOrgUnitRepository => ({
  findById: vi.fn().mockResolvedValue(null),
  exists: vi.fn().mockResolvedValue(false),
  findRoots: vi.fn().mockResolvedValue([]),
  findAllInTenant: vi.fn().mockResolvedValue([]),
  findChildren: vi.fn().mockResolvedValue([]),
  findDescendants: vi.fn().mockResolvedValue([]),
  findAncestors: vi.fn().mockResolvedValue([]),
  getPath: vi.fn().mockResolvedValue(null),
  getDepth: vi.fn().mockResolvedValue(null),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('OrgUnitHierarchyReader', () => {
  let reader: IOrgUnitHierarchyReader;
  let mockRepository: IOrgUnitRepository;
  let hierarchy: ReturnType<typeof createHierarchy>;

  beforeEach(() => {
    hierarchy = createHierarchy();
    mockRepository = createMockRepository();
    reader = OrgUnitHierarchyReaderImpl({
      orgUnitRepository: mockRepository,
    });
  });

  // -------------------------------------------------------------------------
  // isDescendantOrEqual - Direct Match (Equality Case)
  // -------------------------------------------------------------------------

  describe('isDescendantOrEqual - direct match', () => {
    it('should return true when resource and membership OrgUnit are the same', async () => {
      // Same ID means equality case
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        'rt-001', // resource OrgUnit
        'rt-001', // membership OrgUnit (same)
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return true for root OrgUnit when both IDs match', async () => {
      const rt01Root = createOrgUnit({
        id: RT01_ROOT_ID,
        parentId: null,
        depth: 0,
        path: [RT01_ROOT_ID],
      });

      mockRepository.findById = vi.fn().mockResolvedValue(rt01Root);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        RT01_ROOT_ID,
        RT01_ROOT_ID,
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // isDescendantOrEqual - Descendant via Path Array
  // -------------------------------------------------------------------------

  describe('isDescendantOrEqual - descendant via path array', () => {
    it('should return true when resource is direct child of membership scope', async () => {
      // rt-001 is child of rw-001
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        'rt-001',    // resource (child)
        'rw-001',    // membership scope (parent)
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return true when resource is deep descendant of membership scope', async () => {
      // rt-001 is descendant of organization-001 (3 levels down)
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        'rt-001',           // resource (deep descendant)
        'organization-001', // membership scope (root)
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return true when resource is in cluster subtree', async () => {
      // rt-001 is descendant of cluster-001
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        'rt-001',       // resource
        'cluster-001',  // membership scope
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // isDescendantOrEqual - Sibling Returns False
  // -------------------------------------------------------------------------

  describe('isDescendantOrEqual - sibling returns false', () => {
    it('should return false when resource is sibling of membership scope', async () => {
      // rt-001 and rt-002 are siblings (both children of rw-001)
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        'rt-001',  // resource
        'rt-002',  // membership scope (sibling)
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should return false when resource is in different subtree', async () => {
      // rt-001 is in rw-001 subtree, rt-003 is in rw-002 subtree
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        'rt-001',  // resource (in rw-001 subtree)
        'rt-003',  // membership scope (in rw-002 subtree)
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should return false when resource is parent of membership scope', async () => {
      // rw-001 is parent of rt-001, not descendant
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rw001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        'rw-001',  // resource (parent)
        'rt-001',  // membership scope (child)
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // isDescendantOrEqual - Error Cases
  // -------------------------------------------------------------------------

  describe('isDescendantOrEqual - error cases', () => {
    it('should return error when resource OrgUnit not found', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(null);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        'nonexistent',
        'rw-001',
        TENANT_01_ID,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_FOUND');
      }
    });

    it('should return error when membership OrgUnit not found', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(false);

      const result = await reader.isDescendantOrEqual(
        'rt-001',
        'nonexistent',
        TENANT_01_ID,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // isDescendantOf (strict descendant, not equal)
  // -------------------------------------------------------------------------

  describe('isDescendantOf - strict descendant check', () => {
    it('should return false when IDs are equal', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOf(
        'rt-001',
        'rt-001',
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should return true when child is descendant of parent', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOf(
        'rt-001',
        'rw-001',
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // isRoot
  // -------------------------------------------------------------------------

  describe('isRoot', () => {
    it('should return true for root OrgUnit (parentId = null)', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.org001);

      const result = await reader.isRoot('organization-001', TENANT_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false for non-root OrgUnit', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.cluster001);

      const result = await reader.isRoot('cluster-001', TENANT_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should return error when OrgUnit not found', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(null);

      const result = await reader.isRoot('nonexistent', TENANT_01_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // getOrgUnitPath
  // -------------------------------------------------------------------------

  describe('getOrgUnitPath', () => {
    it('should return path array for existing OrgUnit', async () => {
      mockRepository.getPath = vi.fn().mockResolvedValue(hierarchy.rt001.path);

      const result = await reader.getOrgUnitPath('rt-001', TENANT_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([
          'organization-001',
          'cluster-001',
          'rw-001',
          'rt-001',
        ]);
      }
    });

    it('should return error when OrgUnit not found', async () => {
      mockRepository.getPath = vi.fn().mockResolvedValue(null);

      const result = await reader.getOrgUnitPath('nonexistent', TENANT_01_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // getOrgUnitDepth
  // -------------------------------------------------------------------------

  describe('getOrgUnitDepth', () => {
    it('should return depth for existing OrgUnit', async () => {
      mockRepository.getDepth = vi.fn().mockResolvedValue(hierarchy.rt001.depth);

      const result = await reader.getOrgUnitDepth('rt-001', TENANT_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(3);
      }
    });

    it('should return 0 for root OrgUnit', async () => {
      mockRepository.getDepth = vi.fn().mockResolvedValue(0);

      const result = await reader.getOrgUnitDepth('organization-001', TENANT_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });

    it('should return error when OrgUnit not found', async () => {
      mockRepository.getDepth = vi.fn().mockResolvedValue(null);

      const result = await reader.getOrgUnitDepth('nonexistent', TENANT_01_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // validatePathDepthInvariant (INV-ORG-003)
  // -------------------------------------------------------------------------

  describe('validatePathDepthInvariant (INV-ORG-003)', () => {
    it('should pass when depth = path.length - 1', () => {
      // All hierarchy fixtures should pass
      const result = reader.validatePathDepthInvariant(hierarchy.rt001);

      expect(result.isValid).toBe(true);
      expect(result.failedInvariant).toBeUndefined();
    });

    it('should pass for root OrgUnit with depth=0 and path=[id]', () => {
      const result = reader.validatePathDepthInvariant(hierarchy.org001);

      expect(result.isValid).toBe(true);
    });

    it('should fail when depth does not match path.length - 1', () => {
      const invalidOrgUnit = createOrgUnit({
        depth: 5, // Wrong! path has length 1, so depth should be 0
        path: [RT01_ROOT_ID],
      });

      const result = reader.validatePathDepthInvariant(invalidOrgUnit);

      expect(result.isValid).toBe(false);
      expect(result.failedInvariant).toBe('INV-ORG-003');
      expect(result.errorMessage).toContain('depth=5');
      expect(result.errorMessage).toContain('path.length=1');
    });

    it('should fail when depth is less than expected', () => {
      const invalidOrgUnit: OrgUnit = {
        ...hierarchy.rt001,
        depth: 1, // Wrong! path has 4 elements, depth should be 3
      };

      const result = reader.validatePathDepthInvariant(invalidOrgUnit);

      expect(result.isValid).toBe(false);
      expect(result.failedInvariant).toBe('INV-ORG-003');
    });
  });

  // -------------------------------------------------------------------------
  // validateRootInvariant (INV-ORG-004)
  // -------------------------------------------------------------------------

  describe('validateRootInvariant (INV-ORG-004)', () => {
    it('should pass for valid root OrgUnit', () => {
      const result = reader.validateRootInvariant(hierarchy.org001);

      expect(result.isValid).toBe(true);
    });

    it('should pass for non-root OrgUnit (invariant does not apply)', () => {
      // validateRootInvariant only validates roots (parentId === null)
      const result = reader.validateRootInvariant(hierarchy.cluster001);

      expect(result.isValid).toBe(true);
    });

    it('should fail when root has non-zero depth', () => {
      const invalidRoot = createOrgUnit({
        parentId: null, // Is a root
        depth: 1, // Wrong! Root should have depth=0
        path: [RT01_ROOT_ID],
      });

      const result = reader.validateRootInvariant(invalidRoot);

      expect(result.isValid).toBe(false);
      expect(result.failedInvariant).toBe('INV-ORG-004');
      expect(result.errorMessage).toContain('depth=1');
    });

    it('should fail when root path does not equal [id]', () => {
      const invalidRoot = createOrgUnit({
        parentId: null,
        depth: 0,
        path: ['wrong-id'], // Wrong! Should be [RT01_ROOT_ID]
      });

      const result = reader.validateRootInvariant(invalidRoot);

      expect(result.isValid).toBe(false);
      expect(result.failedInvariant).toBe('INV-ORG-004');
      expect(result.errorMessage).toContain('path=');
    });

    it('should fail when root has multiple items in path', () => {
      const invalidRoot = createOrgUnit({
        parentId: null,
        depth: 0,
        path: [RT01_ROOT_ID, 'extra-id'], // Wrong! Root path should be [id] only
      });

      const result = reader.validateRootInvariant(invalidRoot);

      expect(result.isValid).toBe(false);
      expect(result.failedInvariant).toBe('INV-ORG-004');
    });
  });

  // -------------------------------------------------------------------------
  // validateOrgUnitInvariants (Combined)
  // -------------------------------------------------------------------------

  describe('validateOrgUnitInvariants', () => {
    it('should pass for valid OrgUnit', () => {
      const result = reader.validateOrgUnitInvariants(hierarchy.rt001);

      expect(result.success).toBe(true);
    });

    it('should pass for valid root OrgUnit', () => {
      const result = reader.validateOrgUnitInvariants(hierarchy.org001);

      expect(result.success).toBe(true);
    });

    it('should fail for INV-ORG-003 violation', () => {
      const invalidOrgUnit = createOrgUnit({
        depth: 5,
        path: [RT01_ROOT_ID],
      });

      const result = reader.validateOrgUnitInvariants(invalidOrgUnit);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_INVARIANT_VIOLATION');
      }
    });

    it('should fail for INV-ORG-004 violation', () => {
      const invalidRoot = createOrgUnit({
        parentId: null,
        depth: 1, // Wrong for root
        path: [RT01_ROOT_ID],
      });

      const result = reader.validateOrgUnitInvariants(invalidRoot);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_INVARIANT_VIOLATION');
      }
    });
  });

  // -------------------------------------------------------------------------
  // getAncestors
  // -------------------------------------------------------------------------

  describe('getAncestors', () => {
    it('should return ancestors ordered by depth', async () => {
      const ancestors = [hierarchy.org001, hierarchy.cluster001, hierarchy.rw001];
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.findAncestors = vi.fn().mockResolvedValue(ancestors);

      const result = await reader.getAncestors('rt-001', TENANT_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0]!.id).toBe('organization-001');
        expect(result.data[1]!.id).toBe('cluster-001');
        expect(result.data[2]!.id).toBe('rw-001');
      }
    });

    it('should return empty array for root OrgUnit', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.org001);
      mockRepository.findAncestors = vi.fn().mockResolvedValue([]);

      const result = await reader.getAncestors('organization-001', TENANT_01_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should return error when OrgUnit not found', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(null);
      mockRepository.findAncestors = vi.fn().mockResolvedValue([]);

      const result = await reader.getAncestors('nonexistent', TENANT_01_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property: depth = path.length - 1 for all test OrgUnits
  // -------------------------------------------------------------------------

  describe('Property: depth = path.length - 1', () => {
    it('should hold for all hierarchy fixtures', () => {
      const allOrgUnits = Object.values(hierarchy);

      allOrgUnits.forEach((orgUnit) => {
        const result = reader.validatePathDepthInvariant(orgUnit);
        expect(result.isValid).toBe(true);
        expect(orgUnit.depth).toBe(orgUnit.path.length - 1);
      });
    });

    it('should hold for M2 frozen root OrgUnits', () => {
      const rt01Root = createOrgUnit({
        id: RT01_ROOT_ID,
        parentId: null,
        depth: 0,
        path: [RT01_ROOT_ID],
      });

      const rt02Root = createOrgUnit({
        id: RT02_ROOT_ID,
        tenantId: TENANT_02_ID,
        parentId: null,
        depth: 0,
        path: [RT02_ROOT_ID],
      });

      expect(rt01Root.depth).toBe(rt01Root.path.length - 1);
      expect(rt02Root.depth).toBe(rt02Root.path.length - 1);

      expect(reader.validatePathDepthInvariant(rt01Root).isValid).toBe(true);
      expect(reader.validatePathDepthInvariant(rt02Root).isValid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TPR-02: Policy-Neutral Verification
  // -------------------------------------------------------------------------

  describe('TPR-02: Policy-neutral verification', () => {
    it('isDescendantOrEqual returns boolean, not ALLOW/DENY', async () => {
      mockRepository.findById = vi.fn().mockResolvedValue(hierarchy.rt001);
      mockRepository.exists = vi.fn().mockResolvedValue(true);

      const result = await reader.isDescendantOrEqual(
        'rt-001',
        'rw-001',
        TENANT_01_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data).toBe('boolean');
        // NOT: expect(result.data).toBe('ALLOW')
      }
    });

    it('validation returns structured result, not authorization decision', () => {
      const result = reader.validatePathDepthInvariant(hierarchy.org001);

      expect(result).toHaveProperty('isValid');
      expect(typeof result.isValid).toBe('boolean');
      // NOT: expect(result).toHaveProperty('authorizationDecision')
    });
  });

  // -------------------------------------------------------------------------
  // Tenant Isolation
  // -------------------------------------------------------------------------

  describe('Tenant isolation', () => {
    it('should return error when OrgUnit tenant mismatches requested tenant', async () => {
      const orgUnitInDifferentTenant = createOrgUnit({
        tenantId: TENANT_02_ID, // Different tenant
      });

      mockRepository.findById = vi.fn().mockResolvedValue(orgUnitInDifferentTenant);

      const result = await reader.getOrgUnit(RT01_ROOT_ID, TENANT_01_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_TENANT_MISMATCH');
      }
    });
  });
});
