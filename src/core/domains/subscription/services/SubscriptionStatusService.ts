/**
 * SubscriptionStatusService — Domain service for subscription status management.
 *
 * Manages the subscription lifecycle state machine with:
 * - Status transitions with validation
 * - History tracking for audit
 * - Event emission for downstream systems
 *
 * This is a factory function (DI-friendly) following Clean Architecture.
 *
 * @see Requirements 18 (AC 1-7)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  Subscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionStatusHistory,
  StatusTransitionEvent,
} from '../entities';
import { createStatusTransitionEvent } from '../entities';
import type { SubscriptionStatus } from '../types';
import {
  isValidStatusTransition,
  isOperationalStatus,
  isRestrictedStatus,
  isTerminalStatus,
  getAllowedTransitions,
  SubscriptionStatus as StatusEnum,
} from '../types';
import type { ISubscriptionRepository, SubscriptionQueryOptions } from '../repositories';
import {
  invalidStatusTransition,
  subscriptionNotFound,
  subscriptionAlreadyExists,
} from '../errors';

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface ISubscriptionStatusService {
  /** Create a new subscription for a tenant */
  createSubscription(
    data: CreateSubscriptionInput,
  ): Promise<DomainResult<Subscription>>;

  /** Get subscription by ID */
  getSubscriptionById(subscriptionId: string): Promise<DomainResult<Subscription>>;

  /** Get subscription by tenant ID */
  getSubscriptionByTenantId(tenantId: string): Promise<DomainResult<Subscription>>;

  /** List subscriptions with filters */
  listSubscriptions(
    options?: SubscriptionQueryOptions,
  ): Promise<DomainResult<Subscription[]>>;

  /** Transition subscription to a new status (Req 18 AC 1, 6-7) */
  transitionStatus(
    subscriptionId: string,
    newStatus: SubscriptionStatus,
    reason: string | null,
    operatorUserId: string,
    isAutomated?: boolean,
  ): Promise<DomainResult<Subscription>>;

  /** Transition subscription by tenant ID */
  transitionStatusByTenantId(
    tenantId: string,
    newStatus: SubscriptionStatus,
    reason: string | null,
    operatorUserId: string,
    isAutomated?: boolean,
  ): Promise<DomainResult<Subscription>>;

  /** Change subscription plan */
  changePlan(
    subscriptionId: string,
    newPlanId: string,
    operatorUserId: string,
  ): Promise<DomainResult<Subscription>>;

  /** Get status history (Req 18 AC 4) */
  getStatusHistory(
    subscriptionId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<DomainResult<SubscriptionStatusHistory[]>>;

  /** Check if a status transition is valid */
  canTransition(
    currentStatus: SubscriptionStatus,
    targetStatus: SubscriptionStatus,
  ): boolean;

  /** Get allowed transitions from current status */
  getAllowedTransitions(status: SubscriptionStatus): readonly SubscriptionStatus[];

  /** Check if status is operational (normal operations allowed) */
  isOperational(status: SubscriptionStatus): boolean;

  /** Check if status is restricted (limited operations) */
  isRestricted(status: SubscriptionStatus): boolean;

  /** Check if status is terminal (no further transitions) */
  isTerminal(status: SubscriptionStatus): boolean;
}

// ---------------------------------------------------------------------------
// Event Emitter Interface (for downstream systems)
// ---------------------------------------------------------------------------

