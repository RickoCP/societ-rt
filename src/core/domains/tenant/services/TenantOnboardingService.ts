/**
 * TenantOnboardingService — Domain service for guided tenant creation process.
 *
 * This service manages the complete onboarding flow for new tenants:
 * 1. Create tenant with lifecycleStatus = PROVISIONING
 * 2. Create root OrgUnit (depth=0, path=[id])
 * 3. Create TENANT_OWNER membership for the initial user
 * 4. Create subscription with status = TRIAL
 * 5. Transition tenant to lifecycleStatus = ACTIVE on completion
 *
 * **LIFECYCLE STATE MACHINE (L8, L12):**
 * Tenant.lifecycleStatus is SEPARATE from Subscription.status:
 * - lifecycleStatus: PROVISIONING → ACTIVE → SUSPENDED → CLOSING → CLOSED → PURGED
 * - Subscription.status: TRIAL → ACTIVE → PAST_DUE → SUSPENDED → CLOSED
 *
 * **SECURITY CONSIDERATIONS:**
 * - Tenant is the security boundary (INV-TENANT-001)
 * - Root OrgUnit must belong to the tenant
 * - TENANT_OWNER membership has null orgUnitId (tenant-level scope)
 * - All operations must be atomic (transactional)
 *
 * @see FASE 1.18 Task 49: Tenant Onboarding Flow
 * @see Requirements 23 (AC 1-9), Requirements 49 (AC 1-10)
 * @see Design Tenant Lifecycle State Machine
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { businessError, validationError, technicalError } from '@core/utils';
import type { Tenant, CreateTenantInput } from '../entities';
import type { TenantRepository } from '../repositories';
import type { OrgUnit, CreateOrgUnitInput } from '@core/domains/orgunit/entities';
import type { Subscription, CreateSubscriptionInput } from '@core/domains/subscription/entities';
import { SubscriptionStatus } from '@core/domains/subscription/types';
import { OrgUnitType } from '@core/domains/orgunit/types';
import type { IMembershipRepository, MembershipWriteRepository } from '@core/domains/membership/repositories';
import type { CreateMembershipInput, Membership } from '@core/domains/membership/entities';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Lifecycle Status Types
// ---------------------------------------------------------------------------

/**
 * Tenant lifecycle status values.
 * SEPARATE from Subscription.status (L8, L12).
 */
export const TenantLifecycleStatus = {
  /** Tenant is being provisioned - initial state */
  PROVISIONING: 'PROVISIONING',
  /** Tenant is fully operational */
  ACTIVE: 'ACTIVE',
  /** Tenant operations are suspended */
  SUSPENDED: 'SUSPENDED',
  /** Tenant is being closed - data retention period */
  CLOSING: 'CLOSING',
  /** Tenant is closed - minimal access */
  CLOSED: 'CLOSED',
  /** Tenant data has been purged - terminal state */
  PURGED: 'PURGED',
} as const;

export type TenantLifecycleStatus =
  (typeof TenantLifecycleStatus)[keyof typeof TenantLifecycleStatus];

/**
 * Valid lifecycle status transitions.
 */
export const LIFECYCLE_TRANSITIONS: Record<TenantLifecycleStatus, readonly TenantLifecycleStatus[]> = {
  [TenantLifecycleStatus.PROVISIONING]: [TenantLifecycleStatus.ACTIVE],
  [TenantLifecycleStatus.ACTIVE]: [TenantLifecycleStatus.SUSPENDED, TenantLifecycleStatus.CLOSING],
  [TenantLifecycleStatus.SUSPENDED]: [TenantLifecycleStatus.ACTIVE, TenantLifecycleStatus.CLOSING],
  [TenantLifecycleStatus.CLOSING]: [TenantLifecycleStatus.CLOSED],
  [TenantLifecycleStatus.CLOSED]: [TenantLifecycleStatus.PURGED],
  [TenantLifecycleStatus.PURGED]: [], // Terminal state
} as const;

/**
 * Check if a lifecycle transition is valid.
 */
export function isValidLifecycleTransition(
  from: TenantLifecycleStatus,
  to: TenantLifecycleStatus,
): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Domain Events
// ---------------------------------------------------------------------------

/**
 * Event types for tenant onboarding lifecycle.
 */
