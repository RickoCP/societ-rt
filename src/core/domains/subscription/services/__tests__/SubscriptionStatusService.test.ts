/**
 * SubscriptionStatusService Unit Tests
 *
 * Tests business logic for subscription status management:
 * - Status transition validation (state machine)
 * - Invalid transition rejection
 * - Status history recording
 *
 * @see Requirements 18 (AC 1-7)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, fail } from '@core/utils';
import {
  createSubscriptionStatusService,
  type ISubscriptionStatusService,
  type IStatusTransitionEventEmitter,
} from '../SubscriptionStatusService';
import type { ISubscriptionRepository } from '../../repositories';
import type { Subscription, SubscriptionStatusHistory } from '../../entities';
import { SubscriptionStatus } from '../../types';

// ---------------------------------------------------------------------------
// Mock Repository Factory
// ---------------------------------------------------------------------------

function createMockRepository(): ISubscriptionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByTenantId: vi.fn(),
    findByPlanId: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    updateByTenantId: vi.fn(),
    existsByTenantId: vi.fn(),
    countByStatus: vi.fn(),
    countByPlanId: vi.fn(),
    createStatusHistory: vi.fn(),
    getStatusHistory: vi.fn(),
    getLatestStatusHistory: vi.fn(),
  };
}

function createMockEventEmitter(): IStatusTransitionEventEmitter {
  return {
    emit: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-123',
    tenantId: 'tenant-123',
    planId: 'plan-123',
    status: SubscriptionStatus.ACTIVE,
    startedAt: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-02-01'),
    trialEndsAt: null,
    suspendedAt: null,
    closedAt: null,
    statusReason: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createMockStatusHistory(
  overrides: Partial<SubscriptionStatusHistory> = {},
): SubscriptionStatusHistory {
  return {
    id: 'history-123',
    subscriptionId: 'sub-123',
    tenantId: 'tenant-123',
    fromStatus: SubscriptionStatus.ACTIVE,
    toStatus: SubscriptionStatus.PAST_DUE,
    reason: 'Payment overdue',
    changedBy: 'system',
    isAutomated: true,
    metadata: null,
    changedAt: new Date('2024-01-15'),
    createdAt: new Date('2024-01-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionStatusService', () => {
  let service: ISubscriptionStatusService;
  let mockRepo: ISubscriptionRepository;
  let mockEventEmitter: IStatusTransitionEventEmitter;

  beforeEach(() => {
    mockRepo = createMockRepository();
    mockEventEmitter = createMockEventEmitter();
    service = createSubscriptionStatusService({
      subscriptionRepository: mockRepo,
      eventEmitter: mockEventEmitter,
    });
  });

  // -------------------------------------------------------------------------
  // Status Transition Tests (State Machine)
  // -------------------------------------------------------------------------

  describe('transitionStatus', () => {
    /**
     * Test: Valid status transitions succeed
     */
    describe('valid transitions', () => {
      const validTransitions: Array<{
        from: typeof SubscriptionStatus[keyof typeof SubscriptionStatus];
        to: typeof SubscriptionStatus[keyof typeof SubscriptionStatus];
        description: string;
      }> = [
        { from: SubscriptionStatus.TRIAL, to: SubscriptionStatus.ACTIVE, description: 'TRIAL → ACTIVE' },
        { from: SubscriptionStatus.TRIAL, to: SubscriptionStatus.CLOSED, description: 'TRIAL → CLOSED' },
        { from: SubscriptionStatus.ACTIVE, to: SubscriptionStatus.PAST_DUE, description: 'ACTIVE → PAST_DUE' },
        { from: SubscriptionStatus.ACTIVE, to: SubscriptionStatus.SUSPENDED, description: 'ACTIVE → SUSPENDED' },
        { from: SubscriptionStatus.ACTIVE, to: SubscriptionStatus.CLOSED, description: 'ACTIVE → CLOSED' },
        { from: SubscriptionStatus.PAST_DUE, to: SubscriptionStatus.ACTIVE, description: 'PAST_DUE → ACTIVE' },
        { from: SubscriptionStatus.PAST_DUE, to: SubscriptionStatus.SUSPENDED, description: 'PAST_DUE → SUSPENDED' },
        { from: SubscriptionStatus.PAST_DUE, to: SubscriptionStatus.CLOSED, description: 'PAST_DUE → CLOSED' },
        { from: SubscriptionStatus.SUSPENDED, to: SubscriptionStatus.ACTIVE, description: 'SUSPENDED → ACTIVE' },
        { from: SubscriptionStatus.SUSPENDED, to: SubscriptionStatus.CLOSED, description: 'SUSPENDED → CLOSED' },
      ];

      validTransitions.forEach(({ from, to, description }) => {
        it(`should allow ${description}`, async () => {
          // Arrange
          const subscription = createMockSubscription({ status: from });
          const updatedSubscription = createMockSubscription({ status: to });
          vi.mocked(mockRepo.findById).mockResolvedValue(ok(subscription));
          vi.mocked(mockRepo.update).mockResolvedValue(ok(updatedSubscription));
          vi.mocked(mockRepo.createStatusHistory).mockResolvedValue(
            ok(createMockStatusHistory({ fromStatus: from, toStatus: to })),
          );

          // Act
          const result = await service.transitionStatus(
            'sub-123',
            to,
            `Transition: ${description}`,
            'operator-123',
          );

          // Assert
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.status).toBe(to);
          }
          expect(mockRepo.update).toHaveBeenCalled();
          expect(mockRepo.createStatusHistory).toHaveBeenCalled();
          expect(mockEventEmitter.emit).toHaveBeenCalled();
        });
      });
    });

    /**
     * Test: Invalid status transition rejected (Req 18 AC 7)
     */
    describe('invalid transitions', () => {
      const invalidTransitions: Array<{
        from: typeof SubscriptionStatus[keyof typeof SubscriptionStatus];
        to: typeof SubscriptionStatus[keyof typeof SubscriptionStatus];
        description: string;
      }> = [
        { from: SubscriptionStatus.TRIAL, to: SubscriptionStatus.PAST_DUE, description: 'TRIAL → PAST_DUE' },
        { from: SubscriptionStatus.TRIAL, to: SubscriptionStatus.SUSPENDED, description: 'TRIAL → SUSPENDED' },
        { from: SubscriptionStatus.ACTIVE, to: SubscriptionStatus.TRIAL, description: 'ACTIVE → TRIAL' },
        { from: SubscriptionStatus.PAST_DUE, to: SubscriptionStatus.TRIAL, description: 'PAST_DUE → TRIAL' },
        { from: SubscriptionStatus.SUSPENDED, to: SubscriptionStatus.TRIAL, description: 'SUSPENDED → TRIAL' },
        { from: SubscriptionStatus.SUSPENDED, to: SubscriptionStatus.PAST_DUE, description: 'SUSPENDED → PAST_DUE' },
        { from: SubscriptionStatus.CLOSED, to: SubscriptionStatus.ACTIVE, description: 'CLOSED → ACTIVE' },
        { from: SubscriptionStatus.CLOSED, to: SubscriptionStatus.TRIAL, description: 'CLOSED → TRIAL' },
        { from: SubscriptionStatus.CLOSED, to: SubscriptionStatus.PAST_DUE, description: 'CLOSED → PAST_DUE' },
        { from: SubscriptionStatus.CLOSED, to: SubscriptionStatus.SUSPENDED, description: 'CLOSED → SUSPENDED' },
      ];

      invalidTransitions.forEach(({ from, to, description }) => {
        it(`should reject ${description}`, async () => {
          // Arrange
          const subscription = createMockSubscription({ status: from });
          vi.mocked(mockRepo.findById).mockResolvedValue(ok(subscription));

          // Act
          const result = await service.transitionStatus(
            'sub-123',
            to,
            `Invalid: ${description}`,
            'operator-123',
          );

          // Assert
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
            expect(result.error.message).toContain(from);
            expect(result.error.message).toContain(to);
          }
          expect(mockRepo.update).not.toHaveBeenCalled();
          expect(mockRepo.createStatusHistory).not.toHaveBeenCalled();
        });
      });
    });

    /**
     * Test: CLOSED is terminal - no transitions out
     */
    it('should not allow any transitions out of CLOSED status', async () => {
      // Arrange
      const subscription = createMockSubscription({ status: SubscriptionStatus.CLOSED });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(subscription));

      // Act
      const result = await service.transitionStatus(
        'sub-123',
        SubscriptionStatus.ACTIVE,
        'Attempted reactivation',
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
      }
    });

    it('should set suspendedAt when transitioning to SUSPENDED', async () => {
      // Arrange
      const subscription = createMockSubscription({ status: SubscriptionStatus.ACTIVE });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(subscription));
      vi.mocked(mockRepo.update).mockImplementation(async (_, data) => {
        return ok(createMockSubscription({
          status: SubscriptionStatus.SUSPENDED,
          suspendedAt: data.suspendedAt,
        }));
      });
      vi.mocked(mockRepo.createStatusHistory).mockResolvedValue(ok(createMockStatusHistory()));

      // Act
      const result = await service.transitionStatus(
        'sub-123',
        SubscriptionStatus.SUSPENDED,
        'Manual suspension',
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith(
        'sub-123',
        expect.objectContaining({
          status: SubscriptionStatus.SUSPENDED,
          suspendedAt: expect.any(Date),
        }),
      );
    });

    it('should set closedAt when transitioning to CLOSED', async () => {
      // Arrange
      const subscription = createMockSubscription({ status: SubscriptionStatus.SUSPENDED });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(subscription));
      vi.mocked(mockRepo.update).mockImplementation(async (_, data) => {
        return ok(createMockSubscription({
          status: SubscriptionStatus.CLOSED,
          closedAt: data.closedAt,
        }));
      });
      vi.mocked(mockRepo.createStatusHistory).mockResolvedValue(ok(createMockStatusHistory()));

      // Act
      const result = await service.transitionStatus(
        'sub-123',
        SubscriptionStatus.CLOSED,
        'Final closure',
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith(
        'sub-123',
        expect.objectContaining({
          status: SubscriptionStatus.CLOSED,
          closedAt: expect.any(Date),
        }),
      );
    });

    it('should clear suspendedAt when reactivating from SUSPENDED', async () => {
      // Arrange
      const subscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
        suspendedAt: new Date('2024-01-10'),
      });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(subscription));
      vi.mocked(mockRepo.update).mockResolvedValue(
        ok(createMockSubscription({ status: SubscriptionStatus.ACTIVE, suspendedAt: null })),
      );
      vi.mocked(mockRepo.createStatusHistory).mockResolvedValue(ok(createMockStatusHistory()));

      // Act
      const result = await service.transitionStatus(
        'sub-123',
        SubscriptionStatus.ACTIVE,
        'Reactivation after payment',
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith(
        'sub-123',
        expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          suspendedAt: null,
        }),
      );
    });

    it('should return not found when subscription does not exist', async () => {
      // Arrange
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(null));

      // Act
      const result = await service.transitionStatus(
        'nonexistent',
        SubscriptionStatus.ACTIVE,
        'Activation',
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SUBSCRIPTION_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Status Helper Tests
  // -------------------------------------------------------------------------

  describe('status helpers', () => {
    it('canTransition should return true for valid transitions', () => {
      expect(service.canTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE)).toBe(true);
      expect(service.canTransition(SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE)).toBe(true);
    });

    it('canTransition should return false for invalid transitions', () => {
      expect(service.canTransition(SubscriptionStatus.CLOSED, SubscriptionStatus.ACTIVE)).toBe(false);
      expect(service.canTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL)).toBe(false);
    });

    it('getAllowedTransitions should return correct transitions', () => {
      const activeTransitions = service.getAllowedTransitions(SubscriptionStatus.ACTIVE);
      expect(activeTransitions).toContain(SubscriptionStatus.PAST_DUE);
      expect(activeTransitions).toContain(SubscriptionStatus.SUSPENDED);
      expect(activeTransitions).toContain(SubscriptionStatus.CLOSED);
      expect(activeTransitions).not.toContain(SubscriptionStatus.TRIAL);

      const closedTransitions = service.getAllowedTransitions(SubscriptionStatus.CLOSED);
      expect(closedTransitions).toHaveLength(0);
    });

    it('isOperational should identify operational statuses', () => {
      expect(service.isOperational(SubscriptionStatus.TRIAL)).toBe(true);
      expect(service.isOperational(SubscriptionStatus.ACTIVE)).toBe(true);
      expect(service.isOperational(SubscriptionStatus.PAST_DUE)).toBe(true);
      expect(service.isOperational(SubscriptionStatus.SUSPENDED)).toBe(false);
      expect(service.isOperational(SubscriptionStatus.CLOSED)).toBe(false);
    });

    it('isRestricted should identify restricted statuses', () => {
      expect(service.isRestricted(SubscriptionStatus.SUSPENDED)).toBe(true);
      expect(service.isRestricted(SubscriptionStatus.CLOSED)).toBe(true);
      expect(service.isRestricted(SubscriptionStatus.ACTIVE)).toBe(false);
    });

    it('isTerminal should identify terminal status', () => {
      expect(service.isTerminal(SubscriptionStatus.CLOSED)).toBe(true);
      expect(service.isTerminal(SubscriptionStatus.SUSPENDED)).toBe(false);
      expect(service.isTerminal(SubscriptionStatus.ACTIVE)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Subscription CRUD Tests
  // -------------------------------------------------------------------------

  describe('createSubscription', () => {
    it('should create subscription and record initial history', async () => {
      // Arrange
      const newSubscription = createMockSubscription({ status: SubscriptionStatus.TRIAL });
      vi.mocked(mockRepo.existsByTenantId).mockResolvedValue(ok(false));
      vi.mocked(mockRepo.create).mockResolvedValue(ok(newSubscription));
      vi.mocked(mockRepo.createStatusHistory).mockResolvedValue(
        ok(createMockStatusHistory({ fromStatus: null, toStatus: SubscriptionStatus.TRIAL })),
      );

      // Act
      const result = await service.createSubscription({
        tenantId: 'tenant-123',
        planId: 'plan-123',
        status: SubscriptionStatus.TRIAL,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(mockRepo.create).toHaveBeenCalled();
      expect(mockRepo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStatus: null,
          toStatus: SubscriptionStatus.TRIAL,
        }),
      );
    });

    it('should reject when tenant already has subscription', async () => {
      // Arrange
      vi.mocked(mockRepo.existsByTenantId).mockResolvedValue(ok(true));

      // Act
      const result = await service.createSubscription({
        tenantId: 'tenant-123',
        planId: 'plan-123',
        status: SubscriptionStatus.TRIAL,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SUBSCRIPTION_ALREADY_EXISTS');
      }
    });
  });

  describe('getStatusHistory', () => {
    it('should return status history for subscription', async () => {
      // Arrange
      const history = [
        createMockStatusHistory({ toStatus: SubscriptionStatus.ACTIVE }),
        createMockStatusHistory({ toStatus: SubscriptionStatus.PAST_DUE }),
      ];
      vi.mocked(mockRepo.getStatusHistory).mockResolvedValue(ok(history));

      // Act
      const result = await service.getStatusHistory('sub-123');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });
  });
});