export interface IStatusTransitionEventEmitter {
  emit(event: StatusTransitionEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

export interface SubscriptionStatusServiceDeps {
  subscriptionRepository: ISubscriptionRepository;
  eventEmitter?: IStatusTransitionEventEmitter;
}

export function createSubscriptionStatusService(
  deps: SubscriptionStatusServiceDeps,
): ISubscriptionStatusService {
  const { subscriptionRepository, eventEmitter } = deps;

  /**
   * Helper to record status history and emit events.
   */
  async function recordStatusChange(
    subscription: Subscription,
    fromStatus: SubscriptionStatus | null,
    toStatus: SubscriptionStatus,
    reason: string | null,
    changedBy: string,
    isAutomated: boolean,
  ): Promise<DomainResult<SubscriptionStatusHistory>> {
    // Create history entry
    const historyResult = await subscriptionRepository.createStatusHistory({
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      fromStatus,
      toStatus,
      reason,
      changedBy,
      isAutomated,
    });

    if (!historyResult.success) {
      return historyResult;
    }

    // Emit event for downstream systems (Req 18 AC 5)
    if (eventEmitter) {
      const event = createStatusTransitionEvent(historyResult.data);
      await eventEmitter.emit(event);
    }

    return historyResult;
  }

  return {
    /**
     * Create a new subscription for a tenant.
     */
    async createSubscription(
      data: CreateSubscriptionInput,
    ): Promise<DomainResult<Subscription>> {
      // Check if tenant already has a subscription
      const existsResult = await subscriptionRepository.existsByTenantId(data.tenantId);
      if (!existsResult.success) {
        return existsResult;
      }
      if (existsResult.data) {
        return fail(subscriptionAlreadyExists(data.tenantId));
      }

      // Create the subscription
      const createResult = await subscriptionRepository.create(data);
      if (!createResult.success) {
        return createResult;
      }

      // Record initial status in history
      await recordStatusChange(
        createResult.data,
        null,
        data.status,
        'Subscription created',
        'system',
        true,
      );

      return createResult;
    },

    /**
     * Get subscription by ID.
     */
    async getSubscriptionById(subscriptionId: string): Promise<DomainResult<Subscription>> {
      const result = await subscriptionRepository.findById(subscriptionId);
      if (!result.success) {
        return result;
      }
      if (!result.data) {
        return fail(subscriptionNotFound(subscriptionId));
      }
      return ok(result.data);
    },

    /**
     * Get subscription by tenant ID.
     */
    async getSubscriptionByTenantId(tenantId: string): Promise<DomainResult<Subscription>> {
      const result = await subscriptionRepository.findByTenantId(tenantId);
      if (!result.success) {
        return result;
      }
      if (!result.data) {
        return fail(subscriptionNotFound(`tenant:${tenantId}`));
      }
      return ok(result.data);
    },

    /**
     * List subscriptions with filters.
     */
    async listSubscriptions(
      options?: SubscriptionQueryOptions,
    ): Promise<DomainResult<Subscription[]>> {
      return subscriptionRepository.findAll(options);
    },

    /**
     * Transition subscription to a new status.
     *
     * Validates:
     * - Subscription exists
     * - Transition is valid per state machine (Req 18 AC 6-7)
     *
     * Records history (Req 18 AC 4) and emits events (Req 18 AC 5).
     */
    async transitionStatus(
      subscriptionId: string,
      newStatus: SubscriptionStatus,
      reason: string | null,
      operatorUserId: string,
      isAutomated = false,
    ): Promise<DomainResult<Subscription>> {
      // Get current subscription
      const subscriptionResult = await subscriptionRepository.findById(subscriptionId);
      if (!subscriptionResult.success) {
        return subscriptionResult;
      }
      if (!subscriptionResult.data) {
        return fail(subscriptionNotFound(subscriptionId));
      }

      const subscription = subscriptionResult.data;
      const currentStatus = subscription.status;

      // Validate transition (Req 18 AC 6-7)
      if (!isValidStatusTransition(currentStatus, newStatus)) {
        return fail(invalidStatusTransition(currentStatus, newStatus));
      }

      // Build update data
      const updateData: UpdateSubscriptionInput = {
        status: newStatus,
        statusReason: reason,
        ...(newStatus === StatusEnum.SUSPENDED && { suspendedAt: new Date() }),
        ...(newStatus === StatusEnum.CLOSED && { closedAt: new Date() }),
        // Clear suspension date if reactivating
        ...(newStatus === StatusEnum.ACTIVE &&
          currentStatus === StatusEnum.SUSPENDED && { suspendedAt: null }),
      };

      // Update the subscription
      const updateResult = await subscriptionRepository.update(subscriptionId, updateData);
      if (!updateResult.success) {
        return updateResult;
      }

      // Record status change history and emit event
      await recordStatusChange(
        updateResult.data,
        currentStatus,
        newStatus,
        reason,
        operatorUserId,
        isAutomated,
      );

      return updateResult;
    },

    /**
     * Transition subscription by tenant ID.
     */
    async transitionStatusByTenantId(
      tenantId: string,
      newStatus: SubscriptionStatus,
      reason: string | null,
      operatorUserId: string,
      isAutomated = false,
    ): Promise<DomainResult<Subscription>> {
      // Get subscription by tenant
      const subscriptionResult = await subscriptionRepository.findByTenantId(tenantId);
      if (!subscriptionResult.success) {
        return subscriptionResult;
      }
      if (!subscriptionResult.data) {
        return fail(subscriptionNotFound(`tenant:${tenantId}`));
      }

      return this.transitionStatus(
        subscriptionResult.data.id,
        newStatus,
        reason,
        operatorUserId,
        isAutomated,
      );
    },

    /**
     * Change subscription plan.
     */
    async changePlan(
      subscriptionId: string,
      newPlanId: string,
      operatorUserId: string,
    ): Promise<DomainResult<Subscription>> {
      // Get current subscription
      const subscriptionResult = await subscriptionRepository.findById(subscriptionId);
      if (!subscriptionResult.success) {
        return subscriptionResult;
      }
      if (!subscriptionResult.data) {
        return fail(subscriptionNotFound(subscriptionId));
      }

      // Update the plan
      const updateResult = await subscriptionRepository.update(subscriptionId, {
        planId: newPlanId,
      });
      if (!updateResult.success) {
        return updateResult;
      }

      // Record as a metadata change in history (plan change, not status change)
      await subscriptionRepository.createStatusHistory({
        subscriptionId,
        tenantId: updateResult.data.tenantId,
        fromStatus: updateResult.data.status,
        toStatus: updateResult.data.status, // Same status
        reason: `Plan changed to ${newPlanId}`,
        changedBy: operatorUserId,
        isAutomated: false,
        metadata: {
          type: 'PLAN_CHANGE',
          oldPlanId: subscriptionResult.data.planId,
          newPlanId,
        },
      });

      return updateResult;
    },

    /**
     * Get status history.
     */
    async getStatusHistory(
      subscriptionId: string,
      options?: { limit?: number; offset?: number },
    ): Promise<DomainResult<SubscriptionStatusHistory[]>> {
      return subscriptionRepository.getStatusHistory({
        subscriptionId,
        limit: options?.limit,
        offset: options?.offset,
      });
    },

    /**
     * Check if a status transition is valid.
     */
    canTransition(
      currentStatus: SubscriptionStatus,
      targetStatus: SubscriptionStatus,
    ): boolean {
      return isValidStatusTransition(currentStatus, targetStatus);
    },

    /**
     * Get allowed transitions from current status.
     */
    getAllowedTransitions(status: SubscriptionStatus): readonly SubscriptionStatus[] {
      return getAllowedTransitions(status);
    },

    /**
     * Check if status is operational.
     */
    isOperational(status: SubscriptionStatus): boolean {
      return isOperationalStatus(status);
    },

    /**
     * Check if status is restricted.
     */
    isRestricted(status: SubscriptionStatus): boolean {
      return isRestrictedStatus(status);
    },

    /**
     * Check if status is terminal.
     */
    isTerminal(status: SubscriptionStatus): boolean {
      return isTerminalStatus(status);
    },
  };
}
