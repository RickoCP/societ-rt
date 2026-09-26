/**
 * SubscriptionPlanService Unit Tests
 *
 * Tests business logic for subscription plan management:
 * - Plan creation with name uniqueness
 * - Plan deletion validation (subscribers check)
 * - Plan update with duplicate name rejection
 *
 * @see Requirements 17 (AC 1-7)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, fail } from '@core/utils';
import { createSubscriptionPlanService, type ISubscriptionPlanService } from '../SubscriptionPlanService';
import type { ISubscriptionPlanRepository } from '../../repositories';
import type { SubscriptionPlan } from '../../entities';

// ---------------------------------------------------------------------------
// Mock Repository Factory
// ---------------------------------------------------------------------------

function createMockRepository(): ISubscriptionPlanRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    existsByName: vi.fn(),
    countSubscribers: vi.fn(),
    getChangeLog: vi.fn(),
    createChangeLog: vi.fn(),
    ensureDefaultPlans: vi.fn(),
  };
}

function createMockPlan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
  return {
    id: 'plan-123',
    name: 'Test Plan',
    maxUsers: 100,
    features: ['feature_1', 'feature_2'],
    price: 500000,
    description: 'Test plan description',
    isSystemPlan: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionPlanService', () => {
  let service: ISubscriptionPlanService;
  let mockRepo: ISubscriptionPlanRepository;

  beforeEach(() => {
    mockRepo = createMockRepository();
    service = createSubscriptionPlanService({
      subscriptionPlanRepository: mockRepo,
    });
  });

  // -------------------------------------------------------------------------
  // Plan Creation Tests
  // -------------------------------------------------------------------------

  describe('createPlan', () => {
    it('should create a plan successfully when name is unique', async () => {
      // Arrange
      const newPlan = createMockPlan();
      vi.mocked(mockRepo.existsByName).mockResolvedValue(ok(false));
      vi.mocked(mockRepo.create).mockResolvedValue(ok(newPlan));

      // Act
      const result = await service.createPlan(
        {
          name: 'Test Plan',
          maxUsers: 100,
          features: ['feature_1'],
          price: 500000,
        },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Test Plan');
      }
      expect(mockRepo.existsByName).toHaveBeenCalledWith('Test Plan');
      expect(mockRepo.create).toHaveBeenCalled();
    });

    /**
     * Test: Duplicate plan name rejected (Req 17 AC 3)
     */
    it('should reject creation when plan name already exists', async () => {
      // Arrange
      vi.mocked(mockRepo.existsByName).mockResolvedValue(ok(true));

      // Act
      const result = await service.createPlan(
        {
          name: 'Existing Plan',
          maxUsers: 100,
          features: [],
          price: 100000,
        },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAN_NAME_DUPLICATE');
      }
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('should reject creation when plan name format is invalid', async () => {
      // Arrange - name with invalid characters (too long)
      const longName = 'A'.repeat(60);

      // Act
      const result = await service.createPlan(
        {
          name: longName,
          maxUsers: 100,
          features: [],
          price: 100000,
        },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_PLAN_DATA');
      }
    });

    it('should reject creation when maxUsers is negative', async () => {
      // Act
      const result = await service.createPlan(
        {
          name: 'Test Plan',
          maxUsers: -5,
          features: [],
          price: 100000,
        },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_PLAN_DATA');
      }
    });

    it('should reject creation when price is negative', async () => {
      // Act
      const result = await service.createPlan(
        {
          name: 'Test Plan',
          maxUsers: 100,
          features: [],
          price: -50000,
        },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_PLAN_DATA');
      }
    });

    it('should allow null maxUsers for unlimited users', async () => {
      // Arrange
      const newPlan = createMockPlan({ maxUsers: null });
      vi.mocked(mockRepo.existsByName).mockResolvedValue(ok(false));
      vi.mocked(mockRepo.create).mockResolvedValue(ok(newPlan));

      // Act
      const result = await service.createPlan(
        {
          name: 'Unlimited Plan',
          maxUsers: null,
          features: [],
          price: 1000000,
        },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxUsers).toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Plan Deletion Tests
  // -------------------------------------------------------------------------

  describe('deletePlan', () => {
    /**
     * Test: Plan with subscribers cannot be deleted (Req 17 AC 5-6)
     */
    it('should reject deletion when plan has active subscribers', async () => {
      // Arrange
      const plan = createMockPlan({ isSystemPlan: false });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(plan));
      vi.mocked(mockRepo.countSubscribers).mockResolvedValue(ok(5));

      // Act
      const result = await service.deletePlan('plan-123', 'operator-123');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAN_HAS_SUBSCRIBERS');
        expect(result.error.message).toContain('5');
      }
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('should delete plan successfully when no subscribers', async () => {
      // Arrange
      const plan = createMockPlan({ isSystemPlan: false });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(plan));
      vi.mocked(mockRepo.countSubscribers).mockResolvedValue(ok(0));
      vi.mocked(mockRepo.delete).mockResolvedValue(ok(undefined));

      // Act
      const result = await service.deletePlan('plan-123', 'operator-123');

      // Assert
      expect(result.success).toBe(true);
      expect(mockRepo.delete).toHaveBeenCalledWith('plan-123', 'operator-123');
    });

    it('should reject deletion of system plans (Req 17 AC 4)', async () => {
      // Arrange
      const plan = createMockPlan({ name: 'Basic', isSystemPlan: true });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(plan));

      // Act
      const result = await service.deletePlan('plan-123', 'operator-123');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CANNOT_DELETE_SYSTEM_PLAN');
      }
      expect(mockRepo.countSubscribers).not.toHaveBeenCalled();
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('should reject deletion of default plan names even without isSystemPlan flag', async () => {
      // Arrange - "Basic" is a default plan name
      const plan = createMockPlan({ name: 'Basic', isSystemPlan: false });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(plan));

      // Act
      const result = await service.deletePlan('plan-123', 'operator-123');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CANNOT_DELETE_SYSTEM_PLAN');
      }
    });

    it('should return not found error when plan does not exist', async () => {
      // Arrange
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(null));

      // Act
      const result = await service.deletePlan('nonexistent', 'operator-123');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAN_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Plan Update Tests
  // -------------------------------------------------------------------------

  describe('updatePlan', () => {
    /**
     * Test: Duplicate plan name rejected on update
     */
    it('should reject update when new name conflicts with existing plan', async () => {
      // Arrange
      const existingPlan = createMockPlan({ id: 'plan-123', name: 'Original Name' });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(existingPlan));
      vi.mocked(mockRepo.existsByName).mockResolvedValue(ok(true)); // Name exists

      // Act
      const result = await service.updatePlan(
        'plan-123',
        { name: 'Conflicting Name' },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAN_NAME_DUPLICATE');
      }
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('should allow update when name is unchanged', async () => {
      // Arrange
      const existingPlan = createMockPlan({ id: 'plan-123', name: 'Test Plan' });
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(existingPlan));
      vi.mocked(mockRepo.existsByName).mockResolvedValue(ok(false));
      vi.mocked(mockRepo.update).mockResolvedValue(ok({ ...existingPlan, price: 600000 }));

      // Act
      const result = await service.updatePlan(
        'plan-123',
        { price: 600000 },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalled();
    });

    it('should update plan successfully when new name is unique', async () => {
      // Arrange
      const existingPlan = createMockPlan({ id: 'plan-123', name: 'Old Name' });
      const updatedPlan = { ...existingPlan, name: 'New Unique Name' };
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(existingPlan));
      vi.mocked(mockRepo.existsByName).mockResolvedValue(ok(false));
      vi.mocked(mockRepo.update).mockResolvedValue(ok(updatedPlan));

      // Act
      const result = await service.updatePlan(
        'plan-123',
        { name: 'New Unique Name' },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('New Unique Name');
      }
      // Verify exclusion of current plan in uniqueness check
      expect(mockRepo.existsByName).toHaveBeenCalledWith('New Unique Name', 'plan-123');
    });

    it('should return not found error when plan does not exist', async () => {
      // Arrange
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(null));

      // Act
      const result = await service.updatePlan(
        'nonexistent',
        { price: 500000 },
        'operator-123',
      );

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAN_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Query Tests
  // -------------------------------------------------------------------------

  describe('getPlanById', () => {
    it('should return plan when found', async () => {
      // Arrange
      const plan = createMockPlan();
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(plan));

      // Act
      const result = await service.getPlanById('plan-123');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('plan-123');
      }
    });

    it('should return not found when plan does not exist', async () => {
      // Arrange
      vi.mocked(mockRepo.findById).mockResolvedValue(ok(null));

      // Act
      const result = await service.getPlanById('nonexistent');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAN_NOT_FOUND');
      }
    });
  });

  describe('listPlans', () => {
    it('should return all plans', async () => {
      // Arrange
      const plans = [
        createMockPlan({ id: 'plan-1', name: 'Basic' }),
        createMockPlan({ id: 'plan-2', name: 'Pro' }),
      ];
      vi.mocked(mockRepo.findAll).mockResolvedValue(ok(plans));

      // Act
      const result = await service.listPlans();

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });
  });
});
