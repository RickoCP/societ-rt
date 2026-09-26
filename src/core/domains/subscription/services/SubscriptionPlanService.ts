/**
 * SubscriptionPlanService — Domain service for subscription plan management.
 *
 * Provides business logic for CRUD operations on subscription plans with
 * validation, uniqueness enforcement, and change logging.
 *
 * This is a factory function (DI-friendly) following Clean Architecture.
 *
 * @see Requirements 17 (AC 1-7)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  SubscriptionPlan,
  CreateSubscriptionPlanInput,
  UpdateSubscriptionPlanInput,
  PlanChangeLog,
} from '../entities';
import {
  isValidPlanName,
  isValidMaxUsers,
  isValidPrice,
  isDefaultPlanName,
} from '../entities';
import type { ISubscriptionPlanRepository, PlanQueryOptions } from '../repositories';
import {
  planNameDuplicate,
  planNotFound,
  invalidPlanData,
  planHasSubscribers,
  cannotDeleteSystemPlan,
} from '../errors';

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface ISubscriptionPlanService {
  /** Create a new subscription plan (Req 17 AC 1-3) */
  createPlan(
    data: CreateSubscriptionPlanInput,
    operatorUserId: string,
  ): Promise<DomainResult<SubscriptionPlan>>;

  /** Get a plan by ID */
  getPlanById(planId: string): Promise<DomainResult<SubscriptionPlan>>;

  /** Get a plan by name */
  getPlanByName(name: string): Promise<DomainResult<SubscriptionPlan>>;

  /** List all plans */
  listPlans(options?: PlanQueryOptions): Promise<DomainResult<SubscriptionPlan[]>>;

  /** Update a plan (Req 17 AC 1, 3, 7) */
  updatePlan(
    planId: string,
    data: UpdateSubscriptionPlanInput,
    operatorUserId: string,
  ): Promise<DomainResult<SubscriptionPlan>>;

  /** Delete a plan (Req 17 AC 5-6) */
  deletePlan(
    planId: string,
    operatorUserId: string,
  ): Promise<DomainResult<void>>;

  /** Get plan change history (Req 17 AC 7) */
  getPlanChangeLog(
    planId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<DomainResult<PlanChangeLog[]>>;

  /** Ensure default plans exist (Req 17 AC 4) */
  ensureDefaultPlans(): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

export interface SubscriptionPlanServiceDeps {
  subscriptionPlanRepository: ISubscriptionPlanRepository;
}

export function createSubscriptionPlanService(
  deps: SubscriptionPlanServiceDeps,
): ISubscriptionPlanService {
  const { subscriptionPlanRepository } = deps;

  return {
    /**
     * Create a new subscription plan.
     *
     * Validates:
     * - Plan name format
     * - Plan name uniqueness (Req 17 AC 3)
     * - maxUsers validity
     * - Price validity
     *
     * Logs the change with before/after state (Req 17 AC 7).
     */
    async createPlan(
      data: CreateSubscriptionPlanInput,
      operatorUserId: string,
    ): Promise<DomainResult<SubscriptionPlan>> {
      // Validate plan name format
      if (!isValidPlanName(data.name)) {
        return fail(invalidPlanData('Plan name must be 1-50 alphanumeric characters'));
      }

      // Validate maxUsers
      if (!isValidMaxUsers(data.maxUsers)) {
        return fail(invalidPlanData('maxUsers must be null or a positive integer'));
      }

      // Validate price
      if (!isValidPrice(data.price)) {
        return fail(invalidPlanData('Price must be a non-negative number'));
      }

      // Check name uniqueness (Req 17 AC 3)
      const existsResult = await subscriptionPlanRepository.existsByName(data.name);
      if (!existsResult.success) {
        return existsResult;
      }
      if (existsResult.data) {
        return fail(planNameDuplicate(data.name));
      }

      // Create the plan (repository handles logging)
      return subscriptionPlanRepository.create(data, operatorUserId);
    },

    /**
     * Get a plan by ID.
     */
    async getPlanById(planId: string): Promise<DomainResult<SubscriptionPlan>> {
      const result = await subscriptionPlanRepository.findById(planId);
      if (!result.success) {
        return result;
      }
      if (!result.data) {
        return fail(planNotFound(planId));
      }
      return ok(result.data);
    },

    /**
     * Get a plan by name.
     */
    async getPlanByName(name: string): Promise<DomainResult<SubscriptionPlan>> {
      const result = await subscriptionPlanRepository.findByName(name);
      if (!result.success) {
        return result;
      }
      if (!result.data) {
        return fail(planNotFound(name));
      }
      return ok(result.data);
    },

    /**
     * List all plans.
     */
    async listPlans(options?: PlanQueryOptions): Promise<DomainResult<SubscriptionPlan[]>> {
      return subscriptionPlanRepository.findAll(options);
    },

    /**
     * Update a plan.
     *
     * Validates:
     * - Plan exists
     * - New name uniqueness (if changed)
     * - maxUsers validity (if changed)
     * - Price validity (if changed)
     *
     * Logs the change with before/after state (Req 17 AC 7).
     */
    async updatePlan(
      planId: string,
      data: UpdateSubscriptionPlanInput,
      operatorUserId: string,
    ): Promise<DomainResult<SubscriptionPlan>> {
      // Verify plan exists
      const existingResult = await subscriptionPlanRepository.findById(planId);
      if (!existingResult.success) {
        return existingResult;
      }
      if (!existingResult.data) {
        return fail(planNotFound(planId));
      }

      // Validate name if being changed
      if (data.name !== undefined) {
        if (!isValidPlanName(data.name)) {
          return fail(invalidPlanData('Plan name must be 1-50 alphanumeric characters'));
        }

        // Check name uniqueness, excluding current plan
        const existsResult = await subscriptionPlanRepository.existsByName(data.name, planId);
        if (!existsResult.success) {
          return existsResult;
        }
        if (existsResult.data) {
          return fail(planNameDuplicate(data.name));
        }
      }

      // Validate maxUsers if being changed
      if (data.maxUsers !== undefined && !isValidMaxUsers(data.maxUsers)) {
        return fail(invalidPlanData('maxUsers must be null or a positive integer'));
      }

      // Validate price if being changed
      if (data.price !== undefined && !isValidPrice(data.price)) {
        return fail(invalidPlanData('Price must be a non-negative number'));
      }

      // Update the plan (repository handles logging)
      return subscriptionPlanRepository.update(planId, data, operatorUserId);
    },

    /**
     * Delete a plan.
     *
     * Validates:
     * - Plan exists
     * - Plan is not a default system plan (Req 17 AC 4)
     * - No tenants are subscribed (Req 17 AC 5-6)
     *
     * Logs the deletion (Req 17 AC 7).
     */
    async deletePlan(
      planId: string,
      operatorUserId: string,
    ): Promise<DomainResult<void>> {
      // Verify plan exists
      const existingResult = await subscriptionPlanRepository.findById(planId);
      if (!existingResult.success) {
        return existingResult;
      }
      if (!existingResult.data) {
        return fail(planNotFound(planId));
      }

      const plan = existingResult.data;

      // Check if it's a system plan (Req 17 AC 4)
      if (isDefaultPlanName(plan.name) || plan.isSystemPlan) {
        return fail(cannotDeleteSystemPlan(plan.name));
      }

      // Check for active subscribers (Req 17 AC 5-6)
      const subscriberCountResult = await subscriptionPlanRepository.countSubscribers(planId);
      if (!subscriberCountResult.success) {
        return subscriberCountResult;
      }
      if (subscriberCountResult.data > 0) {
        return fail(planHasSubscribers(planId, subscriberCountResult.data));
      }

      // Delete the plan (repository handles logging)
      return subscriptionPlanRepository.delete(planId, operatorUserId);
    },

    /**
     * Get plan change history.
     */
    async getPlanChangeLog(
      planId: string,
      options?: { limit?: number; offset?: number },
    ): Promise<DomainResult<PlanChangeLog[]>> {
      return subscriptionPlanRepository.getChangeLog(planId, options);
    },

    /**
     * Ensure default plans exist (Req 17 AC 4).
     */
    async ensureDefaultPlans(): Promise<DomainResult<void>> {
      return subscriptionPlanRepository.ensureDefaultPlans();
    },
  };
}
