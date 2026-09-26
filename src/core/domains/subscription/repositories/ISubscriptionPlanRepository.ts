/**
 * ISubscriptionPlanRepository — Core repository interface for subscription plan operations.
 *
 * Provides CRUD operations for subscription plans with validation support.
 * All methods return DomainResult to keep success/error paths explicit.
 *
 * Plans are PLATFORM_SHARED (no tenant RLS) - all tenants see the same plans.
 *
 * @see Requirements 17 (AC 1-7)
 * @see Design Components > Subscription Plan Management
 */

import type { DomainResult } from '@core/utils';
import type {
  SubscriptionPlan,
  CreateSubscriptionPlanInput,
  UpdateSubscriptionPlanInput,
  PlanChangeLog,
} from '../entities';

/**
 * Query options for listing plans.
 */
export interface PlanQueryOptions {
  /** Sort field */
  readonly sortBy?: 'name' | 'price' | 'createdAt';
  /** Sort direction */
  readonly sortOrder?: 'asc' | 'desc';
  /** Include soft-deleted plans (if supported) */
  readonly includeDeleted?: boolean;
}

/**
 * Repository interface for SubscriptionPlan CRUD operations.
 */
export interface ISubscriptionPlanRepository {
  /**
   * Create a new subscription plan.
   * @param data Plan creation data
   * @param operatorUserId User performing the operation (for audit)
   */
  create(
    data: CreateSubscriptionPlanInput,
    operatorUserId: string,
  ): Promise<DomainResult<SubscriptionPlan>>;

  /**
   * Find a plan by ID.
   * @param planId Plan unique identifier
   */
  findById(planId: string): Promise<DomainResult<SubscriptionPlan | null>>;

  /**
   * Find a plan by name (unique).
   * @param name Plan name
   */
  findByName(name: string): Promise<DomainResult<SubscriptionPlan | null>>;

  /**
   * Get all subscription plans.
   * @param options Query options
   */
  findAll(options?: PlanQueryOptions): Promise<DomainResult<SubscriptionPlan[]>>;

  /**
   * Update an existing plan.
   * @param planId Plan to update
   * @param data Update data
   * @param operatorUserId User performing the operation (for audit)
   */
  update(
    planId: string,
    data: UpdateSubscriptionPlanInput,
    operatorUserId: string,
  ): Promise<DomainResult<SubscriptionPlan>>;

  /**
   * Delete a plan.
   * Must verify no tenants are subscribed before deletion.
   * @param planId Plan to delete
   * @param operatorUserId User performing the operation (for audit)
   */
  delete(
    planId: string,
    operatorUserId: string,
  ): Promise<DomainResult<void>>;

  /**
   * Check if a plan name already exists.
   * @param name Plan name to check
   * @param excludePlanId Exclude this plan ID from the check (for updates)
   */
  existsByName(
    name: string,
    excludePlanId?: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Count tenants subscribed to a plan.
   * Used for deletion validation (Req 17 AC 5-6).
   * @param planId Plan ID to check
   */
  countSubscribers(planId: string): Promise<DomainResult<number>>;

  /**
   * Get plan change history for audit.
   * @param planId Plan ID
   * @param options Query options
   */
  getChangeLog(
    planId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<DomainResult<PlanChangeLog[]>>;

  /**
   * Create a plan change log entry.
   * @param log Change log entry
   */
  createChangeLog(log: Omit<PlanChangeLog, 'id'>): Promise<DomainResult<PlanChangeLog>>;

  /**
   * Ensure default plans exist (Basic, Standard, Pro).
   * Called during system initialization.
   */
  ensureDefaultPlans(): Promise<DomainResult<void>>;
}
