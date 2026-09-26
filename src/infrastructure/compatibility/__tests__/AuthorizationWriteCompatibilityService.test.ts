/**
 * AuthorizationWriteCompatibilityService Unit Tests
 *
 * Tests for the dual-write service that ensures atomic updates to both
 * legacy (User.role/tenantId) and new (Membership) authorization state.
 *
 * **CRITICAL TEST ASSERTIONS:**
 * - Dual-writes are atomic (transaction consistency)
 * - Quarantine is respected
 * - Role mapping is correct
 * - Failure results in rollback
 *
 * @see Task 24: Pre-Cutover Authorization Write Compatibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAuthorizationWriteCompatibilityService,
  generateCorrelationId,
  DualWriteErrorCodes,
} from '../AuthorizationWriteCompatibilityService';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Mock Services
// ---------------------------------------------------------------------------

const createMockQuarantineService = (
  quarantinedUserIds: string[] = [],
): IQuarantineManifestService => ({
  isQuarantined: vi.fn((userId: string) => quarantinedUserIds.includes(userId)),
  getQuarantinedCount: vi.fn().mockReturnValue(quarantinedUserIds.length),
  getManifestVersion: vi.fn().mockReturnValue('1.0.0'),
  getQuarantinedUserIds: vi.fn().mockReturnValue(quarantinedUserIds),
  getManifest: vi.fn().mockReturnValue({
    version: '1.0.0',
    provenance: { source: 'test' },
    invariant: 'INV-QUARANTINE-001',
    expectedCount: quarantinedUserIds.length,
    quarantinedUsers: [],
  }),
});

const createMockPrismaClient = () => {
  const mockTransaction = vi.fn();
  const mockUserCreate = vi.fn();
  const mockUserUpdate = vi.fn();
  const mockUserFindFirst = vi.fn();
  const mockMembershipCreate = vi.fn();
  const mockMembershipUpdate = vi.fn();
  const mockMembershipFindFirst = vi.fn();

  const mockTx = {
    user: {
      create: mockUserCreate,
      update: mockUserUpdate,
      findFirst: mockUserFindFirst,
    },
    membership: {
      create: mockMembershipCreate,
      update: mockMembershipUpdate,
      findFirst: mockMembershipFindFirst,
    },
  };

  mockTransaction.mockImplementation(async (callback) => {
    return callback(mockTx);
  });

  return {
    $transaction: mockTransaction,
    user: mockTx.user,
    membership: mockTx.membership,
    _mocks: {
      transaction: mockTransaction,
      userCreate: mockUserCreate,
      userUpdate: mockUserUpdate,
      userFindFirst: mockUserFindFirst,
      membershipCreate: mockMembershipCreate,
      membershipUpdate: mockMembershipUpdate,
      membershipFindFirst: mockMembershipFindFirst,
      tx: mockTx,
    },
  } as unknown as PrismaClient & { _mocks: typeof mockTx };
};

describe('AuthorizationWriteCompatibilityService', () => {
  let quarantineService: IQuarantineManifestService;
  let prismaClient: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    quarantineService = createMockQuarantineService();
    prismaClient = createMockPrismaClient();
  });

  describe('createAuthorizationWriteCompatibilityService', () => {
    it('should create a service instance', () => {
      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      expect(service).toBeDefined();
      expect(service.createUserWithMembership).toBeDefined();
      expect(service.updateRoleWithMembership).toBeDefined();
      expect(service.isQuarantined).toBeDefined();
    });
  });

  describe('createUserWithMembership', () => {
    it('should create both User and Membership in single transaction', async () => {
      const mocks = (prismaClient as unknown as { _mocks: ReturnType<typeof createMockPrismaClient>['_mocks'] })._mocks;
      mocks.userCreate.mockResolvedValue({
        id: 'new-user-id',
        tenantId: 'tenant-123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Warga',
      });
      mocks.membershipCreate.mockResolvedValue({
        id: 'new-membership-id',
        userId: 'new-user-id',
        tenantId: 'tenant-123',
        role: 'RESIDENT',
        status: 'ACTIVE',
      });

      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      const result = await service.createUserWithMembership({
        tenantId: 'tenant-123',
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        role: 'Warga',
        orgUnitId: 'orgunit-456',
        actorUserId: 'admin-789',
        correlationId: 'corr-123',
      });

      expect(result.success).toBe(true);
      expect(result.data?.userId).toBe('new-user-id');
      expect(result.data?.membershipId).toBe('new-membership-id');
      expect(result.rolledBack).toBe(false);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
    });

    it('should map legacy role to MembershipRole correctly', async () => {
      const mocks = (prismaClient as unknown as { _mocks: ReturnType<typeof createMockPrismaClient>['_mocks'] })._mocks;
      mocks.userCreate.mockResolvedValue({ id: 'user-id' });
      mocks.membershipCreate.mockResolvedValue({ id: 'membership-id' });

      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      // Test Warga → RESIDENT mapping
      await service.createUserWithMembership({
        tenantId: 'tenant-123',
        name: 'Test',
        email: 'test@example.com',
        passwordHash: 'hash',
        role: 'Warga',
        orgUnitId: null,
        actorUserId: 'admin',
        correlationId: 'corr',
      });

      expect(mocks.membershipCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'RESIDENT',
          }),
        }),
      );
    });

    it('should fail for invalid role mapping', async () => {
      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      const result = await service.createUserWithMembership({
        tenantId: 'tenant-123',
        name: 'Test',
        email: 'test@example.com',
        passwordHash: 'hash',
        role: 'InvalidRole', // Not a valid legacy role
        orgUnitId: null,
        actorUserId: 'admin',
        correlationId: 'corr',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(DualWriteErrorCodes.INVALID_ROLE_MAPPING);
    });

    it('should rollback on transaction failure', async () => {
      const mocks = (prismaClient as unknown as { _mocks: ReturnType<typeof createMockPrismaClient>['_mocks'] })._mocks;
      mocks.transaction.mockRejectedValue(new Error('Database error'));

      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      const result = await service.createUserWithMembership({
        tenantId: 'tenant-123',
        name: 'Test',
        email: 'test@example.com',
        passwordHash: 'hash',
        role: 'Warga',
        orgUnitId: null,
        actorUserId: 'admin',
        correlationId: 'corr',
      });

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.error?.code).toBe(DualWriteErrorCodes.TRANSACTION_FAILED);
    });

    it('should include correlation ID in result', async () => {
      const mocks = (prismaClient as unknown as { _mocks: ReturnType<typeof createMockPrismaClient>['_mocks'] })._mocks;
      mocks.userCreate.mockResolvedValue({ id: 'user-id' });
      mocks.membershipCreate.mockResolvedValue({ id: 'membership-id' });

      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      const correlationId = 'test-correlation-id';
      const result = await service.createUserWithMembership({
        tenantId: 'tenant-123',
        name: 'Test',
        email: 'test@example.com',
        passwordHash: 'hash',
        role: 'Warga',
        orgUnitId: null,
        actorUserId: 'admin',
        correlationId,
      });

      expect(result.correlationId).toBe(correlationId);
    });
  });

  describe('updateRoleWithMembership', () => {
    it('should update both User.role and Membership.role in single transaction', async () => {
      const mocks = (prismaClient as unknown as { _mocks: ReturnType<typeof createMockPrismaClient>['_mocks'] })._mocks;
      mocks.userFindFirst.mockResolvedValue({
        id: 'user-id',
        tenantId: 'tenant-123',
        role: 'Warga',
      });
      mocks.userUpdate.mockResolvedValue({});
      mocks.membershipFindFirst.mockResolvedValue({
        id: 'membership-id',
        userId: 'user-id',
        role: 'RESIDENT',
        status: 'ACTIVE',
      });
      mocks.membershipUpdate.mockResolvedValue({});

      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      const result = await service.updateRoleWithMembership({
        tenantId: 'tenant-123',
        targetUserId: 'user-id',
        newRole: 'Pengurus',
        actorUserId: 'admin',
        correlationId: 'corr',
      });

      expect(result.success).toBe(true);
      expect(result.rolledBack).toBe(false);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
    });

    it('should block quarantined users (INV-QUARANTINE-001)', async () => {
      const quarantinedService = createMockQuarantineService(['quarantined-user-id']);

      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService: quarantinedService,
      });

      const result = await service.updateRoleWithMembership({
        tenantId: 'tenant-123',
        targetUserId: 'quarantined-user-id',
        newRole: 'Pengurus',
        actorUserId: 'admin',
        correlationId: 'corr',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(DualWriteErrorCodes.QUARANTINE_BLOCKED);
      expect(result.error?.message).toContain('quarantined');
    });

    it('should create Membership if none exists (legacy user compatibility)', async () => {
      const mocks = (prismaClient as unknown as { _mocks: ReturnType<typeof createMockPrismaClient>['_mocks'] })._mocks;
      mocks.userFindFirst.mockResolvedValue({
        id: 'user-id',
        tenantId: 'tenant-123',
        role: 'Warga',
      });
      mocks.userUpdate.mockResolvedValue({});
      mocks.membershipFindFirst.mockResolvedValue(null); // No existing membership
      mocks.membershipCreate.mockResolvedValue({
        id: 'new-membership-id',
      });

      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      const result = await service.updateRoleWithMembership({
        tenantId: 'tenant-123',
        targetUserId: 'user-id',
        newRole: 'Pengurus',
        orgUnitId: 'orgunit-456',
        actorUserId: 'admin',
        correlationId: 'corr',
      });

      expect(result.success).toBe(true);
      expect(mocks.membershipCreate).toHaveBeenCalled();
    });

    it('should fail for invalid role mapping', async () => {
      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      const result = await service.updateRoleWithMembership({
        tenantId: 'tenant-123',
        targetUserId: 'user-id',
        newRole: 'NonExistentRole',
        actorUserId: 'admin',
        correlationId: 'corr',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(DualWriteErrorCodes.INVALID_ROLE_MAPPING);
    });

    it('should rollback on transaction failure', async () => {
      const mocks = (prismaClient as unknown as { _mocks: ReturnType<typeof createMockPrismaClient>['_mocks'] })._mocks;
      mocks.transaction.mockRejectedValue(new Error('Database error'));

      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService,
      });

      const result = await service.updateRoleWithMembership({
        tenantId: 'tenant-123',
        targetUserId: 'user-id',
        newRole: 'Pengurus',
        actorUserId: 'admin',
        correlationId: 'corr',
      });

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
    });
  });

  describe('isQuarantined', () => {
    it('should delegate to quarantine service', () => {
      const quarantinedService = createMockQuarantineService(['user-1', 'user-2']);

      const service = createAuthorizationWriteCompatibilityService({
        prismaClient: prismaClient as unknown as PrismaClient,
        quarantineService: quarantinedService,
      });

      expect(service.isQuarantined('user-1')).toBe(true);
      expect(service.isQuarantined('user-2')).toBe(true);
      expect(service.isQuarantined('user-3')).toBe(false);
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate UUID format correlation ID', () => {
      const id = generateCorrelationId();
      expect(id).toBeTruthy();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('DualWriteErrorCodes', () => {
    it('should export all error codes', () => {
      expect(DualWriteErrorCodes.QUARANTINE_BLOCKED).toBe('DUAL_WRITE_QUARANTINE_BLOCKED');
      expect(DualWriteErrorCodes.TRANSACTION_FAILED).toBe('DUAL_WRITE_TRANSACTION_FAILED');
      expect(DualWriteErrorCodes.USER_NOT_FOUND).toBe('DUAL_WRITE_USER_NOT_FOUND');
      expect(DualWriteErrorCodes.MEMBERSHIP_NOT_FOUND).toBe('DUAL_WRITE_MEMBERSHIP_NOT_FOUND');
      expect(DualWriteErrorCodes.INVALID_ROLE_MAPPING).toBe('DUAL_WRITE_INVALID_ROLE_MAPPING');
      expect(DualWriteErrorCodes.ATOMIC_FAILURE).toBe('DUAL_WRITE_ATOMIC_FAILURE');
    });
  });

  describe('Role Mapping Coverage', () => {
    const testCases = [
      { legacy: 'Super_Admin', expected: 'PLATFORM_ADMIN' },
      { legacy: 'Ketua_RT', expected: 'RT_ADMIN' },
      { legacy: 'Pengurus', expected: 'ORG_ADMIN' },
      { legacy: 'Warga', expected: 'RESIDENT' },
      { legacy: 'Security_Guard', expected: 'SECURITY' },
    ];

    for (const { legacy, expected } of testCases) {
      it(`should map ${legacy} to ${expected}`, async () => {
        const mocks = (prismaClient as unknown as { _mocks: ReturnType<typeof createMockPrismaClient>['_mocks'] })._mocks;
        mocks.userCreate.mockResolvedValue({ id: 'user-id' });
        mocks.membershipCreate.mockResolvedValue({ id: 'membership-id' });

        const service = createAuthorizationWriteCompatibilityService({
          prismaClient: prismaClient as unknown as PrismaClient,
          quarantineService,
        });

        await service.createUserWithMembership({
          tenantId: 'tenant-123',
          name: 'Test',
          email: 'test@example.com',
          passwordHash: 'hash',
          role: legacy,
          orgUnitId: null,
          actorUserId: 'admin',
          correlationId: 'corr',
        });

        expect(mocks.membershipCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              role: expected,
            }),
          }),
        );
      });
    }
  });
});
