/**
 * Unit tests for MembershipInvitationService
 *
 * Tests membership invitation lifecycle operations including:
 * - Creating invitations with delegation validation
 * - Accepting invitations (token validation, membership activation)
 * - Revoking invitations
 * - Resending invitations with new tokens
 * - Batch expiry handling
 *
 * @see FASE 1.18 Task 53: Membership Invitation Flow
 * @see Requirements 22 (AC 1-7), 25 (AC 1-9)
 * @see Design D7: Invitation expiry default (7 days)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  MembershipInvitationServiceImpl,
  InvitationEventType,
  type IMembershipInvitationService,
  type IInvitationEventEmitter,
  type InvitationLifecycleEvent,
  hashToken,
} from '../MembershipInvitationService';
import type { IMembershipInvitationRepository } from '../../repositories';
import type { IMembershipLifecycleService } from '../MembershipLifecycleService';
import type { IDelegationMatrixService } from '../DelegationMatrixService';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit/services';
import type { Membership, MembershipInvitation } from '../../entities';
import { MembershipInvitationStatus } from '../../entities';
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

const createMockInvitationRepository = (): Mocked<IMembershipInvitationRepository> => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByTokenHash: vi.fn(),
  existsPendingInvitation: vi.fn().mockResolvedValue(false),
  update: vi.fn(),
  updateToken: vi.fn(),
  findExpiredPending: vi.fn().mockResolvedValue([]),
  bulkUpdateStatus: vi.fn().mockResolvedValue(0),
  findByTenant: vi.fn(),
  findByMembership: vi.fn(),
  delete: vi.fn(),
});

const createMockMembershipLifecycleService = (): Mocked<IMembershipLifecycleService> => ({
  create: vi.fn(),
  activate: vi.fn(),
  suspend: vi.fn(),
  reactivate: vi.fn(),
  revoke: vi.fn(),
  transitionStatus: vi.fn(),
  existsActiveMembership: vi.fn(),
  getById: vi.fn(),
});

const createMockDelegationMatrixService = (): Mocked<IDelegationMatrixService> => ({
  validateDelegation: vi.fn().mockReturnValue({
    success: true,
    data: { allowed: true, reason: 'Delegation allowed' },
  }),
  canDelegateRole: vi.fn().mockReturnValue(true),
  getAssignableRoles: vi.fn(),
});

const createMockOrgUnitHierarchyReader = (): Mocked<IOrgUnitHierarchyReader> => ({
  isDescendantOrEqual: vi.fn().mockResolvedValue({ success: true, data: true }),
  getPath: vi.fn(),
  getDepth: vi.fn(),
  findAncestors: vi.fn(),
  findDescendants: vi.fn(),
});

const createMockEventEmitter = (): Mocked<IInvitationEventEmitter> => ({
  emit: vi.fn().mockResolvedValue(undefined),
});

const createMockMembershipWriteRepository = () => ({
  findById: vi.fn(),
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

const createTestInvitation = (overrides?: Partial<MembershipInvitation>): MembershipInvitation => ({
  id: 'invitation-001',
  membershipId: 'membership-001',
  tenantId: 'tenant-001',
  inviterUserId: 'inviter-001',
  inviterMembershipId: 'inviter-membership-001',
  tokenHash: 'hashed-token-value',
  status: MembershipInvitationStatus.PENDING,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  invitedEmail: 'invited@example.com',
  invitedUserId: undefined,
  acceptedAt: undefined,
  revokedAt: undefined,
  revokedBy: undefined,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('MembershipInvitationService', () => {
  let service: IMembershipInvitationService;
  let mockInvitationRepository: Mocked<IMembershipInvitationRepository>;
  let mockMembershipLifecycleService: Mocked<IMembershipLifecycleService>;
  let mockDelegationMatrixService: Mocked<IDelegationMatrixService>;
  let mockOrgUnitHierarchyReader: Mocked<IOrgUnitHierarchyReader>;
  let mockEventEmitter: Mocked<IInvitationEventEmitter>;
  let mockMembershipWriteRepository: ReturnType<typeof createMockMembershipWriteRepository>;
  let capturedEvents: InvitationLifecycleEvent[];

  beforeEach(() => {
    mockInvitationRepository = createMockInvitationRepository();
    mockMembershipLifecycleService = createMockMembershipLifecycleService();
    mockDelegationMatrixService = createMockDelegationMatrixService();
    mockOrgUnitHierarchyReader = createMockOrgUnitHierarchyReader();
    mockEventEmitter = createMockEventEmitter();
    mockMembershipWriteRepository = createMockMembershipWriteRepository();
    capturedEvents = [];

    // Capture emitted events
    mockEventEmitter.emit.mockImplementation(async (event) => {
      capturedEvents.push(event);
    });

    service = MembershipInvitationServiceImpl({
      membershipInvitationRepository: mockInvitationRepository,
      membershipLifecycleService: mockMembershipLifecycleService,
      delegationMatrixService: mockDelegationMatrixService,
      orgUnitHierarchyReader: mockOrgUnitHierarchyReader,
      invitationEventEmitter: mockEventEmitter,
      membershipWriteRepository: mockMembershipWriteRepository,
    });
  });

  // -------------------------------------------------------------------------
  // Create Invitation Tests (Req 25 AC 1-3)
  // -------------------------------------------------------------------------

  describe('createInvitation', () => {
    it('should create an invitation when inviter is authorized (Req 25 AC 1)', async () => {
      // Arrange
      const inviterMembership = createTestMembership({
        id: 'inviter-membership-001',
        userId: 'inviter-001',
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.KETUA_RT,
        orgUnitId: 'orgunit-001',
      });
      const createdMembership = createTestMembership({
        id: 'new-membership-001',
        userId: '',
        status: MembershipStatus.INVITED,
      });
      const createdInvitation = createTestInvitation({
        membershipId: 'new-membership-001',
      });

      mockMembershipWriteRepository.findById.mockResolvedValue(inviterMembership);
      mockMembershipLifecycleService.create.mockResolvedValue({
        success: true,
        data: { membership: createdMembership, event: {} as any },
      });
      mockInvitationRepository.create.mockResolvedValue({
        success: true,
        data: createdInvitation,
      });

      // Act
      const result = await service.createInvitation({
        inviterUserId: 'inviter-001',
        inviterMembershipId: 'inviter-membership-001',
        tenantId: 'tenant-001',
        invitedEmail: 'invited@example.com',
        role: MembershipRole.RESIDENT,
        orgUnitId: 'orgunit-001',
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.invitation).toEqual(createdInvitation);
        expect(result.data.membership).toEqual(createdMembership);
        expect(result.data.token).toBeDefined();
        expect(result.data.token.length).toBeGreaterThan(0);
      }
    });

    it('should emit CREATED event on successful invitation', async () => {
      // Arrange
      const inviterMembership = createTestMembership({
        id: 'inviter-membership-001',
        userId: 'inviter-001',
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.KETUA_RT,
        orgUnitId: 'orgunit-001',
      });
      const createdMembership = createTestMembership({ status: MembershipStatus.INVITED });
      const createdInvitation = createTestInvitation();

      mockMembershipWriteRepository.findById.mockResolvedValue(inviterMembership);
      mockMembershipLifecycleService.create.mockResolvedValue({
        success: true,
        data: { membership: createdMembership, event: {} as any },
      });
      mockInvitationRepository.create.mockResolvedValue({
        success: true,
        data: createdInvitation,
      });

      // Act
      await service.createInvitation({
        inviterUserId: 'inviter-001',
        inviterMembershipId: 'inviter-membership-001',
        tenantId: 'tenant-001',
        invitedEmail: 'invited@example.com',
        role: MembershipRole.RESIDENT,
        orgUnitId: 'orgunit-001',
      });

      // Assert
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(capturedEvents[0]?.type).toBe(InvitationEventType.CREATED);
    });

    it('should reject when inviter membership is not ACTIVE (Req 25 AC 8)', async () => {
      // Arrange
      const inviterMembership = createTestMembership({
        status: MembershipStatus.SUSPENDED, // Not ACTIVE
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(inviterMembership);

      // Act
      const result = await service.createInvitation({
        inviterUserId: 'inviter-001',
        inviterMembershipId: 'inviter-membership-001',
        tenantId: 'tenant-001',
        invitedEmail: 'invited@example.com',
        role: MembershipRole.RESIDENT,
        orgUnitId: 'orgunit-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITER_MEMBERSHIP_NOT_ACTIVE');
      }
    });

    it('should reject when inviter membership not found', async () => {
      // Arrange
      mockMembershipWriteRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.createInvitation({
        inviterUserId: 'inviter-001',
        inviterMembershipId: 'non-existent',
        tenantId: 'tenant-001',
        invitedEmail: 'invited@example.com',
        role: MembershipRole.RESIDENT,
        orgUnitId: 'orgunit-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITER_MEMBERSHIP_NOT_ACTIVE');
      }
    });

    it('should reject when delegation matrix disallows role assignment (Req 25 AC 2)', async () => {
      // Arrange
      const inviterMembership = createTestMembership({
        id: 'inviter-membership-001',
        userId: 'inviter-001',
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.RESIDENT, // RESIDENT cannot delegate to others
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(inviterMembership);
      mockDelegationMatrixService.validateDelegation.mockReturnValue({
        success: true,
        data: { allowed: false, reason: 'RESIDENT cannot delegate roles' },
      });

      // Act
      const result = await service.createInvitation({
        inviterUserId: 'inviter-001',
        inviterMembershipId: 'inviter-membership-001',
        tenantId: 'tenant-001',
        invitedEmail: 'invited@example.com',
        role: MembershipRole.KETUA_RT,
        orgUnitId: 'orgunit-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITER_NOT_AUTHORIZED');
      }
    });

    it('should reject when target OrgUnit is outside inviter scope (Req 25 AC 1)', async () => {
      // Arrange
      const inviterMembership = createTestMembership({
        id: 'inviter-membership-001',
        userId: 'inviter-001',
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.KETUA_RT,
        orgUnitId: 'orgunit-001', // Inviter's scope
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(inviterMembership);
      mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue({
        success: true,
        data: false, // Target is NOT in inviter's scope
      });

      // Act
      const result = await service.createInvitation({
        inviterUserId: 'inviter-001',
        inviterMembershipId: 'inviter-membership-001',
        tenantId: 'tenant-001',
        invitedEmail: 'invited@example.com',
        role: MembershipRole.RESIDENT,
        orgUnitId: 'other-orgunit', // Different OrgUnit
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITER_OUT_OF_SCOPE');
      }
    });

    it('should reject when pending invitation already exists', async () => {
      // Arrange
      const inviterMembership = createTestMembership({
        id: 'inviter-membership-001',
        userId: 'inviter-001',
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.KETUA_RT,
        orgUnitId: 'orgunit-001',
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(inviterMembership);
      mockInvitationRepository.existsPendingInvitation.mockResolvedValue(true);

      // Act
      const result = await service.createInvitation({
        inviterUserId: 'inviter-001',
        inviterMembershipId: 'inviter-membership-001',
        tenantId: 'tenant-001',
        invitedEmail: 'invited@example.com',
        role: MembershipRole.RESIDENT,
        orgUnitId: 'orgunit-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_ALREADY_EXISTS');
      }
    });

    it('should allow tenant-level admin to invite to any orgUnit', async () => {
      // Arrange
      const inviterMembership = createTestMembership({
        id: 'inviter-membership-001',
        userId: 'inviter-001',
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.TENANT_OWNER,
        orgUnitId: null, // Tenant-level membership
      });
      const createdMembership = createTestMembership({ status: MembershipStatus.INVITED });
      const createdInvitation = createTestInvitation();

      mockMembershipWriteRepository.findById.mockResolvedValue(inviterMembership);
      mockMembershipLifecycleService.create.mockResolvedValue({
        success: true,
        data: { membership: createdMembership, event: {} as any },
      });
      mockInvitationRepository.create.mockResolvedValue({
        success: true,
        data: createdInvitation,
      });

      // Act
      const result = await service.createInvitation({
        inviterUserId: 'inviter-001',
        inviterMembershipId: 'inviter-membership-001',
        tenantId: 'tenant-001',
        invitedEmail: 'invited@example.com',
        role: MembershipRole.RESIDENT,
        orgUnitId: 'any-orgunit',
      });

      // Assert
      expect(result.success).toBe(true);
      // Should not call isDescendantOrEqual for tenant-level inviters
    });

    it('should reject org-scoped inviter trying to create tenant-level invitation', async () => {
      // Arrange
      const inviterMembership = createTestMembership({
        id: 'inviter-membership-001',
        userId: 'inviter-001',
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.KETUA_RT,
        orgUnitId: 'orgunit-001', // Org-scoped
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(inviterMembership);

      // Act
      const result = await service.createInvitation({
        inviterUserId: 'inviter-001',
        inviterMembershipId: 'inviter-membership-001',
        tenantId: 'tenant-001',
        invitedEmail: 'invited@example.com',
        role: MembershipRole.TENANT_OWNER, // Tenant-level role
        orgUnitId: null, // Tenant-level target
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITER_OUT_OF_SCOPE');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Accept Invitation Tests (Req 25 AC 4-6)
  // -------------------------------------------------------------------------

  describe('acceptInvitation', () => {
    it('should accept a valid invitation and activate membership', async () => {
      // Arrange
      const rawToken = 'test-invitation-token';
      const invitation = createTestInvitation({
        tokenHash: hashToken(rawToken),
        status: MembershipInvitationStatus.PENDING,
      });
      const invitedMembership = createTestMembership({
        id: 'membership-001',
        status: MembershipStatus.INVITED,
      });
      const activatedMembership = createTestMembership({
        id: 'membership-001',
        status: MembershipStatus.ACTIVE,
      });

      mockInvitationRepository.findByTokenHash.mockResolvedValue(invitation);
      mockMembershipWriteRepository.findById.mockResolvedValue(invitedMembership);
      mockMembershipLifecycleService.activate.mockResolvedValue({
        success: true,
        data: { membership: activatedMembership, event: {} as any },
      });
      mockInvitationRepository.update.mockResolvedValue({
        success: true,
        data: { ...invitation, status: MembershipInvitationStatus.ACCEPTED },
      });

      // Act
      const result = await service.acceptInvitation({
        token: rawToken,
        acceptingUserId: 'user-001',
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.status).toBe(MembershipStatus.ACTIVE);
        expect(result.data.invitation.status).toBe(MembershipInvitationStatus.ACCEPTED);
      }
    });

    it('should emit ACCEPTED event on successful acceptance', async () => {
      // Arrange
      const rawToken = 'test-invitation-token';
      const invitation = createTestInvitation({
        tokenHash: hashToken(rawToken),
      });
      const invitedMembership = createTestMembership({ status: MembershipStatus.INVITED });
      const activatedMembership = createTestMembership({ status: MembershipStatus.ACTIVE });

      mockInvitationRepository.findByTokenHash.mockResolvedValue(invitation);
      mockMembershipWriteRepository.findById.mockResolvedValue(invitedMembership);
      mockMembershipLifecycleService.activate.mockResolvedValue({
        success: true,
        data: { membership: activatedMembership, event: {} as any },
      });
      mockInvitationRepository.update.mockResolvedValue({
        success: true,
        data: { ...invitation, status: MembershipInvitationStatus.ACCEPTED },
      });

      // Act
      await service.acceptInvitation({
        token: rawToken,
        acceptingUserId: 'user-001',
      });

      // Assert
      expect(capturedEvents[0]?.type).toBe(InvitationEventType.ACCEPTED);
    });

    it('should reject invalid token', async () => {
      // Arrange
      mockInvitationRepository.findByTokenHash.mockResolvedValue(null);

      // Act
      const result = await service.acceptInvitation({
        token: 'invalid-token',
        acceptingUserId: 'user-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_TOKEN_INVALID');
      }
    });

    it('should reject already accepted invitation', async () => {
      // Arrange
      const invitation = createTestInvitation({
        status: MembershipInvitationStatus.ACCEPTED,
      });
      mockInvitationRepository.findByTokenHash.mockResolvedValue(invitation);

      // Act
      const result = await service.acceptInvitation({
        token: 'any-token',
        acceptingUserId: 'user-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_ALREADY_ACCEPTED');
      }
    });

    it('should reject revoked invitation', async () => {
      // Arrange
      const invitation = createTestInvitation({
        status: MembershipInvitationStatus.REVOKED,
      });
      mockInvitationRepository.findByTokenHash.mockResolvedValue(invitation);

      // Act
      const result = await service.acceptInvitation({
        token: 'any-token',
        acceptingUserId: 'user-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_REVOKED');
      }
    });

    it('should reject expired invitation and mark it as EXPIRED (Req 25 AC 6)', async () => {
      // Arrange
      const expiredInvitation = createTestInvitation({
        status: MembershipInvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });
      mockInvitationRepository.findByTokenHash.mockResolvedValue(expiredInvitation);
      mockInvitationRepository.update.mockResolvedValue({
        success: true,
        data: { ...expiredInvitation, status: MembershipInvitationStatus.EXPIRED },
      });

      // Act
      const result = await service.acceptInvitation({
        token: 'any-token',
        acceptingUserId: 'user-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_EXPIRED');
      }
      expect(mockInvitationRepository.update).toHaveBeenCalledWith(
        expiredInvitation.id,
        expiredInvitation.tenantId,
        expect.objectContaining({ status: MembershipInvitationStatus.EXPIRED }),
      );
    });

    it('should reject when accepting user does not match invited user', async () => {
      // Arrange
      const invitation = createTestInvitation({
        invitedUserId: 'specific-user-id',
      });
      mockInvitationRepository.findByTokenHash.mockResolvedValue(invitation);

      // Act
      const result = await service.acceptInvitation({
        token: 'any-token',
        acceptingUserId: 'different-user-id', // Different from invitedUserId
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_USER_MISMATCH');
      }
    });

    it('should reject when membership is not in INVITED status', async () => {
      // Arrange
      const rawToken = 'test-token';
      const invitation = createTestInvitation({ tokenHash: hashToken(rawToken) });
      const membership = createTestMembership({
        status: MembershipStatus.ACTIVE, // Not INVITED
      });

      mockInvitationRepository.findByTokenHash.mockResolvedValue(invitation);
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);

      // Act
      const result = await service.acceptInvitation({
        token: rawToken,
        acceptingUserId: 'user-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_MEMBERSHIP_NOT_INVITED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Revoke Invitation Tests
  // -------------------------------------------------------------------------

  describe('revokeInvitation', () => {
    it('should revoke a pending invitation', async () => {
      // Arrange
      const invitation = createTestInvitation({
        status: MembershipInvitationStatus.PENDING,
      });
      const membership = createTestMembership({ status: MembershipStatus.INVITED });

      mockInvitationRepository.findById.mockResolvedValue(invitation);
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipLifecycleService.revoke.mockResolvedValue({
        success: true,
        data: { membership: { ...membership, status: MembershipStatus.REVOKED }, event: {} as any },
      });
      mockInvitationRepository.update.mockResolvedValue({
        success: true,
        data: { ...invitation, status: MembershipInvitationStatus.REVOKED },
      });

      // Act
      const result = await service.revokeInvitation({
        invitationId: 'invitation-001',
        tenantId: 'tenant-001',
        revokerUserId: 'admin-001',
        reason: 'Test revocation',
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.invitation.status).toBe(MembershipInvitationStatus.REVOKED);
      }
    });

    it('should emit REVOKED event', async () => {
      // Arrange
      const invitation = createTestInvitation();
      const membership = createTestMembership({ status: MembershipStatus.INVITED });

      mockInvitationRepository.findById.mockResolvedValue(invitation);
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipLifecycleService.revoke.mockResolvedValue({
        success: true,
        data: { membership: { ...membership, status: MembershipStatus.REVOKED }, event: {} as any },
      });
      mockInvitationRepository.update.mockResolvedValue({
        success: true,
        data: { ...invitation, status: MembershipInvitationStatus.REVOKED },
      });

      // Act
      await service.revokeInvitation({
        invitationId: 'invitation-001',
        tenantId: 'tenant-001',
        revokerUserId: 'admin-001',
      });

      // Assert
      expect(capturedEvents[0]?.type).toBe(InvitationEventType.REVOKED);
    });

    it('should reject revoking non-existent invitation', async () => {
      // Arrange
      mockInvitationRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.revokeInvitation({
        invitationId: 'non-existent',
        tenantId: 'tenant-001',
        revokerUserId: 'admin-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_NOT_FOUND');
      }
    });

    it('should reject revoking already accepted invitation', async () => {
      // Arrange
      const invitation = createTestInvitation({
        status: MembershipInvitationStatus.ACCEPTED,
      });
      mockInvitationRepository.findById.mockResolvedValue(invitation);

      // Act
      const result = await service.revokeInvitation({
        invitationId: 'invitation-001',
        tenantId: 'tenant-001',
        revokerUserId: 'admin-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_INVALID_STATE');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Resend Invitation Tests
  // -------------------------------------------------------------------------

  describe('resendInvitation', () => {
    it('should resend invitation with new token', async () => {
      // Arrange
      const invitation = createTestInvitation();
      const membership = createTestMembership({ status: MembershipStatus.INVITED });

      mockInvitationRepository.findById.mockResolvedValue(invitation);
      mockInvitationRepository.updateToken.mockResolvedValue({
        success: true,
        data: { ...invitation, tokenHash: 'new-token-hash' },
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);

      // Act
      const result = await service.resendInvitation({
        invitationId: 'invitation-001',
        tenantId: 'tenant-001',
        resenderUserId: 'admin-001',
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.token).toBeDefined();
        expect(result.data.token.length).toBeGreaterThan(0);
      }
    });

    it('should emit RESENT event', async () => {
      // Arrange
      const invitation = createTestInvitation();
      const membership = createTestMembership({ status: MembershipStatus.INVITED });

      mockInvitationRepository.findById.mockResolvedValue(invitation);
      mockInvitationRepository.updateToken.mockResolvedValue({
        success: true,
        data: invitation,
      });
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);

      // Act
      await service.resendInvitation({
        invitationId: 'invitation-001',
        tenantId: 'tenant-001',
        resenderUserId: 'admin-001',
      });

      // Assert
      expect(capturedEvents[0]?.type).toBe(InvitationEventType.RESENT);
    });

    it('should reject resending non-existent invitation', async () => {
      // Arrange
      mockInvitationRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.resendInvitation({
        invitationId: 'non-existent',
        tenantId: 'tenant-001',
        resenderUserId: 'admin-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_NOT_FOUND');
      }
    });

    it('should reject resending accepted invitation', async () => {
      // Arrange
      const invitation = createTestInvitation({
        status: MembershipInvitationStatus.ACCEPTED,
      });
      mockInvitationRepository.findById.mockResolvedValue(invitation);

      // Act
      const result = await service.resendInvitation({
        invitationId: 'invitation-001',
        tenantId: 'tenant-001',
        resenderUserId: 'admin-001',
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVITATION_INVALID_STATE');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Batch Expiry Tests (D7: 7 days default)
  // -------------------------------------------------------------------------

  describe('markExpiredInvitations', () => {
    it('should mark expired invitations and revoke memberships', async () => {
      // Arrange
      const expiredInvitations = [
        createTestInvitation({ id: 'inv-1', expiresAt: new Date(Date.now() - 1000) }),
        createTestInvitation({ id: 'inv-2', expiresAt: new Date(Date.now() - 2000) }),
      ];
      const membership = createTestMembership({ status: MembershipStatus.INVITED });

      mockInvitationRepository.findExpiredPending.mockResolvedValue(expiredInvitations);
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipLifecycleService.revoke.mockResolvedValue({
        success: true,
        data: { membership: { ...membership, status: MembershipStatus.REVOKED }, event: {} as any },
      });
      mockInvitationRepository.bulkUpdateStatus.mockResolvedValue(2);

      // Act
      const count = await service.markExpiredInvitations('tenant-001', 100);

      // Assert
      expect(count).toBe(2);
      expect(mockMembershipLifecycleService.revoke).toHaveBeenCalledTimes(2);
      expect(mockInvitationRepository.bulkUpdateStatus).toHaveBeenCalledWith(
        ['inv-1', 'inv-2'],
        MembershipInvitationStatus.EXPIRED,
      );
    });

    it('should emit EXPIRED events for each invitation', async () => {
      // Arrange
      const expiredInvitations = [
        createTestInvitation({ id: 'inv-1' }),
        createTestInvitation({ id: 'inv-2' }),
      ];
      const membership = createTestMembership({ status: MembershipStatus.INVITED });

      mockInvitationRepository.findExpiredPending.mockResolvedValue(expiredInvitations);
      mockMembershipWriteRepository.findById.mockResolvedValue(membership);
      mockMembershipLifecycleService.revoke.mockResolvedValue({
        success: true,
        data: { membership: { ...membership, status: MembershipStatus.REVOKED }, event: {} as any },
      });
      mockInvitationRepository.bulkUpdateStatus.mockResolvedValue(2);

      // Act
      await service.markExpiredInvitations('tenant-001', 100);

      // Assert
      expect(capturedEvents).toHaveLength(2);
      expect(capturedEvents[0]?.type).toBe(InvitationEventType.EXPIRED);
      expect(capturedEvents[1]?.type).toBe(InvitationEventType.EXPIRED);
    });

    it('should return 0 when no expired invitations exist', async () => {
      // Arrange
      mockInvitationRepository.findExpiredPending.mockResolvedValue([]);

      // Act
      const count = await service.markExpiredInvitations();

      // Assert
      expect(count).toBe(0);
      expect(mockMembershipLifecycleService.revoke).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Token Security Tests
  // -------------------------------------------------------------------------

  describe('token hashing', () => {
    it('hashToken should produce consistent hash for same input', () => {
      const token = 'test-token-value';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
    });

    it('hashToken should produce different hash for different inputs', () => {
      const hash1 = hashToken('token-1');
      const hash2 = hashToken('token-2');

      expect(hash1).not.toBe(hash2);
    });

    it('hashToken should produce 64-character hex string (SHA-256)', () => {
      const hash = hashToken('any-token');

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