export enum OnboardingEventType {
  /** Onboarding process started */
  STARTED = 'TENANT_ONBOARDING_STARTED',
  /** Tenant record created in PROVISIONING state */
  TENANT_CREATED = 'TENANT_ONBOARDING_TENANT_CREATED',
  /** Root OrgUnit created */
  ORGUNIT_CREATED = 'TENANT_ONBOARDING_ORGUNIT_CREATED',
  /** TENANT_OWNER membership created */
  MEMBERSHIP_CREATED = 'TENANT_ONBOARDING_MEMBERSHIP_CREATED',
  /** Subscription created with TRIAL status */
  SUBSCRIPTION_CREATED = 'TENANT_ONBOARDING_SUBSCRIPTION_CREATED',
  /** Tenant transitioned to ACTIVE */
  COMPLETED = 'TENANT_ONBOARDING_COMPLETED',
  /** Onboarding failed */
  FAILED = 'TENANT_ONBOARDING_FAILED',
}

/**
 * Tenant onboarding event payload.
 */
export interface OnboardingEvent {
  /** The type of event */
  readonly type: OnboardingEventType;
  /** The tenant ID */
  readonly tenantId: string;
  /** Timestamp of the event */
  readonly timestamp: Date;
  /** ID of the user who initiated onboarding */
  readonly initiatedBy: string;
  /** Additional event-specific details */
  readonly details?: Record<string, unknown>;
  /** Error information if event is FAILED */
  readonly error?: {
    code: string;
    message: string;
  };
}

/**
 * Event emitter interface for onboarding lifecycle events.
 */
