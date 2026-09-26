/**
 * Unit tests for TenantTransferService
 *
 * Tests tenant ownership transfer flow including:
 * - Transfer initiation by TENANT_OWNER only
 * - Target user validation (exists, not quarantined, not already owner)
 * - Transfer acceptance with re-authentication
 * - Transfer cancellation by initiator
 * - State machine transitions
 * - Audit logging with before/after snapshots
 * - Expiration handling
 *
 * **Validates: Requirements 54 (AC 1-8)**
 *
 * @see FASE 1.18 Task 52: Tenant Transfer Flow
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  TenantTransferServiceImpl,
  TransferAuditEventType,
  type ITenantTransferService,
  type ITransferAuditEmitter,
  type IReauthenticationService,
  type IMembershipQueryService,
  type TransferAuditEvent,
} from '../TenantTransferService';
import type { ITenantTransferRepository } from '../../repositories';
import type { TenantTransfer, InitiateTransferInput } from '../../entities';
import type { Membership } from '@core/domains/membership/entities';
import { TenantTransferStatus } from '../../types';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import { ok, fail, type DomainResult } from '@core/utils';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

const createMockTransferAuditEmitter = (): {
  emitter: ITransferAuditEmitter;
  events: TransferAuditEvent[];
} => {
  const events: TransferAuditEvent[] = [];
  const emitter: ITransferAuditEmitter = {
    emit: vi.fn(async (event: TransferAuditEvent) => {
      events.push(event);
    }),
  };
  return { emitter, events };
};

const createMockReauthService = (): IReauthenticationService => ({
  verifyToken: vi.fn().mockResolvedValue(true),
});

const createMockMembershipQueryService = (): IMembershipQueryService => ({
  findTenantOwnerMembership: vi.fn().mockResolvedValue(null),
  findActiveMembership: vi.fn().mockResolvedValue(null),
  isUserQuarantined: vi.fn().mockResolvedValue(false),
  userExists: vi.fn().mockResolvedValue(true),
});

const createMockTransferRepository = (): ITenantTransferRepository => ({
  create: vi.fn(),
  findById: vi.fn(),
  findPendingByTenant: vi.fn().mockResolvedValue([]),
  findPendingByTargetUser: vi.fn(),
  hasPendingTransfer: vi.fn().mockResolvedValue(false),
  findByTenant: vi.fn().mockResolvedValue([]),
  findExpiredPendingTransfers: vi.fn().mockResolvedValue([]),
  updateStatus: vi.fn(),
  completeTransferAtomic: vi.fn(),
});

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

const createTestMembership = (overrides?: Partial<Membership>): Membership => ({
  id: 'membership-001',
  userId: 'user-001',
  tenantId: 'tenant-001',
  orgUnitId: null,
  role: MembershipRole.TENANT_OWNER,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const createTestTransfer = (overrides?: Partial<TenantTransfer>): TenantTransfer => ({
  id: 'transfer-001',
  tenantId: 'tenant-001',
  initiatorUserId: 'user-owner',
  targetUserId: 'user-target',
  status: TenantTransferStatus.PENDING,
  createdAt: new Date('2024-01-01'),
  expiresAt: new Date('2024-01-02'), // 24 hours later
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('TenantTransferService', () => {
  let service: ITenantTransferService;
  let mockAuditEmitter: { emitter: ITransferAuditEmitter; events: TransferAuditEvent[] };
  let mockReauthService: IReauthenticationService;
  let mockMembershipQueryService: IMembershipQueryService;
  let mockTransferRepository: ITenantTransferRepository;

  beforeEach(() => {
    mockAuditEmitter = createMockTransferAuditEmitter();
    mockReauthService = createMockReauthService();
    mockMembershipQueryService = createMockMembershipQueryService();
    mockTransferRepository = createMockTransferRepository();

    service = TenantTransferServiceImpl({
      transferRepository: mockTransferRepository,
      membershipQueryService: mockMembershipQueryService,
      reauthenticationService: mockReauthService,
      transferAuditEmitter: mockAuditEmitter.emitter,
    });
  });

  // -------------------------------------------------------------------------
  // initiateTransfer Tests (Req 54 AC 1, AC 8)
  // -------------------------------------------------------------------------

  describe('initiateTransfer', () => {
    const validInput: InitiateTransferInput = {
      tenantId: 'tenant-001',
      initiatorUserId: 'user-owner',
      targetUserId: 'user-target',
    };

    beforeEach(() => {
      // Setup default successful mocks
      const ownerMembership = createTestMembership({
        userId: 'user-owner',
        role: MembershipRole.TENANT_OWNER,
      });
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership).mockResolvedValue(
        ownerMembership,
      );
      vi.mocked(mockMembershipQueryService.userExists).mockResolvedValue(true);
      vi.mocked(mockMembershipQueryService.isUserQuarantined).mockResolvedValue(false);
      vi.mocked(mockMembershipQueryService.findActiveMembership).mockResolvedValue(
        createTestMembership({
          userId: 'user-target',
          role: MembershipRole.RESIDENT,
        }),
      );
      vi.mocked(mockTransferRepository.hasPendingTransfer).mockResolvedValue(false);
      vi.mocked(mockTransferRepository.create).mockResolvedValue(
        ok(createTestTransfer()),
      );
    });

    it('should successfully initiate transfer when all validations pass', async () => {
      const result = await service.initiateTransfer(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.initiatorUserId).toBe('user-owner');
        expect(result.data.targetUserId).toBe('user-target');
        expect(result.data.status).toBe(TenantTransferStatus.PENDING);
      }
    });

    it('should emit TRANSFER_INITIATED audit event', async () => {
      await service.initiateTransfer(validInput);

      expect(mockAuditEmitter.events).toHaveLength(1);
      expect(mockAuditEmitter.events[0]?.type).toBe(TransferAuditEventType.TRANSFER_INITIATED);
    });

    it('should fail if initiator is not TENANT_OWNER (Req 54 AC 1)', async () => {
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership).mockResolvedValue(null);

      const result = await service.initiateTransfer(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_NOT_INITIATED_BY_OWNER');
      }
    });

    it('should fail if target user does not exist', async () => {
      vi.mocked(mockMembershipQueryService.userExists).mockResolvedValue(false);

      const result = await service.initiateTransfer(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_TARGET_NOT_FOUND');
      }
    });

    it('should fail if target user is quarantined', async () => {
      vi.mocked(mockMembershipQueryService.isUserQuarantined).mockResolvedValue(true);

      const result = await service.initiateTransfer(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_TARGET_QUARANTINED');
      }
    });

    it('should fail if target user is already TENANT_OWNER', async () => {
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership)
        .mockResolvedValueOnce(createTestMembership({ userId: 'user-owner' })) // First call for initiator
        .mockResolvedValueOnce(createTestMembership({ userId: 'user-target' })); // Second call for target

      const result = await service.initiateTransfer(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_TARGET_ALREADY_OWNER');
      }
    });

    it('should fail if target user has no membership in tenant', async () => {
      vi.mocked(mockMembershipQueryService.findActiveMembership).mockResolvedValue(null);

      const result = await service.initiateTransfer(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_TARGET_NO_MEMBERSHIP');
      }
    });

    it('should fail if there is already a pending transfer', async () => {
      vi.mocked(mockTransferRepository.hasPendingTransfer).mockResolvedValue(true);

      const result = await service.initiateTransfer(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_ALREADY_PENDING');
      }
    });

    it('should fail if trying to transfer to self', async () => {
      const selfTransferInput: InitiateTransferInput = {
        tenantId: 'tenant-001',
        initiatorUserId: 'user-owner',
        targetUserId: 'user-owner', // Same as initiator
      };

      const result = await service.initiateTransfer(selfTransferInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_TO_SELF_NOT_ALLOWED');
      }
    });

    it('should set correct expiry time', async () => {
      const beforeTime = Date.now();
      
      await service.initiateTransfer(validInput);
      
      const afterTime = Date.now();

      // Verify that create was called with an expiresAt roughly 24 hours in the future
      const createCall = vi.mocked(mockTransferRepository.create).mock.calls[0];
      const expiresAt = createCall?.[0]?.expiresAt;
      
      if (expiresAt) {
        const expectedMin = beforeTime + 24 * 60 * 60 * 1000 - 1000; // 24h minus 1s tolerance
        const expectedMax = afterTime + 24 * 60 * 60 * 1000 + 1000; // 24h plus 1s tolerance
        
        expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
        expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
      }
    });

    it('should allow custom expiry duration', async () => {
      const customInput: InitiateTransferInput = {
        ...validInput,
        expiryDurationMs: 1 * 60 * 60 * 1000, // 1 hour
      };

      const beforeTime = Date.now();
      
      await service.initiateTransfer(customInput);
      
      const afterTime = Date.now();

      const createCall = vi.mocked(mockTransferRepository.create).mock.calls[0];
      const expiresAt = createCall?.[0]?.expiresAt;
      
      if (expiresAt) {
        const expectedMin = beforeTime + 1 * 60 * 60 * 1000 - 1000;
        const expectedMax = afterTime + 1 * 60 * 60 * 1000 + 1000;
        
        expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
        expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
      }
    });
  });

  // -------------------------------------------------------------------------
  // acceptTransfer Tests (Req 54 AC 1, AC 2, AC 7)
  // -------------------------------------------------------------------------

  describe('acceptTransfer', () => {
    const validAcceptInput = {
      transferId: 'transfer-001',
      acceptorUserId: 'user-target',
      reauthToken: 'valid-token',
    };

    beforeEach(() => {
      // Setup default successful mocks
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer()),
      );
      vi.mocked(mockReauthService.verifyToken).mockResolvedValue(true);
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership).mockResolvedValue(
        createTestMembership({ userId: 'user-owner' }),
      );
      vi.mocked(mockTransferRepository.updateStatus).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.ACCEPTED })),
      );
      vi.mocked(mockTransferRepository.completeTransferAtomic).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.COMPLETED })),
      );
    });

    it('should successfully accept transfer when all validations pass', async () => {
      const result = await service.acceptTransfer(validAcceptInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(TenantTransferStatus.COMPLETED);
      }
    });

    it('should verify re-authentication token (Req 54 AC 2)', async () => {
      await service.acceptTransfer(validAcceptInput);

      expect(mockReauthService.verifyToken).toHaveBeenCalledWith(
        'user-target',
        'valid-token',
        'TENANT_OWNER_TRANSFER',
      );
    });

    it('should emit TRANSFER_ACCEPTED and TRANSFER_COMPLETED audit events', async () => {
      await service.acceptTransfer(validAcceptInput);

      expect(mockAuditEmitter.events).toHaveLength(2);
      expect(mockAuditEmitter.events[0]?.type).toBe(TransferAuditEventType.TRANSFER_ACCEPTED);
      expect(mockAuditEmitter.events[1]?.type).toBe(TransferAuditEventType.TRANSFER_COMPLETED);
    });

    it('should include before/after state in completion audit (Req 54 AC 7)', async () => {
      // Setup mock for new owner's membership after completion
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership)
        .mockResolvedValueOnce(createTestMembership({ id: 'old-membership', userId: 'user-owner' }))
        .mockResolvedValueOnce(createTestMembership({ id: 'new-membership', userId: 'user-target' }));

      await service.acceptTransfer(validAcceptInput);

      const completionEvent = mockAuditEmitter.events[1];
      expect(completionEvent?.beforeState).toBeDefined();
      expect(completionEvent?.afterState).toBeDefined();
      expect(completionEvent?.beforeState?.ownerUserId).toBe('user-owner');
      expect(completionEvent?.afterState?.ownerUserId).toBe('user-target');
    });

    it('should fail if transfer does not exist', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        fail({ type: 'not_found', code: 'NOT_FOUND', message: 'Not found' }),
      );

      const result = await service.acceptTransfer(validAcceptInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_NOT_FOUND');
      }
    });

    it('should fail if acceptor is not the target user', async () => {
      const wrongUserInput = {
        ...validAcceptInput,
        acceptorUserId: 'wrong-user',
      };

      const result = await service.acceptTransfer(wrongUserInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_NOT_TARGET_USER');
      }
    });

    it('should fail if re-authentication token is invalid (Req 54 AC 2)', async () => {
      vi.mocked(mockReauthService.verifyToken).mockResolvedValue(false);

      const result = await service.acceptTransfer(validAcceptInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_REAUTH_TOKEN');
      }
    });

    it('should fail if transfer is expired', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer({
          expiresAt: new Date('2020-01-01'), // In the past
        })),
      );

      const result = await service.acceptTransfer(validAcceptInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_EXPIRED');
      }
    });

    it('should fail if transfer is already completed', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.COMPLETED })),
      );

      const result = await service.acceptTransfer(validAcceptInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_ALREADY_COMPLETED');
      }
    });

    it('should fail if transfer is cancelled', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.CANCELLED })),
      );

      const result = await service.acceptTransfer(validAcceptInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_CANCELLED');
      }
    });

    it('should fail if transfer status is EXPIRED', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.EXPIRED })),
      );

      const result = await service.acceptTransfer(validAcceptInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_EXPIRED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // cancelTransfer Tests (Req 54 AC 8)
  // -------------------------------------------------------------------------

  describe('cancelTransfer', () => {
    const validCancelInput = {
      transferId: 'transfer-001',
      cancellerUserId: 'user-owner',
      reason: 'Changed my mind',
    };

    beforeEach(() => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer()),
      );
      vi.mocked(mockTransferRepository.updateStatus).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.CANCELLED })),
      );
    });

    it('should successfully cancel transfer when initiator cancels (Req 54 AC 8)', async () => {
      const result = await service.cancelTransfer(validCancelInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(TenantTransferStatus.CANCELLED);
      }
    });

    it('should emit TRANSFER_CANCELLED audit event with reason', async () => {
      await service.cancelTransfer(validCancelInput);

      expect(mockAuditEmitter.events).toHaveLength(1);
      expect(mockAuditEmitter.events[0]?.type).toBe(TransferAuditEventType.TRANSFER_CANCELLED);
      expect(mockAuditEmitter.events[0]?.reason).toBe('Changed my mind');
    });

    it('should fail if canceller is not the initiator', async () => {
      const wrongCancellerInput = {
        ...validCancelInput,
        cancellerUserId: 'user-target', // Target cannot cancel
      };

      const result = await service.cancelTransfer(wrongCancellerInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_NOT_INITIATOR');
      }
    });

    it('should fail if transfer does not exist', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        fail({ type: 'not_found', code: 'NOT_FOUND', message: 'Not found' }),
      );

      const result = await service.cancelTransfer(validCancelInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_NOT_FOUND');
      }
    });

    it('should fail if transfer is not in PENDING status', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.COMPLETED })),
      );

      const result = await service.cancelTransfer(validCancelInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_CANNOT_BE_CANCELLED');
      }
    });

    it('should fail if transfer is already cancelled', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.CANCELLED })),
      );

      const result = await service.cancelTransfer(validCancelInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_CANNOT_BE_CANCELLED');
      }
    });

    it('should allow cancellation without reason', async () => {
      const inputWithoutReason = {
        transferId: 'transfer-001',
        cancellerUserId: 'user-owner',
      };

      const result = await service.cancelTransfer(inputWithoutReason);

      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getTransferStatus Tests
  // -------------------------------------------------------------------------

  describe('getTransferStatus', () => {
    it('should return transfer when it exists', async () => {
      const transfer = createTestTransfer();
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(ok(transfer));

      const result = await service.getTransferStatus('transfer-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('transfer-001');
      }
    });

    it('should return error when transfer does not exist', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        fail({ type: 'not_found', code: 'NOT_FOUND', message: 'Not found' }),
      );

      const result = await service.getTransferStatus('nonexistent');

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getPendingTransfer Tests
  // -------------------------------------------------------------------------

  describe('getPendingTransfer', () => {
    it('should return pending transfer when it exists', async () => {
      const transfer = createTestTransfer();
      vi.mocked(mockTransferRepository.findPendingByTenant).mockResolvedValue([transfer]);

      const result = await service.getPendingTransfer('tenant-001');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('transfer-001');
    });

    it('should return null when no pending transfer exists', async () => {
      vi.mocked(mockTransferRepository.findPendingByTenant).mockResolvedValue([]);

      const result = await service.getPendingTransfer('tenant-001');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // expirePendingTransfers Tests
  // -------------------------------------------------------------------------

  describe('expirePendingTransfers', () => {
    it('should expire all pending transfers that have exceeded time limit', async () => {
      const expiredTransfers = [
        createTestTransfer({ id: 'transfer-001' }),
        createTestTransfer({ id: 'transfer-002' }),
      ];
      vi.mocked(mockTransferRepository.findExpiredPendingTransfers).mockResolvedValue(
        expiredTransfers,
      );
      vi.mocked(mockTransferRepository.updateStatus).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.EXPIRED })),
      );

      const count = await service.expirePendingTransfers();

      expect(count).toBe(2);
      expect(mockTransferRepository.updateStatus).toHaveBeenCalledTimes(2);
    });

    it('should emit TRANSFER_EXPIRED audit event for each expired transfer', async () => {
      const expiredTransfers = [createTestTransfer({ id: 'transfer-001' })];
      vi.mocked(mockTransferRepository.findExpiredPendingTransfers).mockResolvedValue(
        expiredTransfers,
      );
      vi.mocked(mockTransferRepository.updateStatus).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.EXPIRED })),
      );

      await service.expirePendingTransfers();

      expect(mockAuditEmitter.events).toHaveLength(1);
      expect(mockAuditEmitter.events[0]?.type).toBe(TransferAuditEventType.TRANSFER_EXPIRED);
    });

    it('should return 0 when no transfers to expire', async () => {
      vi.mocked(mockTransferRepository.findExpiredPendingTransfers).mockResolvedValue([]);

      const count = await service.expirePendingTransfers();

      expect(count).toBe(0);
    });

    it('should handle partial failures gracefully', async () => {
      const expiredTransfers = [
        createTestTransfer({ id: 'transfer-001' }),
        createTestTransfer({ id: 'transfer-002' }),
      ];
      vi.mocked(mockTransferRepository.findExpiredPendingTransfers).mockResolvedValue(
        expiredTransfers,
      );
      vi.mocked(mockTransferRepository.updateStatus)
        .mockResolvedValueOnce(ok(createTestTransfer({ status: TenantTransferStatus.EXPIRED })))
        .mockResolvedValueOnce(fail({ type: 'technical', code: 'DB_ERROR', message: 'DB error' }));

      const count = await service.expirePendingTransfers();

      expect(count).toBe(1); // Only one succeeded
    });
  });

  // -------------------------------------------------------------------------
  // State Machine Tests
  // -------------------------------------------------------------------------

  describe('State Machine Transitions', () => {
    it('should follow PENDING → ACCEPTED → COMPLETED path on successful acceptance', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.PENDING })),
      );
      vi.mocked(mockReauthService.verifyToken).mockResolvedValue(true);
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership).mockResolvedValue(
        createTestMembership(),
      );
      vi.mocked(mockTransferRepository.updateStatus).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.ACCEPTED })),
      );
      vi.mocked(mockTransferRepository.completeTransferAtomic).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.COMPLETED })),
      );

      const result = await service.acceptTransfer({
        transferId: 'transfer-001',
        acceptorUserId: 'user-target',
        reauthToken: 'valid-token',
      });

      expect(result.success).toBe(true);
      // Verify updateStatus was called for ACCEPTED transition
      expect(mockTransferRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TenantTransferStatus.ACCEPTED,
        }),
      );
      // Verify completeTransferAtomic was called for COMPLETED transition
      expect(mockTransferRepository.completeTransferAtomic).toHaveBeenCalled();
    });

    it('should follow PENDING → CANCELLED path on cancellation', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.PENDING })),
      );
      vi.mocked(mockTransferRepository.updateStatus).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.CANCELLED })),
      );

      const result = await service.cancelTransfer({
        transferId: 'transfer-001',
        cancellerUserId: 'user-owner',
      });

      expect(result.success).toBe(true);
      expect(mockTransferRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TenantTransferStatus.CANCELLED,
        }),
      );
    });

    it('should follow PENDING → EXPIRED path on expiration', async () => {
      const expiredTransfer = createTestTransfer();
      vi.mocked(mockTransferRepository.findExpiredPendingTransfers).mockResolvedValue([
        expiredTransfer,
      ]);
      vi.mocked(mockTransferRepository.updateStatus).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.EXPIRED })),
      );

      await service.expirePendingTransfers();

      expect(mockTransferRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TenantTransferStatus.EXPIRED,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Security Validation Tests
  // -------------------------------------------------------------------------

  describe('Security Validations', () => {
    it('should validate initiator is current TENANT_OWNER before allowing initiation', async () => {
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership).mockResolvedValue(null);

      const result = await service.initiateTransfer({
        tenantId: 'tenant-001',
        initiatorUserId: 'user-not-owner',
        targetUserId: 'user-target',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_NOT_INITIATED_BY_OWNER');
      }
    });

    it('should prevent transfer to quarantined users', async () => {
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership).mockResolvedValue(
        createTestMembership(),
      );
      vi.mocked(mockMembershipQueryService.isUserQuarantined).mockResolvedValue(true);

      const result = await service.initiateTransfer({
        tenantId: 'tenant-001',
        initiatorUserId: 'user-owner',
        targetUserId: 'quarantined-user',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_TARGET_QUARANTINED');
      }
    });

    it('should require re-authentication for acceptance', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer()),
      );
      vi.mocked(mockReauthService.verifyToken).mockResolvedValue(false);

      const result = await service.acceptTransfer({
        transferId: 'transfer-001',
        acceptorUserId: 'user-target',
        reauthToken: 'invalid-token',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_REAUTH_TOKEN');
      }
    });

    it('should only allow initiator to cancel transfer', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer()),
      );

      const result = await service.cancelTransfer({
        transferId: 'transfer-001',
        cancellerUserId: 'someone-else',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_NOT_INITIATOR');
      }
    });

    it('should only allow target user to accept transfer', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer()),
      );

      const result = await service.acceptTransfer({
        transferId: 'transfer-001',
        acceptorUserId: 'someone-else',
        reauthToken: 'token',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TRANSFER_NOT_TARGET_USER');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Audit Logging Tests (Req 54 AC 7)
  // -------------------------------------------------------------------------

  describe('Audit Logging', () => {
    it('should log initiation with correct details', async () => {
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership).mockResolvedValue(
        createTestMembership(),
      );
      vi.mocked(mockMembershipQueryService.userExists).mockResolvedValue(true);
      vi.mocked(mockMembershipQueryService.isUserQuarantined).mockResolvedValue(false);
      vi.mocked(mockMembershipQueryService.findActiveMembership).mockResolvedValue(
        createTestMembership({ role: MembershipRole.RESIDENT }),
      );
      vi.mocked(mockTransferRepository.hasPendingTransfer).mockResolvedValue(false);
      vi.mocked(mockTransferRepository.create).mockResolvedValue(
        ok(createTestTransfer()),
      );

      await service.initiateTransfer({
        tenantId: 'tenant-001',
        initiatorUserId: 'user-owner',
        targetUserId: 'user-target',
      });

      const event = mockAuditEmitter.events[0];
      expect(event?.type).toBe(TransferAuditEventType.TRANSFER_INITIATED);
      expect(event?.tenantId).toBe('tenant-001');
      expect(event?.initiatorUserId).toBe('user-owner');
      expect(event?.targetUserId).toBe('user-target');
      expect(event?.timestamp).toBeInstanceOf(Date);
    });

    it('should log cancellation with reason', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer()),
      );
      vi.mocked(mockTransferRepository.updateStatus).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.CANCELLED })),
      );

      await service.cancelTransfer({
        transferId: 'transfer-001',
        cancellerUserId: 'user-owner',
        reason: 'No longer needed',
      });

      const event = mockAuditEmitter.events[0];
      expect(event?.type).toBe(TransferAuditEventType.TRANSFER_CANCELLED);
      expect(event?.reason).toBe('No longer needed');
    });

    it('should log completion with before/after state snapshots', async () => {
      vi.mocked(mockTransferRepository.findById).mockResolvedValue(
        ok(createTestTransfer()),
      );
      vi.mocked(mockReauthService.verifyToken).mockResolvedValue(true);
      vi.mocked(mockMembershipQueryService.findTenantOwnerMembership)
        .mockResolvedValueOnce(createTestMembership({ id: 'membership-old', userId: 'user-owner' }))
        .mockResolvedValueOnce(createTestMembership({ id: 'membership-new', userId: 'user-target' }));
      vi.mocked(mockTransferRepository.updateStatus).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.ACCEPTED })),
      );
      vi.mocked(mockTransferRepository.completeTransferAtomic).mockResolvedValue(
        ok(createTestTransfer({ status: TenantTransferStatus.COMPLETED })),
      );

      await service.acceptTransfer({
        transferId: 'transfer-001',
        acceptorUserId: 'user-target',
        reauthToken: 'valid-token',
      });

      // Find the completion event
      const completionEvent = mockAuditEmitter.events.find(
        e => e.type === TransferAuditEventType.TRANSFER_COMPLETED,
      );

      expect(completionEvent).toBeDefined();
      expect(completionEvent?.beforeState).toBeDefined();
      expect(completionEvent?.beforeState?.ownerUserId).toBe('user-owner');
      expect(completionEvent?.beforeState?.ownerMembershipId).toBe('membership-old');
      expect(completionEvent?.afterState).toBeDefined();
      expect(completionEvent?.afterState?.ownerUserId).toBe('user-target');
      expect(completionEvent?.afterState?.ownerMembershipId).toBe('membership-new');
    });
  });
});
