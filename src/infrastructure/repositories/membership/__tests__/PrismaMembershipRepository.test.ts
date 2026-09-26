/**
 * Unit Tests: PrismaMembershipRepository
 *
 * Tests for FASE 1.6 Task 4: Membership Repository Prisma Adapter
 *
 * These tests verify:
 * - Query construction and filtering
 * - Quarantine exclusion via manifest abstraction
 * - Status-aware reads (TPR-04)
 * - Membership resolution using 3-part key (TPR-03)
 * - Error handling and fail-safe behavior
 *
 * @see Requirements 1 (AC 1-7)
 * @see INV-QUARANTINE-001: Quarantined users excluded from authorization queries
 * @see INV-MEM-002: Tenant-level membership has orgUnitId=NULL
 * @see INV-MEM-003: Org-scoped roles require valid orgUnitId
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { PrismaMembershipRepositoryImpl } from '../PrismaMembershipRepository';
import type { IMembershipRepository } from '@core/domains/membership/repositories';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Quarantined user UUIDs (PNA-01 through PNA-05)
 */
const QUARANTINED_USERS = {
  'PNA-01': '00000000-0000-0000-0000-000000000021',
  'PNA-02': '00000000-0000-0000-0000-000000000022',
  'PNA-03': '00000000-0000-0000-0000-000000000023',
  'PNA-04': '00000000-0000-0000-0000-000000000024',
  'PNA-05': '42cc1bea-9a68-44b1-aadf-1bb0bb609028',
} as const;

/**
 * Test tenant IDs
 */
const TENANT_01 = 'tenant-01-uuid';
const TENANT_02 = 'tenant-02-uuid';

/**
 * Test OrgUnit IDs
 */
const ORGUNIT_RT01 = 'orgunit-rt01-uuid';
const ORGUNIT_RT02 = 'orgunit-rt02-uuid';

/**
 * Normal user UUIDs
 */
const NORMAL_USER_01 = 'user-01-uuid';

/**
 * Sample Prisma membership records for testing
 */
