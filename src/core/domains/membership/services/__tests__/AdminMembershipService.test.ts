/**
 * Unit tests for AdminMembershipService
 *
 * Tests admin membership management operations including:
 * - Admin role validation (TENANT_OWNER, ORG_ADMIN, RT_ADMIN allowed; others rejected)
 * - Scope validation (tenant-level admin has full scope, org-scoped admin limited to their OrgUnit)
 * - listMemberships with filters and pagination
 * - getMembershipDetails with scope check
 * - updateMembershipStatus (activate, suspend, revoke)
 * - bulkUpdateStatus with partial failures
 * - exportMemberships in JSON and CSV formats
 * - Audit event emission for all operations
 *
 * @see FASE 1.18 Task 54: Admin Membership Management (Req 50)
 * @see Requirements 50 (Admin Membership Management)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  AdminMembershipServiceImpl,
  ADMIN_ROLES,
  MAX_BULK_BATCH_SIZE,
  AdminActionType,
  isAdminRole,
  type IAdminMembershipService,
  type IAdminMembershipAuditEmitter,
  type IAdminMembershipRepository,
  type AdminContext,
  type MembershipFilters,
  type PaginationOptions,
  type PaginatedResult,
  type AdminMembershipAuditEvent,
} from '../AdminMembershipService';
import {
  MembershipEventType,
  type IMembershipLifecycleService,
  type TransitionStatusResult,
  type MembershipLifecycleEvent,
} from '../MembershipLifecycleService';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit/services';
import type { Membership } from '../../entities';
import { MembershipRole, MembershipStatus } from '../../types';
import type { OrgUnit } from '@core/domains/orgunit/entities';
import { ok, fail, businessError } from '@core/utils';

// ---------------------------------------------------------------------------
// Mock Type Helper
// ---------------------------------------------------------------------------

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K];
};

// Extended mock type for OrgUnitHierarchyReader with getDescendantsInclusive
type ExtendedIOrgUnitHierarchyReader = IOrgUnitHierarchyReader & {
  getDescendantsInclusive(orgUnitId: string, tenantId: string): Promise<ReturnType<typeof ok<OrgUnit[]>>>;
};

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

const createTestMembership = (overrides?: Partial<Membership>): Membership => ({
  id: 'membership-001',
  userId: 'user-001',
  tenantId: 'tenant-001',
  orgUnitId: 'orgunit-001',
  role: MembershipRole.RESIDENT,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const createAdminContext = (overrides?: Partial<AdminContext>): AdminContext => ({
  userId: 'admin-user-001',
  membershipId: 'admin-membership-001',
  tenantId: 'tenant-001',
  orgUnitId: null, // Tenant-level admin by default
  role: MembershipRole.TENANT_OWNER,
  ...overrides,
});

const createOrgScopedAdminContext = (overrides?: Partial<AdminContext>): AdminContext =>
  createAdminContext({
    orgUnitId: 'admin-orgunit-001',
    role: MembershipRole.ORG_ADMIN,
    ...overrides,
  });

const createTestOrgUnit = (overrides?: Partial<OrgUnit>): OrgUnit => ({
  id: 'orgunit-001',
  name: 'Test OrgUnit',
  tenantId: 'tenant-001',
  parentId: null,
  path: ['orgunit-001'],
  depth: 0,
  type: 'RT',
  level: 1,
  metadata: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

/**
 * Create a test membership lifecycle event with all required fields.
 */
