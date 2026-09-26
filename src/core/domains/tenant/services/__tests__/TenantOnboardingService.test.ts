/**
 * Unit tests for TenantOnboardingService
 *
 * Tests tenant onboarding flow including:
 * - Complete onboarding flow (tenant → OrgUnit → membership → subscription → activation)
 * - Validation of owner eligibility (quarantine, existing ownership)
 * - Duplicate tenant detection
 * - Event emission for audit trail
 * - Error handling at each step
 *
 * @see FASE 1.18 Task 49: Tenant Onboarding Flow
 * @see Requirements 23 (AC 1-9), Requirements 49 (AC 1-10)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  TenantOnboardingServiceImpl,
  TenantLifecycleStatus,
  OnboardingEventType,
  isValidLifecycleTransition,
  type ITenantOnboardingService,
  type IOnboardingEventEmitter,
  type OnboardingEvent,
  type TenantOnboardingRepository,
  type OrgUnitOnboardingRepository,
  type SubscriptionOnboardingRepository,
} from '../TenantOnboardingService';
import type { IMembershipRepository, MembershipWriteRepository } from '@core/domains/membership/repositories';
import type { Tenant, CreateTenantInput } from '@core/domains/tenant/entities';
import type { OrgUnit } from '@core/domains/orgunit/entities';
import type { Subscription } from '@core/domains/subscription/entities';
import type { Membership } from '@core/domains/membership/entities';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import { OrgUnitType } from '@core/domains/orgunit/types';
import { SubscriptionStatus } from '@core/domains/subscription/types';
import { ok, fail } from '@core/utils';
import { technicalError } from '@core/utils';

// ---------------------------------------------------------------------------
// Mock Type Helper
// ---------------------------------------------------------------------------

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K];
};

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TEST_TENANT_ID = 'tenant-001';
const TEST_USER_ID = 'user-001';
const TEST_ORGUNIT_ID = 'orgunit-001';
const TEST_SUBSCRIPTION_ID = 'subscription-001';
const TEST_MEMBERSHIP_ID = 'membership-001';
const TEST_PLAN_ID = 'plan-trial-001';

const createTestTenantInput = (overrides?: Partial<CreateTenantInput>): CreateTenantInput => ({
  name: 'RT 01 Merdeka',
  rtRwNumber: 'RT01/RW05',
  region: 'Jakarta Selatan',
  address: 'Jl. Merdeka No. 1',
  contactPerson: 'Budi Santoso',
  ...overrides,
});

const createTestTenant = (overrides?: Partial<Tenant>): Tenant => ({
  id: TEST_TENANT_ID,
  name: 'RT 01 Merdeka',
  subdomain: 'rt-01-merdeka',
  rtRwNumber: 'RT01/RW05',
  region: 'Jakarta Selatan',
  address: 'Jl. Merdeka No. 1',
  contactPerson: 'Budi Santoso',
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
  sirenDeviceId: null,
  status: 'active',
  subscriptionPlanId: TEST_PLAN_ID,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const createTestOrgUnit = (overrides?: Partial<OrgUnit>): OrgUnit => ({
  id: TEST_ORGUNIT_ID,
  tenantId: TEST_TENANT_ID,
  parentId: null,
  type: OrgUnitType.ORGANIZATION,
  name: 'RT 01 Merdeka',
  path: [TEST_ORGUNIT_ID],
  depth: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const createTestMembership = (overrides?: Partial<Membership>): Membership => ({
  id: TEST_MEMBERSHIP_ID,
  userId: TEST_USER_ID,
  tenantId: TEST_TENANT_ID,
  orgUnitId: null, // TENANT_OWNER has null orgUnitId
  role: MembershipRole.TENANT_OWNER,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const createTestSubscription = (overrides?: Partial<Subscription>): Subscription => ({
  id: TEST_SUBSCRIPTION_ID,
  tenantId: TEST_TENANT_ID,
  planId: TEST_PLAN_ID,
  status: SubscriptionStatus.TRIAL,
  startedAt: new Date('2024-01-01'),
  currentPeriodEnd: null,
  trialEndsAt: new Date('2024-01-15'),
  suspendedAt: null,
  closedAt: null,
  statusReason: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

const createMockTenantOnboardingRepository = (): Mocked<TenantOnboardingRepository> => ({
  createWithLifecycle: vi.fn(),
  updateLifecycleStatus: vi.fn(),
  checkDuplicate: vi.fn(),
});

const createMockOrgUnitOnboardingRepository = (): Mocked<OrgUnitOnboardingRepository> => ({
  createRoot: vi.fn(),
});

const createMockSubscriptionOnboardingRepository = (): Mocked<SubscriptionOnboardingRepository> => ({
  create: vi.fn(),
  getDefaultTrialPlanId: vi.fn(),
});

const createMockMembershipRepository = (): Mocked<IMembershipRepository> => ({
  findByUserId: vi.fn(),
  findByUserAndTenant: vi.fn(),
  findActiveByUserAndTenant: vi.fn(),
  findByUserAndTenantWithStatus: vi.fn(),
  resolveMembership: vi.fn(),
  isQuarantined: vi.fn(),
  hasActiveMembershipInTenant: vi.fn(),
  countByUserAndTenant: vi.fn(),
});

const createMockMembershipWriteRepository = (): Mocked<MembershipWriteRepository> => ({
  create: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
  existsActiveMembership: vi.fn(),
  countActiveMemberships: vi.fn(),
  delete: vi.fn(),
});

const createMockEventEmitter = (): Mocked<IOnboardingEventEmitter> => ({
  emit: vi.fn().mockResolvedValue(undefined),
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('TenantOnboardingService', () => {
  let service: ITenantOnboardingService;
  let mockTenantRepo: Mocked<TenantOnboardingRepository>;
  let mockOrgUnitRepo: Mocked<OrgUnitOnboardingRepository>;
  let mockSubscriptionRepo: Mocked<SubscriptionOnboardingRepository>;
  let mockMembershipRepo: Mocked<IMembershipRepository>;
  let mockMembershipWriteRepo: Mocked<MembershipWriteRepository>;
  let mockEventEmitter: Mocked<IOnboardingEventEmitter>;
  let capturedEvents: OnboardingEvent[];

  beforeEach(() => {
    mockTenantRepo = createMockTenantOnboardingRepository();
    mockOrgUnitRepo = createMockOrgUnitOnboardingRepository();
    mockSubscriptionRepo = createMockSubscriptionOnboardingRepository();
    mockMembershipRepo = createMockMembershipRepository();
    mockMembershipWriteRepo = createMockMembershipWriteRepository();
    mockEventEmitter = createMockEventEmitter();
    capturedEvents = [];

    // Capture emitted events
    mockEventEmitter.emit.mockImplementation(async (event) => {
      capturedEvents.push(event);
    });

    // Default mock implementations for happy path
    mockMembershipRepo.isQuarantined.mockResolvedValue(false);
    mockMembershipRepo.findByUserId.mockResolvedValue([]);
    mockTenantRepo.checkDuplicate.mockResolvedValue(ok(false));
    mockSubscriptionRepo.getDefaultTrialPlanId.mockResolvedValue(ok(TEST_PLAN_ID));

    service = TenantOnboardingServiceImpl({
      tenantOnboardingRepository: mockTenantRepo,
      orgUnitOnboardingRepository: mockOrgUnitRepo,
      subscriptionOnboardingRepository: mockSubscriptionRepo,
      membershipRepository: mockMembershipRepo,
      membershipWriteRepository: mockMembershipWriteRepo,
      eventEmitter: mockEventEmitter,
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle Transition Tests
  // -------------------------------------------------------------------------

  describe('isValidLifecycleTransition', () => {
    it('should allow PROVISIONING → ACTIVE transition', () => {
      expect(isValidLifecycleTransition(
        TenantLifecycleStatus.PROVISIONING,
        TenantLifecycleStatus.ACTIVE,
      )).toBe(true);
    });

    it('should allow ACTIVE → SUSPENDED transition', () => {
      expect(isValidLifecycleTransition(
        TenantLifecycleStatus.ACTIVE,
        TenantLifecycleStatus.SUSPENDED,
      )).toBe(true);
    });

    it('should allow SUSPENDED → ACTIVE transition', () => {
      expect(isValidLifecycleTransition(
        TenantLifecycleStatus.SUSPENDED,
        TenantLifecycleStatus.ACTIVE,
      )).toBe(true);
    });

    it('should not allow PROVISIONING → SUSPENDED transition', () => {
      expect(isValidLifecycleTransition(
        TenantLifecycleStatus.PROVISIONING,
        TenantLifecycleStatus.SUSPENDED,
      )).toBe(false);
    });

    it('should not allow PURGED → any transition (terminal state)', () => {
      expect(isValidLifecycleTransition(
        TenantLifecycleStatus.PURGED,
        TenantLifecycleStatus.ACTIVE,
      )).toBe(false);
      expect(isValidLifecycleTransition(
        TenantLifecycleStatus.PURGED,
        TenantLifecycleStatus.PROVISIONING,
      )).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Onboarding Happy Path Tests
  // -------------------------------------------------------------------------

  describe('onboard - Happy Path', () => {
    beforeEach(() => {
      // Setup happy path mocks
      const tenant = createTestTenant();
      const orgUnit = createTestOrgUnit();
      const membership = createTestMembership();
      const subscription = createTestSubscription();

      mockTenantRepo.createWithLifecycle.mockResolvedValue(ok(tenant));
      mockTenantRepo.updateLifecycleStatus.mockResolvedValue(ok(tenant));
      mockOrgUnitRepo.createRoot.mockResolvedValue(ok(orgUnit));
      mockMembershipWriteRepo.create.mockResolvedValue(ok(membership));
      mockSubscriptionRepo.create.mockResolvedValue(ok(subscription));
    });

    it('should complete full onboarding flow successfully', async () => {
      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenant.id).toBe(TEST_TENANT_ID);
        expect(result.data.rootOrgUnit.depth).toBe(0);
        expect(result.data.rootOrgUnit.path).toEqual([TEST_ORGUNIT_ID]);
        expect(result.data.ownerMembership.role).toBe(MembershipRole.TENANT_OWNER);
        expect(result.data.ownerMembership.orgUnitId).toBeNull();
        expect(result.data.subscription.status).toBe(SubscriptionStatus.TRIAL);
      }
    });

    it('should emit events for each onboarding step', async () => {
      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert - check event sequence
      const eventTypes = capturedEvents.map(e => e.type);
      expect(eventTypes).toContain(OnboardingEventType.STARTED);
      expect(eventTypes).toContain(OnboardingEventType.TENANT_CREATED);
      expect(eventTypes).toContain(OnboardingEventType.ORGUNIT_CREATED);
      expect(eventTypes).toContain(OnboardingEventType.MEMBERSHIP_CREATED);
      expect(eventTypes).toContain(OnboardingEventType.SUBSCRIPTION_CREATED);
      expect(eventTypes).toContain(OnboardingEventType.COMPLETED);
    });

    it('should create root OrgUnit with depth=0 and path=[id]', async () => {
      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rootOrgUnit.depth).toBe(0);
        expect(result.data.rootOrgUnit.path.length).toBe(1);
        expect(result.data.rootOrgUnit.path[0]).toBe(result.data.rootOrgUnit.id);
        expect(result.data.rootOrgUnit.parentId).toBeNull();
      }
    });

    it('should create TENANT_OWNER membership with null orgUnitId', async () => {
      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ownerMembership.role).toBe(MembershipRole.TENANT_OWNER);
        expect(result.data.ownerMembership.orgUnitId).toBeNull();
        expect(result.data.ownerMembership.status).toBe(MembershipStatus.ACTIVE);
      }
    });

    it('should create subscription with TRIAL status', async () => {
      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subscription.status).toBe(SubscriptionStatus.TRIAL);
        expect(result.data.subscription.trialEndsAt).toBeDefined();
      }
    });

    it('should use provided planId instead of default', async () => {
      const customPlanId = 'plan-premium-001';
      const subscription = createTestSubscription({ planId: customPlanId });
      mockSubscriptionRepo.create.mockResolvedValue(ok(subscription));

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        planId: customPlanId,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(mockSubscriptionRepo.getDefaultTrialPlanId).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Validation Tests - Quarantine
  // -------------------------------------------------------------------------

  describe('onboard - Quarantine Check', () => {
    it('should reject quarantined user as owner (INV-QUARANTINE-001)', async () => {
      // Arrange
      mockMembershipRepo.isQuarantined.mockResolvedValue(true);

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ONBOARDING_USER_QUARANTINED');
      }
    });

    it('should emit FAILED event when user is quarantined', async () => {
      // Arrange
      mockMembershipRepo.isQuarantined.mockResolvedValue(true);

      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      const failedEvent = capturedEvents.find(e => e.type === OnboardingEventType.FAILED);
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.error?.code).toBe('ONBOARDING_USER_QUARANTINED');
    });
  });

  // -------------------------------------------------------------------------
  // Validation Tests - Existing Owner
  // -------------------------------------------------------------------------

  describe('onboard - Owner Already Exists', () => {
    it('should reject user who is already TENANT_OWNER', async () => {
      // Arrange - user already has TENANT_OWNER membership
      mockMembershipRepo.findByUserId.mockResolvedValue([
        createTestMembership({
          role: MembershipRole.TENANT_OWNER,
          status: MembershipStatus.ACTIVE,
        }),
      ]);

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ONBOARDING_OWNER_ALREADY_EXISTS');
      }
    });

    it('should allow user with non-owner memberships', async () => {
      // Arrange - user has RESIDENT membership (not owner)
      mockMembershipRepo.findByUserId.mockResolvedValue([
        createTestMembership({
          role: MembershipRole.RESIDENT,
          status: MembershipStatus.ACTIVE,
        }),
      ]);

      // Setup happy path for rest
      const tenant = createTestTenant();
      mockTenantRepo.createWithLifecycle.mockResolvedValue(ok(tenant));
      mockTenantRepo.updateLifecycleStatus.mockResolvedValue(ok(tenant));
      mockOrgUnitRepo.createRoot.mockResolvedValue(ok(createTestOrgUnit()));
      mockMembershipWriteRepo.create.mockResolvedValue(ok(createTestMembership()));
      mockSubscriptionRepo.create.mockResolvedValue(ok(createTestSubscription()));

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(true);
    });

    it('should allow user with REVOKED TENANT_OWNER membership', async () => {
      // Arrange - user has revoked owner membership
      mockMembershipRepo.findByUserId.mockResolvedValue([
        createTestMembership({
          role: MembershipRole.TENANT_OWNER,
          status: MembershipStatus.REVOKED,
        }),
      ]);

      // Setup happy path
      const tenant = createTestTenant();
      mockTenantRepo.createWithLifecycle.mockResolvedValue(ok(tenant));
      mockTenantRepo.updateLifecycleStatus.mockResolvedValue(ok(tenant));
      mockOrgUnitRepo.createRoot.mockResolvedValue(ok(createTestOrgUnit()));
      mockMembershipWriteRepo.create.mockResolvedValue(ok(createTestMembership()));
      mockSubscriptionRepo.create.mockResolvedValue(ok(createTestSubscription()));

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Validation Tests - Duplicate Tenant
  // -------------------------------------------------------------------------

  describe('onboard - Duplicate Tenant Check', () => {
    it('should reject duplicate tenant (same subdomain or rtRwNumber+region)', async () => {
      // Arrange
      mockTenantRepo.checkDuplicate.mockResolvedValue(ok(true));

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ONBOARDING_TENANT_DUPLICATE');
      }
    });

    it('should emit FAILED event when tenant is duplicate', async () => {
      // Arrange
      mockTenantRepo.checkDuplicate.mockResolvedValue(ok(true));

      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      const failedEvent = capturedEvents.find(e => e.type === OnboardingEventType.FAILED);
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.error?.code).toBe('ONBOARDING_TENANT_DUPLICATE');
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling Tests - Step Failures
  // -------------------------------------------------------------------------

  describe('onboard - Step Failure Handling', () => {
    it('should fail gracefully when tenant creation fails', async () => {
      // Arrange
      mockTenantRepo.createWithLifecycle.mockResolvedValue(
        fail(technicalError('DB_ERROR', 'Database connection failed')),
      );

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ONBOARDING_FAILED');
      }
    });

    it('should fail gracefully when OrgUnit creation fails', async () => {
      // Arrange
      mockTenantRepo.createWithLifecycle.mockResolvedValue(ok(createTestTenant()));
      mockOrgUnitRepo.createRoot.mockResolvedValue(
        fail(technicalError('DB_ERROR', 'Failed to create OrgUnit')),
      );

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ONBOARDING_FAILED');
      }
    });

    it('should fail gracefully when membership creation fails', async () => {
      // Arrange
      mockTenantRepo.createWithLifecycle.mockResolvedValue(ok(createTestTenant()));
      mockTenantRepo.updateLifecycleStatus.mockResolvedValue(ok(createTestTenant()));
      mockOrgUnitRepo.createRoot.mockResolvedValue(ok(createTestOrgUnit()));
      mockMembershipWriteRepo.create.mockResolvedValue(
        fail(technicalError('DB_ERROR', 'Failed to create membership')),
      );

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ONBOARDING_FAILED');
      }
    });

    it('should fail gracefully when subscription creation fails', async () => {
      // Arrange
      mockTenantRepo.createWithLifecycle.mockResolvedValue(ok(createTestTenant()));
      mockTenantRepo.updateLifecycleStatus.mockResolvedValue(ok(createTestTenant()));
      mockOrgUnitRepo.createRoot.mockResolvedValue(ok(createTestOrgUnit()));
      mockMembershipWriteRepo.create.mockResolvedValue(ok(createTestMembership()));
      mockSubscriptionRepo.create.mockResolvedValue(
        fail(technicalError('DB_ERROR', 'Failed to create subscription')),
      );

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ONBOARDING_FAILED');
      }
    });

    it('should fail gracefully when activation fails', async () => {
      // Arrange
      mockTenantRepo.createWithLifecycle.mockResolvedValue(ok(createTestTenant()));
      mockOrgUnitRepo.createRoot.mockResolvedValue(ok(createTestOrgUnit()));
      mockMembershipWriteRepo.create.mockResolvedValue(ok(createTestMembership()));
      mockSubscriptionRepo.create.mockResolvedValue(ok(createTestSubscription()));
      mockTenantRepo.updateLifecycleStatus.mockResolvedValue(
        fail(technicalError('DB_ERROR', 'Failed to activate tenant')),
      );

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ONBOARDING_FAILED');
      }
    });

    it('should fail when default plan cannot be retrieved', async () => {
      // Arrange
      mockSubscriptionRepo.getDefaultTrialPlanId.mockResolvedValue(
        fail(technicalError('CONFIG_ERROR', 'No default trial plan configured')),
      );

      // Act
      const result = await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ONBOARDING_FAILED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // isAlreadyTenantOwner Tests
  // -------------------------------------------------------------------------

  describe('isAlreadyTenantOwner', () => {
    it('should return true when user has active TENANT_OWNER membership', async () => {
      // Arrange
      mockMembershipRepo.findByUserId.mockResolvedValue([
        createTestMembership({
          role: MembershipRole.TENANT_OWNER,
          status: MembershipStatus.ACTIVE,
        }),
      ]);

      // Act
      const result = await service.isAlreadyTenantOwner(TEST_USER_ID);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when user has no memberships', async () => {
      // Arrange
      mockMembershipRepo.findByUserId.mockResolvedValue([]);

      // Act
      const result = await service.isAlreadyTenantOwner(TEST_USER_ID);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when user has only RESIDENT membership', async () => {
      // Arrange
      mockMembershipRepo.findByUserId.mockResolvedValue([
        createTestMembership({
          role: MembershipRole.RESIDENT,
          status: MembershipStatus.ACTIVE,
        }),
      ]);

      // Act
      const result = await service.isAlreadyTenantOwner(TEST_USER_ID);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when TENANT_OWNER membership is REVOKED', async () => {
      // Arrange
      mockMembershipRepo.findByUserId.mockResolvedValue([
        createTestMembership({
          role: MembershipRole.TENANT_OWNER,
          status: MembershipStatus.REVOKED,
        }),
      ]);

      // Act
      const result = await service.isAlreadyTenantOwner(TEST_USER_ID);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when TENANT_OWNER membership is SUSPENDED', async () => {
      // Arrange
      mockMembershipRepo.findByUserId.mockResolvedValue([
        createTestMembership({
          role: MembershipRole.TENANT_OWNER,
          status: MembershipStatus.SUSPENDED,
        }),
      ]);

      // Act
      const result = await service.isAlreadyTenantOwner(TEST_USER_ID);

      // Assert
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Event Details Tests
  // -------------------------------------------------------------------------

  describe('Event emission details', () => {
    beforeEach(() => {
      // Setup happy path
      const tenant = createTestTenant();
      mockTenantRepo.createWithLifecycle.mockResolvedValue(ok(tenant));
      mockTenantRepo.updateLifecycleStatus.mockResolvedValue(ok(tenant));
      mockOrgUnitRepo.createRoot.mockResolvedValue(ok(createTestOrgUnit()));
      mockMembershipWriteRepo.create.mockResolvedValue(ok(createTestMembership()));
      mockSubscriptionRepo.create.mockResolvedValue(ok(createTestSubscription()));
    });

    it('should include tenantId in all events after tenant creation', async () => {
      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      const eventsAfterTenantCreation = capturedEvents.filter(
        e => e.type !== OnboardingEventType.STARTED,
      );
      eventsAfterTenantCreation.forEach(event => {
        expect(event.tenantId).toBe(TEST_TENANT_ID);
      });
    });

    it('should include initiatedBy in all events', async () => {
      const initiatorId = 'initiator-001';

      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: initiatorId,
      });

      // Assert
      capturedEvents.forEach(event => {
        expect(event.initiatedBy).toBe(initiatorId);
      });
    });

    it('should include timestamp in all events', async () => {
      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      capturedEvents.forEach(event => {
        expect(event.timestamp).toBeInstanceOf(Date);
      });
    });

    it('should include lifecycle status in TENANT_CREATED event', async () => {
      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      const tenantCreatedEvent = capturedEvents.find(
        e => e.type === OnboardingEventType.TENANT_CREATED,
      );
      expect(tenantCreatedEvent?.details?.lifecycleStatus).toBe(TenantLifecycleStatus.PROVISIONING);
    });

    it('should include OrgUnit details in ORGUNIT_CREATED event', async () => {
      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      const orgUnitCreatedEvent = capturedEvents.find(
        e => e.type === OnboardingEventType.ORGUNIT_CREATED,
      );
      expect(orgUnitCreatedEvent?.details?.depth).toBe(0);
      expect(orgUnitCreatedEvent?.details?.path).toEqual([TEST_ORGUNIT_ID]);
    });

    it('should include membership role in MEMBERSHIP_CREATED event', async () => {
      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      const membershipCreatedEvent = capturedEvents.find(
        e => e.type === OnboardingEventType.MEMBERSHIP_CREATED,
      );
      expect(membershipCreatedEvent?.details?.role).toBe(MembershipRole.TENANT_OWNER);
    });

    it('should include subscription status in SUBSCRIPTION_CREATED event', async () => {
      // Act
      await service.onboard({
        tenantData: createTestTenantInput(),
        ownerUserId: TEST_USER_ID,
        initiatedBy: TEST_USER_ID,
      });

      // Assert
      const subscriptionCreatedEvent = capturedEvents.find(
        e => e.type === OnboardingEventType.SUBSCRIPTION_CREATED,
      );
      expect(subscriptionCreatedEvent?.details?.status).toBe(SubscriptionStatus.TRIAL);
    });
  });
});