const createPrismaMembership = (overrides: Partial<{
  id: string;
  userId: string;
  tenantId: string;
  orgUnitId: string | null;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
}> = {}) => ({
  id: 'membership-default-uuid',
  userId: NORMAL_USER_01,
  tenantId: TENANT_01,
  orgUnitId: ORGUNIT_RT01,
  role: 'RESIDENT',
  status: 'ACTIVE',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  revokedAt: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

/**
 * Creates a mock PrismaClient with membership model
 */
function createMockPrismaClient() {
  return {
    membership: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  };
}

/**
 * Creates a mock QuarantineManifestService
 */
function createMockQuarantineService(): IQuarantineManifestService {
  const quarantinedIds = new Set(
    Object.values(QUARANTINED_USERS).map((id) => id.toLowerCase()),
  );

  return {
    isQuarantined: vi.fn((userId: string) =>
      quarantinedIds.has(userId.toLowerCase()),
    ),
    getQuarantinedCount: vi.fn(() => 5),
    getManifestVersion: vi.fn(() => '1.0.0'),
    getQuarantinedUserIds: vi.fn(() => Array.from(quarantinedIds)),
    getManifest: vi.fn(() => ({
      version: '1.0.0',
      provenance: {
        source: 'PHASE_1_2A_ANOMALY_AUDIT',
        auditDate: '2026-09-23T05:36:28Z',
        decision: 'L3',
        description: 'Test quarantine manifest',
      },
      invariant: 'INV-QUARANTINE-001',
      invariantDescription: 'Test description',
      expectedCount: 5,
      quarantinedUsers: [],
    })),
  };
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('PrismaMembershipRepository', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let mockQuarantineService: IQuarantineManifestService;
  let repository: IMembershipRepository;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    mockQuarantineService = createMockQuarantineService();
    repository = PrismaMembershipRepositoryImpl({
      prismaClient: mockPrisma as unknown as Parameters<
        typeof PrismaMembershipRepositoryImpl
      >[0]['prismaClient'],
      quarantineService: mockQuarantineService,
    });
  });

  // -------------------------------------------------------------------------
  // findByUserId Tests
  // -------------------------------------------------------------------------

  describe('findByUserId', () => {
    it('should return empty array for quarantined users', async () => {
      const result = await repository.findByUserId(QUARANTINED_USERS['PNA-01']);

      expect(result).toEqual([]);
      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
      expect(mockQuarantineService.isQuarantined).toHaveBeenCalledWith(
        QUARANTINED_USERS['PNA-01'],
      );
    });

    it('should query Prisma for normal users', async () => {
      const prismaMembership = createPrismaMembership();
      mockPrisma.membership.findMany.mockResolvedValue([prismaMembership]);

      const result = await repository.findByUserId(NORMAL_USER_01);

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: NORMAL_USER_01,
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.userId).toBe(NORMAL_USER_01);
    });

    it('should filter by tenantId when provided', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);

      await repository.findByUserId(NORMAL_USER_01, { tenantId: TENANT_01 });

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: NORMAL_USER_01,
          tenantId: TENANT_01,
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should include inactive memberships when includeInactive is true', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);

      await repository.findByUserId(NORMAL_USER_01, { includeInactive: true });

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: NORMAL_USER_01,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should allow quarantine check to be disabled', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);

      await repository.findByUserId(QUARANTINED_USERS['PNA-01'], {
        excludeQuarantined: false,
      });

      expect(mockPrisma.membership.findMany).toHaveBeenCalled();
    });

    it('should map Prisma results to domain entities', async () => {
      const prismaMembership = createPrismaMembership({
        id: 'mem-123',
        role: 'RT_ADMIN',
        status: 'SUSPENDED',
      });
      mockPrisma.membership.findMany.mockResolvedValue([prismaMembership]);

      const result = await repository.findByUserId(NORMAL_USER_01, {
        includeInactive: true,
      });

      expect(result[0]).toMatchObject({
        id: 'mem-123',
        role: MembershipRole.RT_ADMIN,
        status: MembershipStatus.SUSPENDED,
      });
    });

    it('should return empty array on error', async () => {
      mockPrisma.membership.findMany.mockRejectedValue(new Error('DB error'));

      const result = await repository.findByUserId(NORMAL_USER_01);

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // findByUserAndTenant Tests
  // -------------------------------------------------------------------------

  describe('findByUserAndTenant', () => {
    it('should return empty array for quarantined users', async () => {
      const result = await repository.findByUserAndTenant(
        QUARANTINED_USERS['PNA-02'],
        TENANT_01,
      );

      expect(result).toEqual([]);
      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
    });

    it('should return ALL statuses by default', async () => {
      const memberships = [
        createPrismaMembership({ id: 'mem-1', status: 'ACTIVE' }),
        createPrismaMembership({ id: 'mem-2', status: 'SUSPENDED' }),
        createPrismaMembership({ id: 'mem-3', status: 'REVOKED' }),
      ];
      mockPrisma.membership.findMany.mockResolvedValue(memberships);

      const result = await repository.findByUserAndTenant(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: NORMAL_USER_01,
          tenantId: TENANT_01,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(3);
    });

    it('should filter by tenantId', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([]);

      await repository.findByUserAndTenant(NORMAL_USER_01, TENANT_02);

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_02,
          }),
        }),
      );
    });

    it('should return empty array on error', async () => {
      mockPrisma.membership.findMany.mockRejectedValue(new Error('DB connection failed'));

      const result = await repository.findByUserAndTenant(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // findActiveByUserAndTenant Tests
  // -------------------------------------------------------------------------

  describe('findActiveByUserAndTenant', () => {
    it('should only return ACTIVE memberships', async () => {
      const activeMembership = createPrismaMembership({ status: 'ACTIVE' });
      mockPrisma.membership.findMany.mockResolvedValue([activeMembership]);

      await repository.findActiveByUserAndTenant(NORMAL_USER_01, TENANT_01);

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: NORMAL_USER_01,
          tenantId: TENANT_01,
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should exclude quarantined users', async () => {
      const result = await repository.findActiveByUserAndTenant(
        QUARANTINED_USERS['PNA-03'],
        TENANT_01,
      );

      expect(result).toEqual([]);
      expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
    });

    it('should return empty array on error', async () => {
      mockPrisma.membership.findMany.mockRejectedValue(new Error('Database timeout'));

      const result = await repository.findActiveByUserAndTenant(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // findByUserAndTenantWithStatus Tests (TPR-04)
  // -------------------------------------------------------------------------

  describe('findByUserAndTenantWithStatus (TPR-04)', () => {
    it('should return ALL statuses for authoritative reads', async () => {
      const memberships = [
        createPrismaMembership({ status: 'ACTIVE' }),
        createPrismaMembership({ id: 'mem-2', status: 'SUSPENDED' }),
        createPrismaMembership({ id: 'mem-3', status: 'INVITED' }),
        createPrismaMembership({ id: 'mem-4', status: 'REVOKED' }),
      ];
      mockPrisma.membership.findMany.mockResolvedValue(memberships);

      const result = await repository.findByUserAndTenantWithStatus(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(result).toHaveLength(4);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: NORMAL_USER_01,
          tenantId: TENANT_01,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should preserve status field for downstream policy decisions', async () => {
      const suspendedMembership = createPrismaMembership({
        status: 'SUSPENDED',
      });
      mockPrisma.membership.findMany.mockResolvedValue([suspendedMembership]);

      const result = await repository.findByUserAndTenantWithStatus(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(result[0]!.status).toBe(MembershipStatus.SUSPENDED);
    });

    it('should exclude quarantined users', async () => {
      const result = await repository.findByUserAndTenantWithStatus(
        QUARANTINED_USERS['PNA-04'],
        TENANT_01,
      );

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockPrisma.membership.findMany.mockRejectedValue(new Error('Connection refused'));

      const result = await repository.findByUserAndTenantWithStatus(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // resolveMembership Tests (TPR-03)
  // -------------------------------------------------------------------------

  describe('resolveMembership', () => {
    describe('quarantine check', () => {
      it('should return AUTH_USER_QUARANTINED for quarantined users', async () => {
        const result = await repository.resolveMembership({
          userId: QUARANTINED_USERS['PNA-05'],
          activeTenantId: TENANT_01,
          activeOrgUnitId: ORGUNIT_RT01,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_USER_QUARANTINED');
        }
        expect(mockPrisma.membership.findMany).not.toHaveBeenCalled();
      });
    });

    describe('single membership resolution', () => {
      it('should resolve single membership with matching orgUnitId', async () => {
        const membership = createPrismaMembership({
          id: 'mem-single',
          role: 'RESIDENT',
          orgUnitId: ORGUNIT_RT01,
        });
        mockPrisma.membership.findMany.mockResolvedValue([membership]);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: ORGUNIT_RT01,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe('mem-single');
        }
      });

      it('should return AUTH_MEMBERSHIP_CONTEXT_INVALID for orgUnitId mismatch', async () => {
        const membership = createPrismaMembership({
          orgUnitId: ORGUNIT_RT01,
          role: 'RESIDENT',
        });
        mockPrisma.membership.findMany.mockResolvedValue([membership]);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: ORGUNIT_RT02, // Different orgUnit
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_MEMBERSHIP_CONTEXT_INVALID');
        }
      });

      it('should return AUTH_INVALID_SCOPE for org-scoped role with null activeOrgUnitId', async () => {
        const membership = createPrismaMembership({
          role: 'RESIDENT', // Org-scoped role
          orgUnitId: ORGUNIT_RT01,
        });
        mockPrisma.membership.findMany.mockResolvedValue([membership]);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: null, // Tenant-level context requested
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_INVALID_SCOPE');
        }
      });

      it('should resolve tenant-level membership (PLATFORM_ADMIN) with null activeOrgUnitId', async () => {
        const membership = createPrismaMembership({
          id: 'mem-platform',
          role: 'PLATFORM_ADMIN', // Tenant-level role
          orgUnitId: null, // Tenant-level scope
        });
        mockPrisma.membership.findMany.mockResolvedValue([membership]);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: null,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.role).toBe(MembershipRole.PLATFORM_ADMIN);
        }
      });

      it('should resolve tenant-level membership (TENANT_OWNER) with null activeOrgUnitId', async () => {
        const membership = createPrismaMembership({
          role: 'TENANT_OWNER',
          orgUnitId: null,
        });
        mockPrisma.membership.findMany.mockResolvedValue([membership]);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: null,
        });

        expect(result.success).toBe(true);
      });
    });

    describe('no membership found', () => {
      it('should return AUTH_NO_MEMBERSHIP when no memberships exist', async () => {
        mockPrisma.membership.findMany.mockResolvedValue([]);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: ORGUNIT_RT01,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_NO_MEMBERSHIP');
        }
      });
    });

    describe('multiple membership resolution', () => {
      it('should resolve correct membership when activeOrgUnitId distinguishes', async () => {
        const memberships = [
          createPrismaMembership({
            id: 'mem-rt01',
            orgUnitId: ORGUNIT_RT01,
            role: 'RESIDENT',
          }),
          createPrismaMembership({
            id: 'mem-rt02',
            orgUnitId: ORGUNIT_RT02,
            role: 'RT_ADMIN',
          }),
        ];
        mockPrisma.membership.findMany.mockResolvedValue(memberships);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: ORGUNIT_RT02,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe('mem-rt02');
          expect(result.data.orgUnitId).toBe(ORGUNIT_RT02);
        }
      });

      it('should resolve tenant-level membership when null activeOrgUnitId', async () => {
        const memberships = [
          createPrismaMembership({
            id: 'mem-org',
            orgUnitId: ORGUNIT_RT01,
            role: 'RESIDENT',
          }),
          createPrismaMembership({
            id: 'mem-tenant',
            orgUnitId: null,
            role: 'TENANT_OWNER',
          }),
        ];
        mockPrisma.membership.findMany.mockResolvedValue(memberships);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: null,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe('mem-tenant');
        }
      });

      it('should return AUTH_MEMBERSHIP_CONTEXT_INVALID when no matching orgUnitId', async () => {
        const memberships = [
          createPrismaMembership({
            orgUnitId: ORGUNIT_RT01,
            role: 'RESIDENT',
          }),
          createPrismaMembership({
            id: 'mem-2',
            orgUnitId: ORGUNIT_RT02,
            role: 'RESIDENT',
          }),
        ];
        mockPrisma.membership.findMany.mockResolvedValue(memberships);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: 'non-existent-orgunit',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_MEMBERSHIP_CONTEXT_INVALID');
        }
      });

      it('should return AUTH_MEMBERSHIP_CONTEXT_INVALID when null orgUnitId but no tenant-level role', async () => {
        const memberships = [
          createPrismaMembership({
            orgUnitId: ORGUNIT_RT01,
            role: 'RESIDENT',
          }),
          createPrismaMembership({
            id: 'mem-2',
            orgUnitId: ORGUNIT_RT02,
            role: 'RT_ADMIN',
          }),
        ];
        mockPrisma.membership.findMany.mockResolvedValue(memberships);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: null, // No tenant-level membership exists
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_MEMBERSHIP_CONTEXT_INVALID');
        }
      });
    });

    describe('status-aware resolution (TPR-03)', () => {
      it('should query ACTIVE and SUSPENDED memberships', async () => {
        mockPrisma.membership.findMany.mockResolvedValue([]);

        await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: ORGUNIT_RT01,
        });

        expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
          where: {
            userId: NORMAL_USER_01,
            tenantId: TENANT_01,
            status: {
              in: ['ACTIVE', 'SUSPENDED'],
            },
          },
        });
      });

      it('should preserve SUSPENDED status in resolved membership', async () => {
        const suspendedMembership = createPrismaMembership({
          status: 'SUSPENDED',
          orgUnitId: ORGUNIT_RT01,
          role: 'RESIDENT',
        });
        mockPrisma.membership.findMany.mockResolvedValue([suspendedMembership]);

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: ORGUNIT_RT01,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(MembershipStatus.SUSPENDED);
        }
      });
    });

    describe('error handling', () => {
      it('should return technical error on database failure', async () => {
        mockPrisma.membership.findMany.mockRejectedValue(
          new Error('Connection failed'),
        );

        const result = await repository.resolveMembership({
          userId: NORMAL_USER_01,
          activeTenantId: TENANT_01,
          activeOrgUnitId: ORGUNIT_RT01,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('MEMBERSHIP_RESOLUTION_FAILED');
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // isQuarantined Tests
  // -------------------------------------------------------------------------

  describe('isQuarantined', () => {
    it('should delegate to quarantine service', async () => {
      const result = await repository.isQuarantined(QUARANTINED_USERS['PNA-01']);

      expect(result).toBe(true);
      expect(mockQuarantineService.isQuarantined).toHaveBeenCalledWith(
        QUARANTINED_USERS['PNA-01'],
      );
    });

    it('should return false for normal users', async () => {
      const result = await repository.isQuarantined(NORMAL_USER_01);

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // hasActiveMembershipInTenant Tests
  // -------------------------------------------------------------------------

  describe('hasActiveMembershipInTenant', () => {
    it('should return false for quarantined users', async () => {
      const result = await repository.hasActiveMembershipInTenant(
        QUARANTINED_USERS['PNA-01'],
        TENANT_01,
      );

      expect(result).toBe(false);
      expect(mockPrisma.membership.count).not.toHaveBeenCalled();
    });

    it('should return true when active membership exists', async () => {
      mockPrisma.membership.count.mockResolvedValue(1);

      const result = await repository.hasActiveMembershipInTenant(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(result).toBe(true);
      expect(mockPrisma.membership.count).toHaveBeenCalledWith({
        where: {
          userId: NORMAL_USER_01,
          tenantId: TENANT_01,
          status: 'ACTIVE',
        },
      });
    });

    it('should return false when no active membership exists', async () => {
      mockPrisma.membership.count.mockResolvedValue(0);

      const result = await repository.hasActiveMembershipInTenant(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockPrisma.membership.count.mockRejectedValue(new Error('DB error'));

      const result = await repository.hasActiveMembershipInTenant(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // countByUserAndTenant Tests
  // -------------------------------------------------------------------------

  describe('countByUserAndTenant', () => {
    it('should return 0 for quarantined users', async () => {
      const result = await repository.countByUserAndTenant(
        QUARANTINED_USERS['PNA-02'],
        TENANT_01,
      );

      expect(result).toBe(0);
      expect(mockPrisma.membership.count).not.toHaveBeenCalled();
    });

    it('should count only ACTIVE memberships by default', async () => {
      mockPrisma.membership.count.mockResolvedValue(2);

      await repository.countByUserAndTenant(NORMAL_USER_01, TENANT_01);

      expect(mockPrisma.membership.count).toHaveBeenCalledWith({
        where: {
          userId: NORMAL_USER_01,
          tenantId: TENANT_01,
          status: 'ACTIVE',
        },
      });
    });

    it('should count all memberships when includeInactive is true', async () => {
      mockPrisma.membership.count.mockResolvedValue(5);

      await repository.countByUserAndTenant(NORMAL_USER_01, TENANT_01, {
        includeInactive: true,
      });

      expect(mockPrisma.membership.count).toHaveBeenCalledWith({
        where: {
          userId: NORMAL_USER_01,
          tenantId: TENANT_01,
        },
      });
    });

    it('should return 0 on error', async () => {
      mockPrisma.membership.count.mockRejectedValue(new Error('DB error'));

      const result = await repository.countByUserAndTenant(
        NORMAL_USER_01,
        TENANT_01,
      );

      expect(result).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Domain Entity Mapping Tests
  // -------------------------------------------------------------------------

  describe('domain entity mapping', () => {
    it('should map all Prisma fields to domain entity correctly', async () => {
      const prismaMembership = createPrismaMembership({
        id: 'test-id',
        userId: 'test-user',
        tenantId: 'test-tenant',
        orgUnitId: 'test-orgunit',
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
        createdAt: new Date('2024-06-15T10:30:00Z'),
        updatedAt: new Date('2024-06-16T12:00:00Z'),
        revokedAt: null,
      });
      mockPrisma.membership.findMany.mockResolvedValue([prismaMembership]);

      const result = await repository.findByUserId('test-user');

      expect(result[0]).toEqual({
        id: 'test-id',
        userId: 'test-user',
        tenantId: 'test-tenant',
        orgUnitId: 'test-orgunit',
        role: MembershipRole.ORG_ADMIN,
        status: MembershipStatus.ACTIVE,
        createdAt: new Date('2024-06-15T10:30:00Z'),
        updatedAt: new Date('2024-06-16T12:00:00Z'),
        revokedAt: undefined,
      });
    });

    it('should map revokedAt when present', async () => {
      const revokedDate = new Date('2024-07-01');
      const prismaMembership = createPrismaMembership({
        status: 'REVOKED',
        revokedAt: revokedDate,
      });
      mockPrisma.membership.findMany.mockResolvedValue([prismaMembership]);

      const result = await repository.findByUserId(NORMAL_USER_01, {
        includeInactive: true,
      });

      expect(result[0]!.revokedAt).toEqual(revokedDate);
      expect(result[0]!.status).toBe(MembershipStatus.REVOKED);
    });

    it('should map all MembershipRole values correctly', async () => {
      const roles = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'ORG_ADMIN', 'RT_ADMIN', 'SECURITY', 'RESIDENT'];
      const memberships = roles.map((role, i) =>
        createPrismaMembership({ id: `mem-${i}`, role }),
      );
      mockPrisma.membership.findMany.mockResolvedValue(memberships);

      const result = await repository.findByUserId(NORMAL_USER_01);

      const resultRoles = result.map((m) => m.role);
      expect(resultRoles).toContain(MembershipRole.PLATFORM_ADMIN);
      expect(resultRoles).toContain(MembershipRole.TENANT_OWNER);
      expect(resultRoles).toContain(MembershipRole.ORG_ADMIN);
      expect(resultRoles).toContain(MembershipRole.RT_ADMIN);
      expect(resultRoles).toContain(MembershipRole.SECURITY);
      expect(resultRoles).toContain(MembershipRole.RESIDENT);
    });
  });

  // -------------------------------------------------------------------------
  // Property Tests (Invariants)
  // -------------------------------------------------------------------------

  describe('invariant enforcement', () => {
    it('PROPERTY: Active membership count <= total membership count', async () => {
      mockPrisma.membership.count
        .mockResolvedValueOnce(3) // Active count
        .mockResolvedValueOnce(5); // Total count

      const activeCount = await repository.countByUserAndTenant(
        NORMAL_USER_01,
        TENANT_01,
        { includeInactive: false },
      );

      // Reset mock for total count
      mockPrisma.membership.count.mockResolvedValue(5);
      const totalCount = await repository.countByUserAndTenant(
        NORMAL_USER_01,
        TENANT_01,
        { includeInactive: true },
      );

      expect(activeCount).toBeLessThanOrEqual(totalCount);
    });

    it('PROPERTY: Quarantined users always return empty results', async () => {
      for (const userId of Object.values(QUARANTINED_USERS)) {
        const findResult = await repository.findByUserId(userId);
        const tenantResult = await repository.findByUserAndTenant(
          userId,
          TENANT_01,
        );
        const activeResult = await repository.findActiveByUserAndTenant(
          userId,
          TENANT_01,
        );
        const statusResult = await repository.findByUserAndTenantWithStatus(
          userId,
          TENANT_01,
        );
        const hasActive = await repository.hasActiveMembershipInTenant(
          userId,
          TENANT_01,
        );
        const count = await repository.countByUserAndTenant(userId, TENANT_01);

        expect(findResult).toEqual([]);
        expect(tenantResult).toEqual([]);
        expect(activeResult).toEqual([]);
        expect(statusResult).toEqual([]);
        expect(hasActive).toBe(false);
        expect(count).toBe(0);
      }
    });
  });
});