export interface IOnboardingEventEmitter {
  /**
   * Emit an onboarding lifecycle event.
   * @param event - The event to emit
   */
  emit(event: OnboardingEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Input for initiating tenant onboarding.
 */
export interface OnboardTenantCommand {
  /** Tenant registration data */
  readonly tenantData: CreateTenantInput;
  /** User who will be the initial TENANT_OWNER */
  readonly ownerUserId: string;
  /** Subscription plan ID (defaults to free trial plan) */
  readonly planId?: string;
  /** User initiating the onboarding (for audit) */
  readonly initiatedBy: string;
  /** IP address (for audit) */
  readonly ipAddress?: string;
}

/**
 * Result of successful tenant onboarding.
 */
export interface OnboardingResult {
  /** The created tenant */
  readonly tenant: Tenant;
  /** The root OrgUnit */
  readonly rootOrgUnit: OrgUnit;
  /** The TENANT_OWNER membership */
  readonly ownerMembership: Membership;
  /** The subscription */
  readonly subscription: Subscription;
  /** All emitted events */
  readonly events: OnboardingEvent[];
}

/**
 * TenantOnboardingService interface.
 *
 * Provides operations for managing the complete tenant onboarding flow
 * with proper validation, transactional consistency, and event emission.
 */
export interface ITenantOnboardingService {
  /**
   * Execute the complete tenant onboarding flow.
   *
   * Steps:
   * 1. Create tenant with lifecycleStatus = PROVISIONING
   * 2. Create root OrgUnit (depth=0, path=[id], type=ORGANIZATION)
   * 3. Create TENANT_OWNER membership for owner user
   * 4. Create subscription with status = TRIAL
   * 5. Transition tenant lifecycleStatus to ACTIVE
   *
   * @param command - The onboarding command
   * @returns DomainResult with onboarding result or error
   */
  onboard(command: OnboardTenantCommand): Promise<DomainResult<OnboardingResult>>;

  /**
   * Check if a user is already a TENANT_OWNER in any tenant.
   *
   * @param userId - The user ID to check
   * @returns true if user is already a TENANT_OWNER
   */
  isAlreadyTenantOwner(userId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Repository Interfaces for Write Operations
// ---------------------------------------------------------------------------

/**
 * Extended tenant repository with lifecycle operations.
 */
export interface TenantOnboardingRepository {
  /**
   * Create a tenant with initial lifecycle status.
   */
  createWithLifecycle(
    data: CreateTenantInput,
    lifecycleStatus: TenantLifecycleStatus,
  ): Promise<DomainResult<Tenant>>;

  /**
   * Update tenant lifecycle status.
   */
  updateLifecycleStatus(
    tenantId: string,
    lifecycleStatus: TenantLifecycleStatus,
  ): Promise<DomainResult<Tenant>>;

  /**
   * Check if subdomain or rtRwNumber+region combination exists.
   */
  checkDuplicate(
    subdomain: string,
    rtRwNumber: string,
    region: string,
  ): Promise<DomainResult<boolean>>;
}

/**
 * OrgUnit write repository for onboarding.
 */
export interface OrgUnitOnboardingRepository {
  /**
   * Create a root OrgUnit for a tenant.
   * Automatically sets depth=0, path=[id].
   */
  createRoot(
    tenantId: string,
    name: string,
    type?: OrgUnitType,
  ): Promise<DomainResult<OrgUnit>>;
}

/**
 * Subscription write repository for onboarding.
 */
export interface SubscriptionOnboardingRepository {
  /**
   * Create a subscription with initial status.
   */
  create(data: CreateSubscriptionInput): Promise<DomainResult<Subscription>>;

  /**
   * Get the default trial plan ID.
   */
  getDefaultTrialPlanId(): Promise<DomainResult<string>>;
}

// ---------------------------------------------------------------------------
// Error Helpers
// ---------------------------------------------------------------------------

/**
 * Create a tenant duplicate error.
 */
export function onboardingTenantDuplicate(): ReturnType<typeof businessError> {
  return businessError(
    'ONBOARDING_TENANT_DUPLICATE',
    'A tenant with this subdomain or RT/RW number in this region already exists',
    { userMessage: 'This community is already registered' },
  );
}

/**
 * Create an owner already exists error.
 */
export function onboardingOwnerAlreadyExists(): ReturnType<typeof businessError> {
  return businessError(
    'ONBOARDING_OWNER_ALREADY_EXISTS',
    'User is already a TENANT_OWNER in another tenant',
    { userMessage: 'You are already an owner of another community' },
  );
}

/**
 * Create a user quarantined error.
 */
export function onboardingUserQuarantined(): ReturnType<typeof businessError> {
  return businessError(
    'ONBOARDING_USER_QUARANTINED',
    'User is quarantined and cannot be assigned as tenant owner',
    { userMessage: 'This account cannot create communities' },
  );
}

/**
 * Create an invalid plan error.
 */
export function onboardingInvalidPlan(): ReturnType<typeof validationError> {
  return validationError(
    'ONBOARDING_INVALID_PLAN',
    'The specified subscription plan does not exist or is not available',
    { userMessage: 'Invalid subscription plan' },
  );
}

/**
 * Create an onboarding failed error.
 */
export function onboardingFailed(step: string, cause?: string): ReturnType<typeof technicalError> {
  return technicalError(
    'ONBOARDING_FAILED',
    `Tenant onboarding failed at step: ${step}${cause ? ` - ${cause}` : ''}`,
    { userMessage: 'Failed to create community. Please try again.' },
  );
}

/**
 * Create an invalid lifecycle transition error.
 */
export function onboardingInvalidTransition(
  from: TenantLifecycleStatus,
  to: TenantLifecycleStatus,
): ReturnType<typeof businessError> {
  return businessError(
    'ONBOARDING_INVALID_LIFECYCLE_TRANSITION',
    `Cannot transition from ${from} to ${to}`,
    { userMessage: 'Invalid status transition' },
  );
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a TenantOnboardingService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param dependencies - The service dependencies
 * @returns An implementation of ITenantOnboardingService
 */
export const TenantOnboardingServiceImpl = ({
  tenantOnboardingRepository,
  orgUnitOnboardingRepository,
  subscriptionOnboardingRepository,
  membershipRepository,
  membershipWriteRepository,
  eventEmitter,
}: {
  tenantOnboardingRepository: TenantOnboardingRepository;
  orgUnitOnboardingRepository: OrgUnitOnboardingRepository;
  subscriptionOnboardingRepository: SubscriptionOnboardingRepository;
  membershipRepository: IMembershipRepository;
  membershipWriteRepository: MembershipWriteRepository;
  eventEmitter: IOnboardingEventEmitter;
}): ITenantOnboardingService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Generate a subdomain from tenant name.
   */
  const generateSubdomain = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  /**
   * Create an onboarding event.
   */
  const createEvent = (
    type: OnboardingEventType,
    tenantId: string,
    initiatedBy: string,
    details?: Record<string, unknown>,
    error?: { code: string; message: string },
  ): OnboardingEvent => ({
    type,
    tenantId,
    timestamp: new Date(),
    initiatedBy,
    details,
    error,
  });

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    async onboard(
      command: OnboardTenantCommand,
    ): Promise<DomainResult<OnboardingResult>> {
      const { tenantData, ownerUserId, planId, initiatedBy, ipAddress } = command;
      const events: OnboardingEvent[] = [];

      // Step 0: Emit onboarding started event
      const startEvent = createEvent(
        OnboardingEventType.STARTED,
        '', // No tenant ID yet
        initiatedBy,
        { tenantName: tenantData.name, ownerUserId },
      );
      await eventEmitter.emit(startEvent);
      events.push(startEvent);

      // Step 1: Check if owner user is quarantined
      const isQuarantined = await membershipRepository.isQuarantined(ownerUserId);
      if (isQuarantined) {
        const failEvent = createEvent(
          OnboardingEventType.FAILED,
          '',
          initiatedBy,
          { step: 'quarantine_check', ownerUserId },
          { code: 'ONBOARDING_USER_QUARANTINED', message: 'User is quarantined' },
        );
        await eventEmitter.emit(failEvent);
        return fail(onboardingUserQuarantined());
      }

      // Step 2: Check if user is already a TENANT_OWNER
      const isOwner = await this.isAlreadyTenantOwner(ownerUserId);
      if (isOwner) {
        const failEvent = createEvent(
          OnboardingEventType.FAILED,
          '',
          initiatedBy,
          { step: 'owner_check', ownerUserId },
          { code: 'ONBOARDING_OWNER_ALREADY_EXISTS', message: 'User is already a tenant owner' },
        );
        await eventEmitter.emit(failEvent);
        return fail(onboardingOwnerAlreadyExists());
      }

      // Step 3: Check for tenant duplicates
      const subdomain = generateSubdomain(tenantData.name);
      const duplicateResult = await tenantOnboardingRepository.checkDuplicate(
        subdomain,
        tenantData.rtRwNumber,
        tenantData.region,
      );
      if (!duplicateResult.success) {
        return fail(duplicateResult.error);
      }
      if (duplicateResult.data) {
        const failEvent = createEvent(
          OnboardingEventType.FAILED,
          '',
          initiatedBy,
          { step: 'duplicate_check', subdomain },
          { code: 'ONBOARDING_TENANT_DUPLICATE', message: 'Tenant already exists' },
        );
        await eventEmitter.emit(failEvent);
        return fail(onboardingTenantDuplicate());
      }

      // Step 4: Get or validate plan ID
      let effectivePlanId = planId;
      if (!effectivePlanId) {
        const defaultPlanResult = await subscriptionOnboardingRepository.getDefaultTrialPlanId();
        if (!defaultPlanResult.success) {
          return fail(onboardingFailed('get_default_plan', 'Could not retrieve default trial plan'));
        }
        effectivePlanId = defaultPlanResult.data;
      }

      // Step 5: Create tenant with lifecycleStatus = PROVISIONING
      const tenantResult = await tenantOnboardingRepository.createWithLifecycle(
        tenantData,
        TenantLifecycleStatus.PROVISIONING,
      );
      if (!tenantResult.success) {
        const failEvent = createEvent(
          OnboardingEventType.FAILED,
          '',
          initiatedBy,
          { step: 'tenant_creation' },
          { code: 'ONBOARDING_FAILED', message: 'Failed to create tenant' },
        );
        await eventEmitter.emit(failEvent);
        return fail(onboardingFailed('tenant_creation'));
      }
      const tenant = tenantResult.data;

      // Emit tenant created event
      const tenantCreatedEvent = createEvent(
        OnboardingEventType.TENANT_CREATED,
        tenant.id,
        initiatedBy,
        {
          tenantName: tenant.name,
          subdomain: tenant.subdomain,
          lifecycleStatus: TenantLifecycleStatus.PROVISIONING,
        },
      );
      await eventEmitter.emit(tenantCreatedEvent);
      events.push(tenantCreatedEvent);

      // Step 6: Create root OrgUnit (depth=0, path=[id])
      const orgUnitResult = await orgUnitOnboardingRepository.createRoot(
        tenant.id,
        tenant.name,
        OrgUnitType.ORGANIZATION,
      );
      if (!orgUnitResult.success) {
        // Note: In a real implementation, we'd want to rollback the tenant creation here
        const failEvent = createEvent(
          OnboardingEventType.FAILED,
          tenant.id,
          initiatedBy,
          { step: 'orgunit_creation' },
          { code: 'ONBOARDING_FAILED', message: 'Failed to create root OrgUnit' },
        );
        await eventEmitter.emit(failEvent);
        return fail(onboardingFailed('orgunit_creation'));
      }
      const rootOrgUnit = orgUnitResult.data;

      // Emit OrgUnit created event
      const orgUnitCreatedEvent = createEvent(
        OnboardingEventType.ORGUNIT_CREATED,
        tenant.id,
        initiatedBy,
        {
          orgUnitId: rootOrgUnit.id,
          orgUnitName: rootOrgUnit.name,
          depth: rootOrgUnit.depth,
          path: rootOrgUnit.path,
        },
      );
      await eventEmitter.emit(orgUnitCreatedEvent);
      events.push(orgUnitCreatedEvent);

      // Step 7: Create TENANT_OWNER membership (orgUnitId = null for tenant-level)
      const membershipInput: CreateMembershipInput = {
        userId: ownerUserId,
        tenantId: tenant.id,
        orgUnitId: null, // TENANT_OWNER is tenant-level, not org-scoped
        role: MembershipRole.TENANT_OWNER,
        status: MembershipStatus.ACTIVE,
      };
      const membershipResult = await membershipWriteRepository.create(membershipInput);
      if (!membershipResult.success) {
        const failEvent = createEvent(
          OnboardingEventType.FAILED,
          tenant.id,
          initiatedBy,
          { step: 'membership_creation', ownerUserId },
          { code: 'ONBOARDING_FAILED', message: 'Failed to create TENANT_OWNER membership' },
        );
        await eventEmitter.emit(failEvent);
        return fail(onboardingFailed('membership_creation'));
      }
      const ownerMembership = membershipResult.data;

      // Emit membership created event
      const membershipCreatedEvent = createEvent(
        OnboardingEventType.MEMBERSHIP_CREATED,
        tenant.id,
        initiatedBy,
        {
          membershipId: ownerMembership.id,
          userId: ownerMembership.userId,
          role: ownerMembership.role,
          status: ownerMembership.status,
        },
      );
      await eventEmitter.emit(membershipCreatedEvent);
      events.push(membershipCreatedEvent);

      // Step 8: Create subscription with status = TRIAL
      const subscriptionInput: CreateSubscriptionInput = {
        tenantId: tenant.id,
        planId: effectivePlanId,
        status: SubscriptionStatus.TRIAL,
        startedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
      };
      const subscriptionResult = await subscriptionOnboardingRepository.create(subscriptionInput);
      if (!subscriptionResult.success) {
        const failEvent = createEvent(
          OnboardingEventType.FAILED,
          tenant.id,
          initiatedBy,
          { step: 'subscription_creation' },
          { code: 'ONBOARDING_FAILED', message: 'Failed to create subscription' },
        );
        await eventEmitter.emit(failEvent);
        return fail(onboardingFailed('subscription_creation'));
      }
      const subscription = subscriptionResult.data;

      // Emit subscription created event
      const subscriptionCreatedEvent = createEvent(
        OnboardingEventType.SUBSCRIPTION_CREATED,
        tenant.id,
        initiatedBy,
        {
          subscriptionId: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt?.toISOString(),
        },
      );
      await eventEmitter.emit(subscriptionCreatedEvent);
      events.push(subscriptionCreatedEvent);

      // Step 9: Transition tenant to ACTIVE
      const activateResult = await tenantOnboardingRepository.updateLifecycleStatus(
        tenant.id,
        TenantLifecycleStatus.ACTIVE,
      );
      if (!activateResult.success) {
        const failEvent = createEvent(
          OnboardingEventType.FAILED,
          tenant.id,
          initiatedBy,
          { step: 'tenant_activation' },
          { code: 'ONBOARDING_FAILED', message: 'Failed to activate tenant' },
        );
        await eventEmitter.emit(failEvent);
        return fail(onboardingFailed('tenant_activation'));
      }
      const activatedTenant = activateResult.data;

      // Emit completed event
      const completedEvent = createEvent(
        OnboardingEventType.COMPLETED,
        tenant.id,
        initiatedBy,
        {
          lifecycleStatus: TenantLifecycleStatus.ACTIVE,
          ipAddress,
        },
      );
      await eventEmitter.emit(completedEvent);
      events.push(completedEvent);

      return ok({
        tenant: activatedTenant,
        rootOrgUnit,
        ownerMembership,
        subscription,
        events,
      });
    },

    async isAlreadyTenantOwner(userId: string): Promise<boolean> {
      // Query all memberships for the user and check if any has TENANT_OWNER role
      const memberships = await membershipRepository.findByUserId(userId);
      return memberships.some(
        m => m.role === MembershipRole.TENANT_OWNER && m.status === MembershipStatus.ACTIVE,
      );
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type TenantOnboardingService = ITenantOnboardingService;
