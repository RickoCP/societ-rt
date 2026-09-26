/**
 * Unit tests for PrismaMembershipWriteRepository
 *
 * Tests write operations for membership lifecycle management:
 * - Membership creation
 * - Status updates
 * - Uniqueness checks
 *
 * @see FASE 1.18 Task 50: Membership Lifecycle Management
 * @see Requirements 22 (AC 1-7)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaMembershipWriteRepositoryImpl } from '../PrismaMembershipWriteRepository';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { MembershipWriteRepository } from '@core/domains/membership/repositories';
import type { CreateMembershipInput } from '@core/domains/membership/entities';

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

const createMockPrismaClient = () => ({
  membership: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
});

const createTestMembershipInput = (
  overrides?: Partial<CreateMembershipInput>,
): CreateMembershipInput => ({
  userId: 'user-001',
  tenantId: 'tenant-001',
  orgUnitId: 'orgunit-001',
  role: MembershipRole.RESIDENT,
  status: MembershipStatus.ACTIVE,
  ...overrides,
});

const createPrismaMembershipRecord = (overrides?: Record<string, unknown>) => ({
  id: 'membership-001',
  userId: 'user-001',
  tenantId: 'tenant-001',
  orgUnitId: 'orgunit-001',
  role: 'RESIDENT',
  status: 'ACTIVE',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  revokedAt: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('PrismaMembershipWriteRepository', () => {
  let repository: MembershipWriteRepository;
  let mockPrismaClient: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    mockPrismaClient = createMockPrismaClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository = PrismaMembershipWriteRepositoryImpl({ prismaClient: mockPrismaClient as any });
  });

  // -------------------------------------------------------------------------
  // Create Tests
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('should create a membership successfully', async () => {
      // Arrange
      const input = createTestMembershipInput();
      const prismaMembership = createPrismaMembershipRecord();
      mockPrismaClient.membership.create.mockResolvedValue(prismaMembership);

      // Act
      const result = await repository.create(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('membership-001');
        expect(result.data.userId).toBe('user-001');
        expect(result.data.status).toBe(MembershipStatus.ACTIVE);
      }
    });

    it('should call Prisma with correct data', async () => {
      // Arrange
      const input = createTestMembershipInput({
        role: MembershipRole.RT_ADMIN,
        status: MembershipStatus.INVITED,
      });
      mockPrismaClient.membership.create.mockResolvedValue(
        createPrismaMembershipRecord({
          role: 'RT_ADMIN',
          status: 'INVITED',
        }),
      );

      // Act
      await repository.create(input);

      // Assert
      expect(mockPrismaClient.membership.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-001',
          tenantId: 'tenant-001',
          orgUnitId: 'orgunit-001',
          role: 'RT_ADMIN',
          status: 'INVITED',
        },
      });
    });

    it('should return error for unique constraint violation', async () => {
      // Arrange
      const input = createTestMembershipInput();
      mockPrismaClient.membership.create.mockRejectedValue(
        new Error('Unique constraint failed on the constraint: `membership_user_tenant_org_key`'),
      );

      // Act
      const result = await repository.create(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_ALREADY_EXISTS');
      }
    });

    it('should return technical error for other database errors', async () => {
      // Arrange
      const input = createTestMembershipInput();
      mockPrismaClient.membership.create.mockRejectedValue(
        new Error('Database connection failed'),
      );

      // Act
      const result = await repository.create(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_CREATE_FAILED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Update Tests
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('should update membership status successfully', async () => {
      // Arrange
      const updatedMembership = createPrismaMembershipRecord({ status: 'SUSPENDED' });
      mockPrismaClient.membership.update.mockResolvedValue(updatedMembership);

      // Act
      const result = await repository.update('membership-001', 'tenant-001', {
        status: MembershipStatus.SUSPENDED,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(MembershipStatus.SUSPENDED);
      }
    });

    it('should include tenantId in WHERE clause for security', async () => {
      // Arrange
      mockPrismaClient.membership.update.mockResolvedValue(createPrismaMembershipRecord());

      // Act
      await repository.update('membership-001', 'tenant-001', {
        status: MembershipStatus.REVOKED,
      });

      // Assert
      expect(mockPrismaClient.membership.update).toHaveBeenCalledWith({
        where: {
          id: 'membership-001',
          tenantId: 'tenant-001',
        },
        data: expect.any(Object),
      });
    });

    it('should set revokedAt when updating to REVOKED status', async () => {
      // Arrange
      const revokedAt = new Date();
      mockPrismaClient.membership.update.mockResolvedValue(
        createPrismaMembershipRecord({ status: 'REVOKED', revokedAt }),
      );

      // Act
      await repository.update('membership-001', 'tenant-001', {
        status: MembershipStatus.REVOKED,
        revokedAt,
      });

      // Assert
      expect(mockPrismaClient.membership.update).toHaveBeenCalledWith({
        where: expect.any(Object),
        data: {
          status: 'REVOKED',
          revokedAt,
        },
      });
    });

    it('should return error when membership not found', async () => {
      // Arrange
      mockPrismaClient.membership.update.mockRejectedValue(
        new Error('Record to update not found'),
      );

      // Act
      const result = await repository.update('non-existent', 'tenant-001', {
        status: MembershipStatus.ACTIVE,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // findById Tests
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('should find membership by ID within tenant', async () => {
      // Arrange
      mockPrismaClient.membership.findFirst.mockResolvedValue(createPrismaMembershipRecord());

      // Act
      const result = await repository.findById('membership-001', 'tenant-001');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe('membership-001');
    });

    it('should include tenantId in query for security', async () => {
      // Arrange
      mockPrismaClient.membership.findFirst.mockResolvedValue(null);

      // Act
      await repository.findById('membership-001', 'tenant-001');

      // Assert
      expect(mockPrismaClient.membership.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'membership-001',
          tenantId: 'tenant-001',
        },
      });
    });

    it('should return null when not found', async () => {
      // Arrange
      mockPrismaClient.membership.findFirst.mockResolvedValue(null);

      // Act
      const result = await repository.findById('non-existent', 'tenant-001');

      // Assert
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // existsActiveMembership Tests
  // -------------------------------------------------------------------------

  describe('existsActiveMembership', () => {
    it('should return true when active membership exists for org-scoped', async () => {
      // Arrange
      mockPrismaClient.membership.count.mockResolvedValue(1);

      // Act
      const result = await repository.existsActiveMembership(
        'user-001',
        'tenant-001',
        'orgunit-001',
      );

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when active membership exists for tenant-level', async () => {
      // Arrange
      mockPrismaClient.membership.count.mockResolvedValue(1);

      // Act
      const result = await repository.existsActiveMembership('user-001', 'tenant-001', null);

      // Assert
      expect(result).toBe(true);
      expect(mockPrismaClient.membership.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-001',
          tenantId: 'tenant-001',
          orgUnitId: null,
          status: 'ACTIVE',
        },
      });
    });

    it('should return false when no active membership exists', async () => {
      // Arrange
      mockPrismaClient.membership.count.mockResolvedValue(0);

      // Act
      const result = await repository.existsActiveMembership(
        'user-001',
        'tenant-001',
        'orgunit-001',
      );

      // Assert
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // countActiveMemberships Tests
  // -------------------------------------------------------------------------

  describe('countActiveMemberships', () => {
    it('should count active memberships', async () => {
      // Arrange
      mockPrismaClient.membership.count.mockResolvedValue(3);

      // Act
      const result = await repository.countActiveMemberships('user-001', 'tenant-001');

      // Assert
      expect(result).toBe(3);
    });

    it('should filter by ACTIVE status only', async () => {
      // Arrange
      mockPrismaClient.membership.count.mockResolvedValue(0);

      // Act
      await repository.countActiveMemberships('user-001', 'tenant-001');

      // Assert
      expect(mockPrismaClient.membership.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-001',
          tenantId: 'tenant-001',
          status: 'ACTIVE',
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // delete Tests
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('should delete membership successfully', async () => {
      // Arrange
      mockPrismaClient.membership.delete.mockResolvedValue(createPrismaMembershipRecord());

      // Act
      const result = await repository.delete('membership-001', 'tenant-001');

      // Assert
      expect(result.success).toBe(true);
    });

    it('should include tenantId in WHERE clause for security', async () => {
      // Arrange
      mockPrismaClient.membership.delete.mockResolvedValue(createPrismaMembershipRecord());

      // Act
      await repository.delete('membership-001', 'tenant-001');

      // Assert
      expect(mockPrismaClient.membership.delete).toHaveBeenCalledWith({
        where: {
          id: 'membership-001',
          tenantId: 'tenant-001',
        },
      });
    });

    it('should return error when membership not found', async () => {
      // Arrange
      mockPrismaClient.membership.delete.mockRejectedValue(
        new Error('Record to delete does not exist'),
      );

      // Act
      const result = await repository.delete('non-existent', 'tenant-001');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_NOT_FOUND');
      }
    });
  });
});
