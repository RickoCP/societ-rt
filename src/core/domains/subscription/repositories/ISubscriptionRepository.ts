/**
 * ISubscriptionRepository — Core repository interface for tenant subscription operations.
 *
 * Manages the subscription state for each tenant, including status transitions
 * and history tracking.
 *
 * Subscriptions are TENANT_OWNED - RLS applies.
 *
 * @see Requirements 18 (AC 1-7)
 * @see Design Components > Tenant Subscription Status Management
 */

import type { DomainResult } from '@core/utils';
import type { SubscriptionStatus } from '../types';
import type {
  Subscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionStatusHistory,
  CreateStatusHistoryInput,
  StatusHistoryQueryOptions,
} from '../entities';

/**
 * Query options for listing subscriptions.
 */
export interface SubscriptionQueryOptions {
  /** Filter by status */
  readonly status?: SubscriptionStatus | readonly SubscriptionStatus[];
  /** Filter by plan ID */
  readonly planId?: string;
  /** Sort field */
  readonly sortBy?: 'createdAt' | 'updatedAt' | 'status';
  /** Sort direction */
  readonly sortOrder?: 'asc' | 'desc';
  /** Pagination */
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Repository interface for Subscription operations.
 */
export interface ISubscriptionRepository {
  /**
   * Create a new subscription for a tenant.
   * @param data Subscription creation data
   */
  create(data: CreateSubscriptionInput): Promise<DomainResult<Subscription>>;

  /**
   * Find subscription by ID.
   * @param subscriptionId Subscription unique identifier
   */
  findById(subscriptionId: string): Promise<DomainResult<Subscription | null>>;

  /**
   * Find subscription by tenant ID.
   * Each tenant should have exactly one subscription.
   * @param tenantId Tenant ID
   */
  findByTenantId(tenantId: string): Promise<DomainResult<Subscription | null>>;

  /**
   * Find subscriptions by plan ID.
   * @param planId Plan ID
   * @param options Query options
   */
  findByPlanId(
    planId: string,
    options?: SubscriptionQueryOptions,
  ): Promise<DomainResult<Subscription[]>>;

  /**
   * Get all subscriptions.
   * @param options Query options
   */
  findAll(options?: SubscriptionQueryOptions): Promise<DomainResult<Subscription[]>>;

  /**
   * Update an existing subscription.
   * @param subscriptionId Subscription to update
   * @param data Update data
   */
  update(
    subscriptionId: string,
    data: UpdateSubscriptionInput,
  ): Promise<DomainResult<Subscription>>;

  /**
   * Update subscription by tenant ID.
   * @param tenantId Tenant ID
   * @param data Update data
   */
  updateByTenantId(
    tenantId: string,
    data: UpdateSubscriptionInput,
  ): Promise<DomainResult<Subscription>>;

  /**
   * Check if a tenant has an existing subscription.
   * @param tenantId Tenant ID to check
   */
  existsByTenantId(tenantId: string): Promise<DomainResult<boolean>>;

  /**
   * Count subscriptions by status.
   * @param status Subscription status
   */
  countByStatus(status: SubscriptionStatus): Promise<DomainResult<number>>;

  /**
   * Count subscriptions by plan.
   * @param planId Plan ID
   */
  countByPlanId(planId: string): Promise<DomainResult<number>>;

  // ---------------------------------------------------------------------------
  // Status History Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a status history entry.
   * @param data History entry data
   */
  createStatusHistory(
    data: CreateStatusHistoryInput,
  ): Promise<DomainResult<SubscriptionStatusHistory>>;

  /**
   * Get status history for a subscription.
   * @param options Query options
   */
  getStatusHistory(
    options: StatusHistoryQueryOptions,
  ): Promise<DomainResult<SubscriptionStatusHistory[]>>;

  /**
   * Get the latest status history entry for a subscription.
   * @param subscriptionId Subscription ID
   */
  getLatestStatusHistory(
    subscriptionId: string,
  ): Promise<DomainResult<SubscriptionStatusHistory | null>>;
}