const createTestLifecycleEvent = (
  membership: Membership,
  type: MembershipEventType,
  oldStatus: MembershipStatus | null,
  newStatus: MembershipStatus,
  overrides?: Partial<MembershipLifecycleEvent>,
): MembershipLifecycleEvent => ({
  type,
  membershipId: membership.id,
  userId: membership.userId,
  tenantId: membership.tenantId,
  orgUnitId: membership.orgUnitId,
  role: membership.role,
  oldStatus,
  newStatus,
  timestamp: new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

const createMockAdminMembershipRepository = (): Mocked<IAdminMembershipRepository> => ({
  findWithFilters: vi.fn(),
  findById: vi.fn(),
  countWithFilters: vi.fn(),
});

const createMockMembershipLifecycleService = (): Mocked<IMembershipLifecycleService> => ({
  create: vi.fn(),
  transitionStatus: vi.fn(),
  activate: vi.fn(),
  suspend: vi.fn(),
  reactivate: vi.fn(),
  revoke: vi.fn(),
  existsActiveMembership: vi.fn(),
  getById: vi.fn(),
});

const createMockOrgUnitHierarchyReader = (): Mocked<ExtendedIOrgUnitHierarchyReader> => ({
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
  getDescendantsInclusive: vi.fn(),
});

const createMockAuditEmitter = (): Mocked<IAdminMembershipAuditEmitter> => ({
  emit: vi.fn().mockResolvedValue(undefined),
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('AdminMembershipService', () => {
  let service: IAdminMembershipService;
  let mockAdminMembershipRepository: Mocked<IAdminMembershipRepository>;
  let mockMembershipLifecycleService: Mocked<IMembershipLifecycleService>;
  let mockOrgUnitHierarchyReader: Mocked<ExtendedIOrgUnitHierarchyReader>;
  let mockAuditEmitter: Mocked<IAdminMembershipAuditEmitter>;
  let capturedAuditEvents: AdminMembershipAuditEvent[];

  beforeEach(() => {
    mockAdminMembershipRepository = createMockAdminMembershipRepository();
    mockMembershipLifecycleService = createMockMembershipLifecycleService();
    mockOrgUnitHierarchyReader = createMockOrgUnitHierarchyReader();
    mockAuditEmitter = createMockAuditEmitter();
    capturedAuditEvents = [];

    // Capture emitted audit events
    mockAuditEmitter.emit.mockImplementation(async (event) => {
      capturedAuditEvents.push(event);
    });

    // Default mock: hierarchy reader returns true for isDescendantOrEqual
    mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));
    mockOrgUnitHierarchyReader.getDescendantsInclusive.mockResolvedValue(
      ok([createTestOrgUnit({ id: 'admin-orgunit-001' })]),
    );

    service = AdminMembershipServiceImpl({
      adminMembershipRepository: mockAdminMembershipRepository,
      membershipLifecycleService: mockMembershipLifecycleService,
      orgUnitHierarchyReader: mockOrgUnitHierarchyReader as unknown as IOrgUnitHierarchyReader,
      auditEmitter: mockAuditEmitter,
    });
  });

  // -------------------------------------------------------------------------
  // Helper Functions Tests
  // -------------------------------------------------------------------------

  describe('isAdminRole', () => {
    it('should return true for TENANT_OWNER', () => {
      expect(isAdminRole(MembershipRole.TENANT_OWNER)).toBe(true);
    });

    it('should return true for ORG_ADMIN', () => {
      expect(isAdminRole(MembershipRole.ORG_ADMIN)).toBe(true);
    });

    it('should return true for RT_ADMIN', () => {
      expect(isAdminRole(MembershipRole.RT_ADMIN)).toBe(true);
    });

    it('should return false for RESIDENT', () => {
      expect(isAdminRole(MembershipRole.RESIDENT)).toBe(false);
    });

    it('should return false for SECURITY', () => {
      expect(isAdminRole(MembershipRole.SECURITY)).toBe(false);
    });

    it('should return false for PLATFORM_ADMIN', () => {
      expect(isAdminRole(MembershipRole.PLATFORM_ADMIN)).toBe(false);
    });
  });

  describe('ADMIN_ROLES constant', () => {
    it('should contain exactly three admin roles', () => {
      expect(ADMIN_ROLES.size).toBe(3);
      expect(ADMIN_ROLES.has(MembershipRole.TENANT_OWNER)).toBe(true);
      expect(ADMIN_ROLES.has(MembershipRole.ORG_ADMIN)).toBe(true);
      expect(ADMIN_ROLES.has(MembershipRole.RT_ADMIN)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Admin Role Validation Tests
  // -------------------------------------------------------------------------

  describe('Admin Role Validation', () => {
    describe('listMemberships', () => {
      it('should reject non-admin role RESIDENT', async () => {
        const adminContext = createAdminContext({ role: MembershipRole.RESIDENT });

        const result = await service.listMemberships(adminContext);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('ADMIN_NOT_AUTHORIZED');
        }
      });

      it('should reject non-admin role SECURITY', async () => {
        const adminContext = createAdminContext({ role: MembershipRole.SECURITY });

        const result = await service.listMemberships(adminContext);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('ADMIN_NOT_AUTHORIZED');
        }
      });

      it('should reject non-admin role PLATFORM_ADMIN', async () => {
        const adminContext = createAdminContext({ role: MembershipRole.PLATFORM_ADMIN });

        const result = await service.listMemberships(adminContext);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('ADMIN_NOT_AUTHORIZED');
        }
      });

      it('should allow TENANT_OWNER', async () => {
        const adminContext = createAdminContext({ role: MembershipRole.TENANT_OWNER });
        const paginatedResult: PaginatedResult<Membership> = {
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        };
        mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

        const result = await service.listMemberships(adminContext);

        expect(result.success).toBe(true);
      });

      it('should allow ORG_ADMIN', async () => {
        const adminContext = createOrgScopedAdminContext({ role: MembershipRole.ORG_ADMIN });
        const paginatedResult: PaginatedResult<Membership> = {
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        };
        mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

        const result = await service.listMemberships(adminContext);

        expect(result.success).toBe(true);
      });

      it('should allow RT_ADMIN', async () => {
        const adminContext = createOrgScopedAdminContext({ role: MembershipRole.RT_ADMIN });
        const paginatedResult: PaginatedResult<Membership> = {
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        };
        mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

        const result = await service.listMemberships(adminContext);

        expect(result.success).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scope Validation Tests
  // -------------------------------------------------------------------------

  describe('Scope Validation', () => {
    describe('tenant-level admin (orgUnitId = null)', () => {
      it('should have full tenant scope', async () => {
        const adminContext = createAdminContext({ orgUnitId: null });
        const membership = createTestMembership({ orgUnitId: 'any-orgunit' });

        const canManage = await service.canManageMembership(adminContext, membership);

        expect(canManage).toBe(true);
      });

      it('should be able to manage tenant-level memberships', async () => {
        const adminContext = createAdminContext({ orgUnitId: null });
        const membership = createTestMembership({ orgUnitId: null });

        const canManage = await service.canManageMembership(adminContext, membership);

        expect(canManage).toBe(true);
      });

      it('should pass null scopeOrgUnitIds to repository for tenant-wide queries', async () => {
        const adminContext = createAdminContext({ orgUnitId: null });
        const paginatedResult: PaginatedResult<Membership> = {
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        };
        mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

        await service.listMemberships(adminContext);

        expect(mockAdminMembershipRepository.findWithFilters).toHaveBeenCalledWith(
          'tenant-001',
          {},
          expect.any(Object),
          null, // scopeOrgUnitIds should be null for tenant-level admin
        );
      });
    });

    describe('org-scoped admin (orgUnitId != null)', () => {
      it('should only manage memberships within their OrgUnit hierarchy', async () => {
        const adminContext = createOrgScopedAdminContext({
          orgUnitId: 'admin-orgunit-001',
        });
        const membership = createTestMembership({ orgUnitId: 'child-orgunit' });

        mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

        const canManage = await service.canManageMembership(adminContext, membership);

        expect(canManage).toBe(true);
        expect(mockOrgUnitHierarchyReader.isDescendantOrEqual).toHaveBeenCalledWith(
          'child-orgunit',
          'admin-orgunit-001',
          'tenant-001',
        );
      });

      it('should NOT be able to manage tenant-level memberships', async () => {
        const adminContext = createOrgScopedAdminContext({
          orgUnitId: 'admin-orgunit-001',
        });
        const membership = createTestMembership({ orgUnitId: null });

        const canManage = await service.canManageMembership(adminContext, membership);

        expect(canManage).toBe(false);
      });

      it('should NOT manage memberships outside their OrgUnit hierarchy', async () => {
        const adminContext = createOrgScopedAdminContext({
          orgUnitId: 'admin-orgunit-001',
        });
        const membership = createTestMembership({ orgUnitId: 'different-branch-orgunit' });

        mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(false));

        const canManage = await service.canManageMembership(adminContext, membership);

        expect(canManage).toBe(false);
      });

      it('should pass scoped OrgUnit IDs to repository', async () => {
        const adminContext = createOrgScopedAdminContext({
          orgUnitId: 'admin-orgunit-001',
        });
        // Note: getDescendantsInclusive is not yet available in IOrgUnitHierarchyReader interface
        // The current implementation only returns the admin's own OrgUnit
        // When descendants lookup is implemented, this test should be updated

        const paginatedResult: PaginatedResult<Membership> = {
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        };
        mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

        await service.listMemberships(adminContext);

        // Currently only passes the admin's own OrgUnit (descendants lookup TODO)
        expect(mockAdminMembershipRepository.findWithFilters).toHaveBeenCalledWith(
          'tenant-001',
          {},
          expect.any(Object),
          ['admin-orgunit-001'],
        );
      });
    });

    describe('cross-tenant access', () => {
      it('should NOT manage memberships from different tenant', async () => {
        const adminContext = createAdminContext({ tenantId: 'tenant-001' });
        const membership = createTestMembership({ tenantId: 'tenant-002' });

        const canManage = await service.canManageMembership(adminContext, membership);

        expect(canManage).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // listMemberships Tests
  // -------------------------------------------------------------------------

  describe('listMemberships', () => {
    it('should return paginated memberships', async () => {
      const adminContext = createAdminContext();
      const memberships = [
        createTestMembership({ id: 'mem-001' }),
        createTestMembership({ id: 'mem-002' }),
      ];
      const paginatedResult: PaginatedResult<Membership> = {
        data: memberships,
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

      const result = await service.listMemberships(adminContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data).toHaveLength(2);
        expect(result.data.total).toBe(2);
      }
    });

    it('should apply filters', async () => {
      const adminContext = createAdminContext();
      const filters: MembershipFilters = {
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.RESIDENT,
      };
      const paginatedResult: PaginatedResult<Membership> = {
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

      await service.listMemberships(adminContext, filters);

      expect(mockAdminMembershipRepository.findWithFilters).toHaveBeenCalledWith(
        'tenant-001',
        filters,
        expect.any(Object),
        null,
      );
    });

    it('should validate and normalize pagination options', async () => {
      const adminContext = createAdminContext();
      const pagination: PaginationOptions = {
        page: 0, // Should be normalized to 1
        pageSize: 500, // Should be capped to 100
      };
      const paginatedResult: PaginatedResult<Membership> = {
        data: [],
        total: 0,
        page: 1,
        pageSize: 100,
        totalPages: 0,
      };
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

      await service.listMemberships(adminContext, {}, pagination);

      expect(mockAdminMembershipRepository.findWithFilters).toHaveBeenCalledWith(
        'tenant-001',
        {},
        expect.objectContaining({
          page: 1,
          pageSize: 100,
        }),
        null,
      );
    });

    it('should emit LIST_MEMBERSHIPS audit event', async () => {
      const adminContext = createAdminContext();
      const paginatedResult: PaginatedResult<Membership> = {
        data: [],
        total: 5,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

      await service.listMemberships(adminContext);

      expect(capturedAuditEvents).toHaveLength(1);
      expect(capturedAuditEvents[0]!.action).toBe(AdminActionType.LIST_MEMBERSHIPS);
      expect(capturedAuditEvents[0]!.adminUserId).toBe(adminContext.userId);
      expect(capturedAuditEvents[0]!.targetMembershipIds).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getMembershipDetails Tests
  // -------------------------------------------------------------------------

  describe('getMembershipDetails', () => {
    it('should return membership details for admin within scope', async () => {
      const adminContext = createAdminContext();
      const membership = createTestMembership();
      mockAdminMembershipRepository.findById.mockResolvedValue(membership);

      const result = await service.getMembershipDetails(adminContext, 'membership-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('membership-001');
      }
    });

    it('should return MEMBERSHIP_NOT_FOUND if membership does not exist', async () => {
      const adminContext = createAdminContext();
      mockAdminMembershipRepository.findById.mockResolvedValue(null);

      const result = await service.getMembershipDetails(adminContext, 'nonexistent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_NOT_FOUND');
      }
    });

    it('should return ADMIN_OUT_OF_SCOPE if membership outside admin scope', async () => {
      const adminContext = createOrgScopedAdminContext({
        orgUnitId: 'admin-orgunit-001',
      });
      const membership = createTestMembership({ orgUnitId: 'different-branch' });
      mockAdminMembershipRepository.findById.mockResolvedValue(membership);
      mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(false));

      const result = await service.getMembershipDetails(adminContext, 'membership-001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ADMIN_OUT_OF_SCOPE');
      }
    });

    it('should emit VIEW_MEMBERSHIP_DETAILS audit event', async () => {
      const adminContext = createAdminContext();
      const membership = createTestMembership();
      mockAdminMembershipRepository.findById.mockResolvedValue(membership);

      await service.getMembershipDetails(adminContext, 'membership-001');

      expect(capturedAuditEvents).toHaveLength(1);
      expect(capturedAuditEvents[0]!.action).toBe(AdminActionType.VIEW_MEMBERSHIP_DETAILS);
      expect(capturedAuditEvents[0]!.targetMembershipIds).toEqual(['membership-001']);
    });
  });

  // -------------------------------------------------------------------------
  // updateMembershipStatus Tests
  // -------------------------------------------------------------------------

  describe('updateMembershipStatus', () => {
    describe('activate', () => {
      it('should activate a membership from INVITED status', async () => {
        const adminContext = createAdminContext();
        const membership = createTestMembership({ status: MembershipStatus.INVITED });
        const activatedMembership = { ...membership, status: MembershipStatus.ACTIVE };
        const transitionResult: TransitionStatusResult = {
          membership: activatedMembership,
          event: createTestLifecycleEvent(
            activatedMembership,
            MembershipEventType.ACTIVATED,
            MembershipStatus.INVITED,
            MembershipStatus.ACTIVE,
          ),
        };

        mockAdminMembershipRepository.findById.mockResolvedValue(membership);
        mockMembershipLifecycleService.activate.mockResolvedValue(ok(transitionResult));

        const result = await service.updateMembershipStatus(
          adminContext,
          'membership-001',
          MembershipStatus.ACTIVE,
        );

        expect(result.success).toBe(true);
        expect(mockMembershipLifecycleService.activate).toHaveBeenCalledWith(
          'membership-001',
          'tenant-001',
          adminContext.userId,
        );
      });

      it('should reactivate a membership from SUSPENDED status', async () => {
        const adminContext = createAdminContext();
        const membership = createTestMembership({ status: MembershipStatus.SUSPENDED });
        const reactivatedMembership = { ...membership, status: MembershipStatus.ACTIVE };
        const transitionResult: TransitionStatusResult = {
          membership: reactivatedMembership,
          event: createTestLifecycleEvent(
            reactivatedMembership,
            MembershipEventType.REACTIVATED,
            MembershipStatus.SUSPENDED,
            MembershipStatus.ACTIVE,
          ),
        };

        mockAdminMembershipRepository.findById.mockResolvedValue(membership);
        mockMembershipLifecycleService.reactivate.mockResolvedValue(ok(transitionResult));

        const result = await service.updateMembershipStatus(
          adminContext,
          'membership-001',
          MembershipStatus.ACTIVE,
        );

        expect(result.success).toBe(true);
        expect(mockMembershipLifecycleService.reactivate).toHaveBeenCalled();
      });
    });

    describe('suspend', () => {
      it('should suspend an active membership', async () => {
        const adminContext = createAdminContext();
        const membership = createTestMembership({ status: MembershipStatus.ACTIVE });
        const suspendedMembership = { ...membership, status: MembershipStatus.SUSPENDED };
        const transitionResult: TransitionStatusResult = {
          membership: suspendedMembership,
          event: createTestLifecycleEvent(
            suspendedMembership,
            MembershipEventType.SUSPENDED,
            MembershipStatus.ACTIVE,
            MembershipStatus.SUSPENDED,
            { reason: 'Policy violation' },
          ),
        };

        mockAdminMembershipRepository.findById.mockResolvedValue(membership);
        mockMembershipLifecycleService.suspend.mockResolvedValue(ok(transitionResult));

        const result = await service.updateMembershipStatus(
          adminContext,
          'membership-001',
          MembershipStatus.SUSPENDED,
          'Policy violation',
        );

        expect(result.success).toBe(true);
        expect(mockMembershipLifecycleService.suspend).toHaveBeenCalledWith(
          'membership-001',
          'tenant-001',
          'Policy violation',
          adminContext.userId,
        );
      });
    });

    describe('revoke', () => {
      it('should revoke a membership', async () => {
        const adminContext = createAdminContext();
        const membership = createTestMembership({ status: MembershipStatus.ACTIVE });
        const revokedMembership = {
          ...membership,
          status: MembershipStatus.REVOKED,
          revokedAt: new Date(),
        };
        const transitionResult: TransitionStatusResult = {
          membership: revokedMembership,
          event: createTestLifecycleEvent(
            revokedMembership,
            MembershipEventType.REVOKED,
            MembershipStatus.ACTIVE,
            MembershipStatus.REVOKED,
            { reason: 'Account termination' },
          ),
        };

        mockAdminMembershipRepository.findById.mockResolvedValue(membership);
        mockMembershipLifecycleService.revoke.mockResolvedValue(ok(transitionResult));

        const result = await service.updateMembershipStatus(
          adminContext,
          'membership-001',
          MembershipStatus.REVOKED,
          'Account termination',
        );

        expect(result.success).toBe(true);
        expect(mockMembershipLifecycleService.revoke).toHaveBeenCalledWith(
          'membership-001',
          'tenant-001',
          'Account termination',
          adminContext.userId,
        );
      });
    });

    it('should emit UPDATE_MEMBERSHIP_STATUS audit event with before/after state', async () => {
      const adminContext = createAdminContext();
      const membership = createTestMembership({ status: MembershipStatus.ACTIVE });
      const suspendedMembership = {
        ...membership,
        status: MembershipStatus.SUSPENDED,
        updatedAt: new Date('2024-06-01'),
      };
      const transitionResult: TransitionStatusResult = {
        membership: suspendedMembership,
        event: createTestLifecycleEvent(
          suspendedMembership,
          MembershipEventType.SUSPENDED,
          MembershipStatus.ACTIVE,
          MembershipStatus.SUSPENDED,
        ),
      };

      mockAdminMembershipRepository.findById.mockResolvedValue(membership);
      mockMembershipLifecycleService.suspend.mockResolvedValue(ok(transitionResult));

      await service.updateMembershipStatus(
        adminContext,
        'membership-001',
        MembershipStatus.SUSPENDED,
        'Test reason',
      );

      expect(capturedAuditEvents).toHaveLength(1);
      expect(capturedAuditEvents[0]!.action).toBe(AdminActionType.UPDATE_MEMBERSHIP_STATUS);
      expect(capturedAuditEvents[0]!.reason).toBe('Test reason');
      expect(capturedAuditEvents[0]!.beforeState).toBeDefined();
      expect(capturedAuditEvents[0]!.afterState).toBeDefined();
    });

    it('should return ADMIN_NOT_AUTHORIZED for non-admin role', async () => {
      const adminContext = createAdminContext({ role: MembershipRole.RESIDENT });

      const result = await service.updateMembershipStatus(
        adminContext,
        'membership-001',
        MembershipStatus.SUSPENDED,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ADMIN_NOT_AUTHORIZED');
      }
    });

    it('should return ADMIN_OUT_OF_SCOPE for membership outside admin scope', async () => {
      const adminContext = createOrgScopedAdminContext({
        orgUnitId: 'admin-orgunit-001',
      });
      const membership = createTestMembership({ orgUnitId: 'different-branch' });
      mockAdminMembershipRepository.findById.mockResolvedValue(membership);
      mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(false));

      const result = await service.updateMembershipStatus(
        adminContext,
        'membership-001',
        MembershipStatus.SUSPENDED,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ADMIN_OUT_OF_SCOPE');
      }
    });
  });

  // -------------------------------------------------------------------------
  // bulkUpdateStatus Tests
  // -------------------------------------------------------------------------

  describe('bulkUpdateStatus', () => {
    it('should reject empty batch', async () => {
      const adminContext = createAdminContext();

      const result = await service.bulkUpdateStatus(adminContext, [], MembershipStatus.SUSPENDED);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_BULK_OPERATION');
      }
    });

    it('should reject batch exceeding MAX_BULK_BATCH_SIZE', async () => {
      const adminContext = createAdminContext();
      const membershipIds = Array.from({ length: MAX_BULK_BATCH_SIZE + 1 }, (_, i) => `mem-${i}`);

      const result = await service.bulkUpdateStatus(
        adminContext,
        membershipIds,
        MembershipStatus.SUSPENDED,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_BULK_OPERATION');
        expect(result.error.message).toContain(String(MAX_BULK_BATCH_SIZE));
      }
    });

    it('should fail completely if all items fail', async () => {
      const adminContext = createAdminContext();
      const membershipIds = ['mem-001', 'mem-002'];

      // Both memberships not found
      mockAdminMembershipRepository.findById.mockResolvedValue(null);

      const result = await service.bulkUpdateStatus(
        adminContext,
        membershipIds,
        MembershipStatus.SUSPENDED,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BULK_OPERATION_PARTIAL_FAILURE');
      }
    });
  });

  // -------------------------------------------------------------------------
  // exportMemberships Tests
  // -------------------------------------------------------------------------

  describe('exportMemberships', () => {
    it('should export memberships as JSON', async () => {
      const adminContext = createAdminContext();
      const memberships = [
        createTestMembership({ id: 'mem-001' }),
        createTestMembership({ id: 'mem-002' }),
      ];
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue({
        data: memberships,
        total: 2,
        page: 1,
        pageSize: 10000,
        totalPages: 1,
      });

      const result = await service.exportMemberships(adminContext, {}, 'json');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe('json');
        expect(result.data.count).toBe(2);
        const parsed = JSON.parse(result.data.data);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].id).toBe('mem-001');
      }
    });

    it('should export memberships as CSV', async () => {
      const adminContext = createAdminContext();
      const memberships = [
        createTestMembership({ id: 'mem-001', userId: 'user-001' }),
      ];
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue({
        data: memberships,
        total: 1,
        page: 1,
        pageSize: 10000,
        totalPages: 1,
      });

      const result = await service.exportMemberships(adminContext, {}, 'csv');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe('csv');
        expect(result.data.count).toBe(1);
        expect(result.data.data).toContain('id,userId,tenantId,orgUnitId,role,status,createdAt,updatedAt,revokedAt');
        expect(result.data.data).toContain('mem-001');
        expect(result.data.data).toContain('user-001');
      }
    });

    it('should apply filters to export', async () => {
      const adminContext = createAdminContext();
      const filters: MembershipFilters = {
        status: MembershipStatus.ACTIVE,
      };
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 10000,
        totalPages: 0,
      });

      await service.exportMemberships(adminContext, filters, 'json');

      expect(mockAdminMembershipRepository.findWithFilters).toHaveBeenCalledWith(
        'tenant-001',
        filters,
        expect.objectContaining({ pageSize: 10000 }),
        null,
      );
    });

    it('should emit EXPORT_MEMBERSHIPS audit event', async () => {
      const adminContext = createAdminContext();
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 10000,
        totalPages: 0,
      });

      await service.exportMemberships(adminContext, {}, 'json');

      expect(capturedAuditEvents).toHaveLength(1);
      expect(capturedAuditEvents[0]!.action).toBe(AdminActionType.EXPORT_MEMBERSHIPS);
      expect(capturedAuditEvents[0]!.targetMembershipIds).toBeNull();
      expect(capturedAuditEvents[0]!.metadata?.format).toBe('json');
    });

    it('should default to JSON format if not specified', async () => {
      const adminContext = createAdminContext();
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 10000,
        totalPages: 0,
      });

      const result = await service.exportMemberships(adminContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe('json');
      }
    });
  });

  // -------------------------------------------------------------------------
  // canManageMembership Tests
  // -------------------------------------------------------------------------

  describe('canManageMembership', () => {
    it('should return false for non-admin roles', async () => {
      const adminContext = createAdminContext({ role: MembershipRole.RESIDENT });
      const membership = createTestMembership();

      const canManage = await service.canManageMembership(adminContext, membership);

      expect(canManage).toBe(false);
    });

    it('should return false for different tenant', async () => {
      const adminContext = createAdminContext({ tenantId: 'tenant-001' });
      const membership = createTestMembership({ tenantId: 'tenant-002' });

      const canManage = await service.canManageMembership(adminContext, membership);

      expect(canManage).toBe(false);
    });

    it('should return true for tenant-level admin with any membership', async () => {
      const adminContext = createAdminContext({ orgUnitId: null });
      const membership = createTestMembership();

      const canManage = await service.canManageMembership(adminContext, membership);

      expect(canManage).toBe(true);
    });

    it('should check hierarchy for org-scoped admin', async () => {
      const adminContext = createOrgScopedAdminContext({
        orgUnitId: 'admin-orgunit',
      });
      const membership = createTestMembership({ orgUnitId: 'child-orgunit' });

      mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(ok(true));

      const canManage = await service.canManageMembership(adminContext, membership);

      expect(canManage).toBe(true);
      expect(mockOrgUnitHierarchyReader.isDescendantOrEqual).toHaveBeenCalledWith(
        'child-orgunit',
        'admin-orgunit',
        'tenant-001',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle lifecycle service transition failures', async () => {
      const adminContext = createAdminContext();
      const membership = createTestMembership({ status: MembershipStatus.ACTIVE });
      mockAdminMembershipRepository.findById.mockResolvedValue(membership);
      mockMembershipLifecycleService.suspend.mockResolvedValue(
        fail(businessError('INVALID_STATUS_TRANSITION', 'Cannot transition from ACTIVE status')),
      );

      const result = await service.updateMembershipStatus(
        adminContext,
        'membership-001',
        MembershipStatus.SUSPENDED,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
      }
    });

    it('should handle hierarchy reader failures gracefully in scope check', async () => {
      const adminContext = createOrgScopedAdminContext({
        orgUnitId: 'admin-orgunit',
      });
      
      // Simulate hierarchy reader returning failure
      mockOrgUnitHierarchyReader.getDescendantsInclusive.mockResolvedValue(
        fail(businessError('ORGUNIT_NOT_FOUND', 'OrgUnit not found')),
      );

      const paginatedResult: PaginatedResult<Membership> = {
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue(paginatedResult);

      const result = await service.listMemberships(adminContext);

      // Should still succeed but with fallback scope (just admin's OrgUnit)
      expect(result.success).toBe(true);
      expect(mockAdminMembershipRepository.findWithFilters).toHaveBeenCalledWith(
        'tenant-001',
        {},
        expect.any(Object),
        ['admin-orgunit'], // Fallback to just admin's OrgUnit
      );
    });

    it('should include generatedAt timestamp in export', async () => {
      const adminContext = createAdminContext();
      mockAdminMembershipRepository.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 10000,
        totalPages: 0,
      });

      const beforeTime = new Date();
      const result = await service.exportMemberships(adminContext);
      const afterTime = new Date();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.generatedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        expect(result.data.generatedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      }
    });
  });
});
