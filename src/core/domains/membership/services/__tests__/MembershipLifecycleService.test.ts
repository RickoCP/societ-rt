/**
 * Unit tests for MembershipLifecycleService
 *
 * Tests membership lifecycle operations including:
 * - Membership creation with uniqueness enforcement
 * - Status transitions following the state machine
 * - Event emission for audit and downstream systems
 * - Validation of invariants (INV-MEM-001, INV-MEM-002, INV-MEM-003)
 *
 * @see FASE 1.18 Task 50: Membership Lifecycle Management
 * @see Requirements 22 (AC 1-7)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  MembershipLifecycleServiceImpl,
  MembershipEventType,
  type IMembershipLifecycleService,
  type IMembershipEventEmitter,
  type MembershipLifecycleEvent,
} from '../MembershipLifecycleService';
import type { IMembershipRepository, MembershipWriteRepository } from '../../repositories';
import type { IOrgUnitRepository } from '@core/domains/orgunit/repositories';
import type { Membership } from '../../entities';
import { MembershipRole, MembershipStatus } from '../../types';

// ---------------------------------------------------------------------------
// Mock Type Helper
// ---------------------------------------------------------------------------

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K];
};

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

const createMockMembershipRepository = (): Mocked<IMembershipRepository> => ({
  findByUserId: vi.fn(),
  findByUserAndTenant: vi.fn(),
  findActiveByUserAndTenant: vi.fn(),
  findByUserAndTenantWithStatus: vi.fn(),
  resolveMembership: vi.fn(),
  isQuarantined: vi.fn().mockResolvedValue(false),
  hasActiveMembershipInTenant: vi.fn(),
  countByUserAndTenant: vi.fn(),
});

const createMockMembershipWriteRepository = (): Mocked<MembershipWriteRepository> => ({
  create: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
  existsActiveMembership: vi.fn().mockResolvedValue(false),
  countActiveMemberships: vi.fn(),
  delete: vi.fn(),
});

const createMockOrgUnitRepository = (): Mocked<IOrgUnitRepository> => ({
  findById: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  findRoots: vi.fn(),
  findAllInTenant: vi.fn(),
  findChildren: vi.fn(),
  findDescendants: vi.fn(),
  findAncestors: vi.fn(),
  getPath: vi.fn(),
  getDepth: vi.fn(),
});

const createMockEventEmitter = (): Mocked<IMembershipEventEmitter> => ({
  emit: vi.fn().mockResolvedValue(undefined),
});

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

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('MembershipLifecycleService', () => {
  let service: IMembershipLifecycleService;
  let mockMembershipRepository: Mocked<IMembershipRepository>;
  let mockMembershipWriteRepository: Mocked<MembershipWriteRepository>;
  let mockOrgUnitRepository: Mocked<IOrgUnitRepository>;
  let mockEventEmitter: Mocked<IMembershipEventEmitter>;
  let capturedEvents: MembershipLifecycleEvent[];

  beforeEach(() => {
    mockMembershipRepository = createMockMembershipRepository();
    mockMembershipWriteRepository = createMockMembershipWriteRepository();
    mockOrgUnitRepository = createMockOrgUnitRepository();
    mockEventEmitter = createMockEventEmitter();
    capturedEvents = [];

    // Capture emitted events
    mockEventEmitter.emit.mockImplementation(async (event) => {
      capturedEvents.push(event);
    });

    service = MembershipLifecycleServiceImpl({
      membershipRepository: mockMembershipRepository,
      membershipWriteRepository: mockMembershipWriteRepository,
      orgUnitRepository: mockOrgUnitRepository,
      eventEmitter: mockEventEmitter,
    });
  });

  // -------------------------------------------------------------------------
  // Create Membership Tests (Req 22.1, 22.2, 22.6, 22.7)
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('should create a membership with status ACTIVE', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.ACTIVE });
      mockMembershipWriteRepository.create.mockResolvedValue({
        success: true,
        data: membership,
      });

      // Act
      const result = await service.create({
        userId: 'user-001',
        tenantId: 'tenant-001',
        orgUnitId: 'orgunit-001',
        role: MembershipRole.RESIDENT,
        status: MembershipStatus.ACTIVE,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership).toEqual(membership);
        expect(result.data.event.type).toBe(MembershipEventType.CREATED);
        expect(result.data.event.newStatus).toBe(MembershipStatus.ACTIVE);
        expect(result.data.event.oldStatus).toBeNull();
      }
    });

    it('should create a membership with status INVITED (Req 22.1)', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.INVITED });
      mockMembershipWriteRepository.create.mockResolvedValue({
        success: true,
        data: membership,
      });

      // Act
      const result = await service.create({
        userId: 'user-001',
        tenantId: 'tenant-001',
        orgUnitId: 'orgunit-001',
        role: MembershipRole.RESIDENT,
        status: MembershipStatus.INVITED,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.status).toBe(MembershipStatus.INVITED);
      }
    });

    it('should reject invalid initial status (not INVITED or ACTIVE)', async () => {
      // Act
      const result = await service.create({
        userId: 'user-001',
        tenantId: 'tenant-001',
        orgUnitId: 'orgunit-001',
        role: MembershipRole.RESIDENT,
        status: MembershipStatus.SUSPENDED, // Invalid initial status
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INITIAL_STATUS');
      }
    });

    it('should reject duplicate membership (Req 22.2)', async () => {
      // Arrange - existing membership
      mockMembershipWriteRepository.existsActiveMembership.mockResolvedValue(true);

      // Act
      const result = await service.create({
        userId: 'user-001',
        tenantId: 'tenant-001',
        orgUnitId: 'orgunit-001',
        role: MembershipRole.RESIDENT,
        status: MembershipStatus.ACTIVE,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_ALREADY_EXISTS');
      }
    });

    it('should reject quarantined users (INV-QUARANTINE-001)', async () => {
      // Arrange
      mockMembershipRepository.isQuarantined.mockResolvedValue(true);

      // Act
      const result = await service.create({
        userId: 'quarantined-user',
        tenantId: 'tenant-001',
        orgUnitId: 'orgunit-001',
        role: MembershipRole.RESIDENT,
        status: MembershipStatus.ACTIVE,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_USER_QUARANTINED');
      }
    });

    it('should reject when orgUnit does not belong to tenant (Req 22.6)', async () => {
      // Arrange
      mockOrgUnitRepository.exists.mockResolvedValue(false);

      // Act
      const result = await service.create({
        userId: 'user-001',
        tenantId: 'tenant-001',
        orgUnitId: 'invalid-orgunit',
        role: MembershipRole.RESIDENT,
        status: MembershipStatus.ACTIVE,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ORGUNIT_NOT_IN_TENANT');
      }
    });

    it('should emit CREATED event (Req 22.7)', async () => {
      // Arrange
      const membership = createTestMembership();
      mockMembershipWriteRepository.create.mockResolvedValue({
        success: true,
        data: membership,
      });

      // Act
      await service.create({
        userId: 'user-001',
        tenantId: 'tenant-001',
        orgUnitId: 'orgunit-001',
        role: MembershipRole.RESIDENT,
        status: MembershipStatus.ACTIVE,
        performedBy: 'admin-001',
        reason: 'Test creation',
      });

      // Assert
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(capturedEvents[0]).toMatchObject({
        type: MembershipEventType.CREATED,
        membershipId: membership.id,
        userId: membership.userId,
        tenantId: membership.tenantId,
        performedBy: 'admin-001',
        reason: 'Test creation',
      });
    });

    // INV-MEM-002: Tenant-level roles must have null orgUnitId
    it('should reject tenant-level role with non-null orgUnitId (INV-MEM-002)', async () => {
      // Act
      const result = await service.create({
        userId: 'user-001',
        tenantId: 'tenant-001',
        orgUnitId: 'orgunit-001', // Should be null for PLATFORM_ADMIN
        role: MembershipRole.PLATFORM_ADMIN,
        status: MembershipStatus.ACTIVE,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
        expect(result.error.message).toContain('INV-MEM-002');
      }
    });

    // INV-MEM-003: Org-scoped roles require valid orgUnitId
    it('should reject org-scoped role with null orgUnitId (INV-MEM-003)', async () => {
      // Act
      const result = await service.create({
        userId: 'user-001',
        tenantId: 'tenant-001',
        orgUnitId: null, // Should be non-null for RESIDENT
        role: MembershipRole.RESIDENT,
        status: MembershipStatus.ACTIVE,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
        expect(result.error.message).toContain('INV-MEM-003');
      }
    });

    it('should allow tenant-level role with null orgUnitId', async () => {
      // Arrange
      const membership = createTestMembership({
        orgUnitId: null,
        role: MembershipRole.TENANT_OWNER,
      });
      mockMembershipWriteRepository.create.mockResolvedValue({
        success: true,
        data: membership,
      });

      // Act
      const result = await service.create({
        userId: 'user-001',
        tenantId: 'tenant-001',
        orgUnitId: null,
        role: MembershipRole.TENANT_OWNER,
        status: MembershipStatus.ACTIVE,
      });

      // Assert
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Status Transition Tests (Req 22.3)
  // -------------------------------------------------------------------------

  describe('transitionStatus', () => {
    it('should transition INVITED → ACTIVE', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.INVITED });
      const updatedMembership = createTestMembership({ status: MembershipStatus.ACTIVE });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.transitionStatus({
        membershipId: 'membership-001',
        targetStatus: MembershipStatus.ACTIVE,
        tenantId: 'tenant-001',
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.status).toBe(MembershipStatus.ACTIVE);
        expect(result.data.event.type).toBe(MembershipEventType.ACTIVATED);
      }
    });

    it('should transition ACTIVE → SUSPENDED', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.ACTIVE });
      const updatedMembership = createTestMembership({ status: MembershipStatus.SUSPENDED });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.transitionStatus({
        membershipId: 'membership-001',
        targetStatus: MembershipStatus.SUSPENDED,
        tenantId: 'tenant-001',
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event.type).toBe(MembershipEventType.SUSPENDED);
      }
    });

    it('should transition SUSPENDED → ACTIVE (reactivation)', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.SUSPENDED });
      const updatedMembership = createTestMembership({ status: MembershipStatus.ACTIVE });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.transitionStatus({
        membershipId: 'membership-001',
        targetStatus: MembershipStatus.ACTIVE,
        tenantId: 'tenant-001',
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event.type).toBe(MembershipEventType.REACTIVATED);
      }
    });

    it('should transition SUSPENDED → REVOKED', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.SUSPENDED });
      const updatedMembership = createTestMembership({
        status: MembershipStatus.REVOKED,
        revokedAt: new Date(),
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.transitionStatus({
        membershipId: 'membership-001',
        targetStatus: MembershipStatus.REVOKED,
        tenantId: 'tenant-001',
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event.type).toBe(MembershipEventType.REVOKED);
      }
    });

    it('should transition ACTIVE → REVOKED', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.ACTIVE });
      const updatedMembership = createTestMembership({
        status: MembershipStatus.REVOKED,
        revokedAt: new Date(),
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.transitionStatus({
        membershipId: 'membership-001',
        targetStatus: MembershipStatus.REVOKED,
        tenantId: 'tenant-001',
      });

      // Assert
      expect(result.success).toBe(true);
    });

    it('should transition INVITED → REVOKED (cancellation)', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.INVITED });
      const updatedMembership = createTestMembership({
        status: MembershipStatus.REVOKED,
        revokedAt: new Date(),
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.transitionStatus({
        membershipId: 'membership-001',
        targetStatus: MembershipStatus.REVOKED,
        tenantId: 'tenant-001',
      });

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject invalid transition INVITED → SUSPENDED', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.INVITED });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);

      // Act
      const result = await service.transitionStatus({
        membershipId: 'membership-001',
        targetStatus: MembershipStatus.SUSPENDED,
        tenantId: 'tenant-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
      }
    });

    it('should reject transition from REVOKED (terminal state) (Req 22.4)', async () => {
      // Arrange
      const membership = createTestMembership({
        status: MembershipStatus.REVOKED,
        revokedAt: new Date(),
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);

      // Act
      const result = await service.transitionStatus({
        membershipId: 'membership-001',
        targetStatus: MembershipStatus.ACTIVE,
        tenantId: 'tenant-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
      }
    });

    it('should return error for non-existent membership', async () => {
      // Arrange
      mockMembershipWriteRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.transitionStatus({
        membershipId: 'non-existent',
        targetStatus: MembershipStatus.ACTIVE,
        tenantId: 'tenant-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Convenience Method Tests
  // -------------------------------------------------------------------------

  describe('activate', () => {
    it('should activate an INVITED membership', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.INVITED });
      const updatedMembership = createTestMembership({ status: MembershipStatus.ACTIVE });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.activate('membership-001', 'tenant-001', 'admin-001');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.status).toBe(MembershipStatus.ACTIVE);
      }
    });
  });

  describe('suspend', () => {
    it('should suspend an ACTIVE membership', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.ACTIVE });
      const updatedMembership = createTestMembership({ status: MembershipStatus.SUSPENDED });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.suspend(
        'membership-001',
        'tenant-001',
        'Violation of terms',
        'admin-001',
      );

      // Assert
      expect(result.success).toBe(true);
      expect(capturedEvents[0]?.reason).toBe('Violation of terms');
    });
  });

  describe('reactivate', () => {
    it('should reactivate a SUSPENDED membership', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.SUSPENDED });
      const updatedMembership = createTestMembership({ status: MembershipStatus.ACTIVE });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.reactivate('membership-001', 'tenant-001', 'admin-001');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event.type).toBe(MembershipEventType.REACTIVATED);
      }
    });
  });

  describe('revoke', () => {
    it('should revoke an ACTIVE membership with revokedAt timestamp (Req 22.4)', async () => {
      // Arrange
      const membership = createTestMembership({ status: MembershipStatus.ACTIVE });
      const updatedMembership = createTestMembership({
        status: MembershipStatus.REVOKED,
        revokedAt: new Date(),
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipWriteRepository.update.mockResolvedValue({
        success: true,
        data: updatedMembership,
      });

      // Act
      const result = await service.revoke(
        'membership-001',
        'tenant-001',
        'Account termination',
        'admin-001',
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockMembershipWriteRepository.update).toHaveBeenCalledWith(
        'membership-001',
        'tenant-001',
        expect.objectContaining({
          status: MembershipStatus.REVOKED,
          revokedAt: expect.any(Date),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Helper Method Tests
  // -------------------------------------------------------------------------

  describe('existsActiveMembership', () => {
    it('should return true when active membership exists', async () => {
      // Arrange
      mockMembershipWriteRepository.existsActiveMembership.mockResolvedValue(true);

      // Act
      const result = await service.existsActiveMembership('user-001', 'tenant-001', 'orgunit-001');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when no active membership exists', async () => {
      // Arrange
      mockMembershipWriteRepository.existsActiveMembership.mockResolvedValue(false);

      // Act
      const result = await service.existsActiveMembership('user-001', 'tenant-001', 'orgunit-001');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getById', () => {
    it('should return membership when found', async () => {
      // Arrange
      const membership = createTestMembership();
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);

      // Act
      const result = await service.getById('membership-001', 'tenant-001');

      // Assert
      expect(result).toEqual(membership);
    });

    it('should return null when not found', async () => {
      // Arrange
      mockMembershipWriteRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.getById('non-existent', 'tenant-001');

      // Assert
      expect(result).toBeNull();
    });
  });
});
