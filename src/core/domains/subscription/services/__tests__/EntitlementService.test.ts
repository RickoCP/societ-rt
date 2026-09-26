/**
 * EntitlementService Unit Tests
 *
 * Tests business logic for entitlement enforcement:
 * - Feature entitlement checking against plan features
 * - Subscription status restrictions (SUSPENDED/CLOSED)
 * - Safety-critical operation bypass
 * - Denial logging
 *
 * Test Requirements (per Req 19):
 * - Unit test: Feature not in plan → ENTITLEMENT_NOT_AVAILABLE
 * - Unit test: SUSPENDED tenant → emergency operations allowed
 * - Unit test: SUSPENDED tenant → normal commands denied (TENANT_SUSPENDED)
 *
 * @see Requirements 19 (AC 1-7)
 * @see Requirements 20 (AC 1-11) — Safety-Critical Protection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok } from '@core/utils';
import {
  createEntitlementService,
  type IEntitlementService,
  type IEntitlementLogger,
} from '../EntitlementService';
import type { ISubscriptionRepository } from '../../repositories';
import type { ISubscriptionPlanRepository } from '../../repositories';
import type { Subscription } from '../../entities';
import type { SubscriptionPlan } from '../../entities';
import { SubscriptionStatus, PlanFeature } from '../../types';

// ---------------------------------------------------------------------------
// Mock Repository Factories
// ---------------------------------------------------------------------------

function createMockSubscriptionRepository(): ISubscriptionRepository {
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

function createMockPlanRepository(): ISubscriptionPlanRepository {
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

function createMockLogger(): IEntitlementLogger {
  return {
    logDenial: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function createMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-123',
    tenantId: 'tenant-123',
    planId: 'plan-basic',
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

function createMockPlan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
  return {
    id: 'plan-basic',
    name: 'Basic',
    description: 'Basic plan',
    price: 100000,
    maxUsers: 50,
    isSystemPlan: false,
    features: [
      PlanFeature.RESIDENT_MANAGEMENT,
      PlanFeature.HOUSEHOLD_MANAGEMENT,
      PlanFeature.ANNOUNCEMENT_BASIC,
      PlanFeature.EMERGENCY_ALERT,
      PlanFeature.PANIC_BUTTON,
      PlanFeature.EMERGENCY_SIREN,
    ],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntitlementService', () => {
  let service: IEntitlementService;
  let mockSubRepo: ISubscriptionRepository;
  let mockPlanRepo: ISubscriptionPlanRepository;
  let mockLogger: IEntitlementLogger;

  beforeEach(() => {
    mockSubRepo = createMockSubscriptionRepository();
    mockPlanRepo = createMockPlanRepository();
    mockLogger = createMockLogger();
    service = createEntitlementService({
      subscriptionRepository: mockSubRepo,
      subscriptionPlanRepository: mockPlanRepo,
      logger: mockLogger,
    });
  });

  // =========================================================================
  // Req 19 AC 1 — Resolve tenant's subscription plan and status
  // =========================================================================

  describe('checkEntitlement - Plan and Status Resolution (AC 1)', () => {
    it('should resolve subscription by tenant ID', async () => {
      const subscription = createMockSubscription();
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(result.success).toBe(true);
      expect(mockSubRepo.findByTenantId).toHaveBeenCalledWith('tenant-123');
    });

    it('should resolve plan by subscription planId', async () => {
      const subscription = createMockSubscription({ planId: 'plan-pro' });
      const plan = createMockPlan({ id: 'plan-pro', name: 'Pro' });

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(result.success).toBe(true);
      expect(mockPlanRepo.findById).toHaveBeenCalledWith('plan-pro');
    });

    it('should fail if subscription not found', async () => {
      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(null));

      const result = await service.checkEntitlement({
        tenantId: 'nonexistent-tenant',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SUBSCRIPTION_NOT_FOUND');
      }
    });

    it('should fail if plan not found', async () => {
      const subscription = createMockSubscription({ planId: 'nonexistent-plan' });
      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(null));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAN_NOT_FOUND');
      }
    });
  });

  // =========================================================================
  // Req 19 AC 2 — Deny access to features not in plan
  // =========================================================================

  describe('checkEntitlement - Feature Not in Plan (AC 2)', () => {
    it('should deny access when feature is not in plan with ENTITLEMENT_NOT_AVAILABLE', async () => {
      const subscription = createMockSubscription();
      const basicPlan = createMockPlan(); // Basic plan without IOT features

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(basicPlan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.IOT_INTEGRATION, // Not in Basic plan
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('ENTITLEMENT_NOT_AVAILABLE');
        expect(result.data.feature).toBe(PlanFeature.IOT_INTEGRATION);
        expect(result.data.planName).toBe('Basic');
      }
    });

    it('should allow access when feature is in plan', async () => {
      const subscription = createMockSubscription();
      const plan = createMockPlan({
        features: [PlanFeature.RESIDENT_MANAGEMENT, PlanFeature.IOT_INTEGRATION],
      });

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.IOT_INTEGRATION,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.errorCode).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // Req 19 AC 4-5 — SUSPENDED tenant handling
  // =========================================================================

  describe('checkEntitlement - SUSPENDED Tenant (AC 4-5)', () => {
    it('should deny normal commands with TENANT_SUSPENDED for suspended tenant (AC 5)', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
      });
      const plan = createMockPlan({
        features: [PlanFeature.IOT_INTEGRATION],
      });

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.IOT_INTEGRATION,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('TENANT_SUSPENDED');
        expect(result.data.subscriptionStatus).toBe(SubscriptionStatus.SUSPENDED);
      }
    });

    it('should allow billing/recovery flows for suspended tenant (AC 4)', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
      });
      const plan = createMockPlan({
        features: [PlanFeature.FINANCE_BASIC],
      });

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.FINANCE_BASIC,
        isBillingFlow: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.subscriptionStatus).toBe(SubscriptionStatus.SUSPENDED);
      }
    });

    it('should still deny billing flow if feature not in plan', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
      });
      const plan = createMockPlan(); // Basic plan without FINANCE_ADVANCED

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.FINANCE_ADVANCED,
        isBillingFlow: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('ENTITLEMENT_NOT_AVAILABLE');
      }
    });
  });

  // =========================================================================
  // Req 19 AC 6 — Emergency/panic operations never denied
  // =========================================================================

  describe('checkEntitlement - Safety-Critical Operations (AC 6)', () => {
    it('should allow EMERGENCY_ALERT for ACTIVE subscription', async () => {
      const subscription = createMockSubscription();
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.EMERGENCY_ALERT,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.isSafetyCritical).toBe(true);
      }
    });

    it('should allow PANIC_BUTTON for SUSPENDED subscription', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
      });
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.PANIC_BUTTON,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.isSafetyCritical).toBe(true);
        expect(result.data.subscriptionStatus).toBe(SubscriptionStatus.SUSPENDED);
      }
    });

    it('should allow EMERGENCY_SIREN for SUSPENDED subscription', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
      });
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.EMERGENCY_SIREN,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.isSafetyCritical).toBe(true);
      }
    });

    it('should allow safety-critical operations via isSafetyCritical flag', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
      });
      const plan = createMockPlan({
        features: [PlanFeature.IOT_INTEGRATION],
      });

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      // Force the operation to be treated as safety-critical
      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.IOT_INTEGRATION,
        isSafetyCritical: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.isSafetyCritical).toBe(true);
      }
    });
  });

  // =========================================================================
  // CLOSED Tenant Handling (Req 18 AC 3)
  // =========================================================================

  describe('checkEntitlement - CLOSED Tenant', () => {
    it('should deny all operations for CLOSED subscription', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.CLOSED,
      });
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('TENANT_CLOSED');
      }
    });

    it('should deny even safety-critical operations for CLOSED subscription', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.CLOSED,
      });
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.PANIC_BUTTON,
        isSafetyCritical: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('TENANT_CLOSED');
      }
    });
  });

  // =========================================================================
  // Req 19 AC 7 — Log all entitlement denials
  // =========================================================================

  describe('checkEntitlement - Denial Logging (AC 7)', () => {
    it('should log denial when feature not in plan', async () => {
      const subscription = createMockSubscription();
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.IOT_INTEGRATION,
      });

      expect(mockLogger.logDenial).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          feature: PlanFeature.IOT_INTEGRATION,
          planName: 'Basic',
          errorCode: 'ENTITLEMENT_NOT_AVAILABLE',
        }),
      );
    });

    it('should log denial when tenant is suspended', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
      });
      const plan = createMockPlan({
        features: [PlanFeature.IOT_INTEGRATION],
      });

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.IOT_INTEGRATION,
      });

      expect(mockLogger.logDenial).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          feature: PlanFeature.IOT_INTEGRATION,
          subscriptionStatus: SubscriptionStatus.SUSPENDED,
          errorCode: 'TENANT_SUSPENDED',
        }),
      );
    });

    it('should log denial when tenant is closed', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.CLOSED,
      });
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(mockLogger.logDenial).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          subscriptionStatus: SubscriptionStatus.CLOSED,
          errorCode: 'TENANT_CLOSED',
        }),
      );
    });

    it('should NOT log when entitlement is granted', async () => {
      const subscription = createMockSubscription();
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(mockLogger.logDenial).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Helper Methods
  // =========================================================================

  describe('isFeatureInPlan', () => {
    it('should return true when feature is in plan', async () => {
      const plan = createMockPlan({
        features: [PlanFeature.IOT_INTEGRATION],
      });

      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.isFeatureInPlan('plan-123', PlanFeature.IOT_INTEGRATION);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false when feature is not in plan', async () => {
      const plan = createMockPlan(); // Basic plan

      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.isFeatureInPlan('plan-123', PlanFeature.IOT_INTEGRATION);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  describe('getTenantFeatures', () => {
    it('should return all features for tenant', async () => {
      const subscription = createMockSubscription();
      const plan = createMockPlan({
        features: [PlanFeature.RESIDENT_MANAGEMENT, PlanFeature.IOT_INTEGRATION],
      });

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.getTenantFeatures('tenant-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([PlanFeature.RESIDENT_MANAGEMENT, PlanFeature.IOT_INTEGRATION]);
      }
    });
  });

  describe('isSafetyCritical', () => {
    it('should return true for EMERGENCY_ALERT', () => {
      expect(service.isSafetyCritical(PlanFeature.EMERGENCY_ALERT)).toBe(true);
    });

    it('should return true for PANIC_BUTTON', () => {
      expect(service.isSafetyCritical(PlanFeature.PANIC_BUTTON)).toBe(true);
    });

    it('should return true for EMERGENCY_SIREN', () => {
      expect(service.isSafetyCritical(PlanFeature.EMERGENCY_SIREN)).toBe(true);
    });

    it('should return false for non-safety-critical features', () => {
      expect(service.isSafetyCritical(PlanFeature.IOT_INTEGRATION)).toBe(false);
      expect(service.isSafetyCritical(PlanFeature.FINANCE_BASIC)).toBe(false);
      expect(service.isSafetyCritical(PlanFeature.VOTING)).toBe(false);
    });
  });

  // =========================================================================
  // Operational Status Tests
  // =========================================================================

  describe('checkEntitlement - Operational Statuses', () => {
    it('should allow features for TRIAL status', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.TRIAL,
      });
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.subscriptionStatus).toBe(SubscriptionStatus.TRIAL);
      }
    });

    it('should allow features for ACTIVE status', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.ACTIVE,
      });
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
      }
    });

    it('should allow features for PAST_DUE status', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.PAST_DUE,
      });
      const plan = createMockPlan();

      vi.mocked(mockSubRepo.findByTenantId).mockResolvedValue(ok(subscription));
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(ok(plan));

      const result = await service.checkEntitlement({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.RESIDENT_MANAGEMENT,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.subscriptionStatus).toBe(SubscriptionStatus.PAST_DUE);
      }
    });
  });
});
