/**
 * PrismaSubscriptionPlanRepository — Infrastructure implementation of ISubscriptionPlanRepository.
 *
 * Uses Prisma for CRUD operations on subscription plans with:
 * - Name uniqueness enforcement
 * - Subscriber count validation for deletion
 * - Change logging for audit
 *
 * Plans are PLATFORM_SHARED - no tenant RLS.
 *
 * @see Requirements 17 (AC 1-7)
 */

import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  ISubscriptionPlanRepository,
  PlanQueryOptions,
} from '@core/domains/subscription/repositories';
import type {
  SubscriptionPlan,
  CreateSubscriptionPlanInput,
  UpdateSubscriptionPlanInput,
  PlanChangeLog,
} from '@core/domains/subscription/entities';
import { DEFAULT_PLAN_FEATURES } from '@core/domains/subscription/types';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaPlan {
  id: string;
  name: string;
  maxUsers: number | null;
  features: string[];
  price: unknown; // Prisma Decimal
  description: string | null;
  isSystemPlan: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaPlanToDomain(p: PrismaPlan): SubscriptionPlan {
  return {
    id: p.id,
    name: p.name,
    maxUsers: p.maxUsers,
    features: p.features,
    price: Number(p.price),
    description: p.description ?? undefined,
    isSystemPlan: p.isSystemPlan,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface PrismaChangeLog {
  id: string;
  planId: string;
  operatorUserId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  beforeState: unknown;
  afterState: unknown;
  timestamp: Date;
}

function mapPrismaChangeLogToDomain(log: PrismaChangeLog): PlanChangeLog {
  return {
    id: log.id,
    planId: log.planId,
    operatorUserId: log.operatorUserId,
    action: log.action,
    beforeState: log.beforeState as Partial<SubscriptionPlan> | null,
    afterState: log.afterState as Partial<SubscriptionPlan> | null,
    timestamp: log.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Repository Factory
// ---------------------------------------------------------------------------

export interface PrismaSubscriptionPlanRepositoryDeps {
  prismaClient: PrismaClient;
}

export const PrismaSubscriptionPlanRepositoryImpl = ({
  prismaClient,
}: PrismaSubscriptionPlanRepositoryDeps): ISubscriptionPlanRepository => {
  /**
   * Helper to log plan changes.
   */
  async function logChange(
    planId: string,
    operatorUserId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    beforeState: Partial<SubscriptionPlan> | null,
    afterState: Partial<SubscriptionPlan> | null,
  ): Promise<void> {
    await prismaClient.planChangeLog.create({
      data: {
        planId,
        operatorUserId,
        action,
        beforeState: beforeState as Prisma.InputJsonValue,
        afterState: afterState as Prisma.InputJsonValue,
      },
    });
  }

  return {
    async create(
      data: CreateSubscriptionPlanInput,
      operatorUserId: string,
    ): Promise<DomainResult<SubscriptionPlan>> {
      try {
        const record = await prismaClient.subscriptionPlan.create({
          data: {
            name: data.name,
            maxUsers: data.maxUsers,
            features: data.features as string[],
            price: data.price,
            description: data.description,
            isSystemPlan: data.isSystemPlan ?? false,
          },
        });

        const plan = mapPrismaPlanToDomain(record as unknown as PrismaPlan);

        // Log the creation
        await logChange(plan.id, operatorUserId, 'CREATE', null, plan);

        return ok(plan);
      } catch (error) {
        // Handle unique constraint violation
        if (
          error instanceof Error &&
          error.message.includes('Unique constraint')
        ) {
          return fail(
            technicalError(
              'PLAN_CREATE_FAILED',
              'Failed to create plan - name may already exist',
              { cause: error },
            ),
          );
        }
        return fail(
          technicalError('PLAN_CREATE_FAILED', 'Failed to create subscription plan', {
            cause: error,
          }),
        );
      }
    },

    async findById(planId: string): Promise<DomainResult<SubscriptionPlan | null>> {
      try {
        const record = await prismaClient.subscriptionPlan.findUnique({
          where: { id: planId },
        });
        if (!record) return ok(null);
        return ok(mapPrismaPlanToDomain(record as unknown as PrismaPlan));
      } catch (error) {
        return fail(
          technicalError('PLAN_FETCH_FAILED', 'Failed to fetch subscription plan', {
            cause: error,
          }),
        );
      }
    },

    async findByName(name: string): Promise<DomainResult<SubscriptionPlan | null>> {
      try {
        const record = await prismaClient.subscriptionPlan.findFirst({
          where: { name },
        });
        if (!record) return ok(null);
        return ok(mapPrismaPlanToDomain(record as unknown as PrismaPlan));
      } catch (error) {
        return fail(
          technicalError('PLAN_FETCH_FAILED', 'Failed to fetch subscription plan by name', {
            cause: error,
          }),
        );
      }
    },

    async findAll(options?: PlanQueryOptions): Promise<DomainResult<SubscriptionPlan[]>> {
      try {
        const records = await prismaClient.subscriptionPlan.findMany({
          orderBy: {
            [options?.sortBy ?? 'price']: options?.sortOrder ?? 'asc',
          },
        });
        return ok(records.map((r) => mapPrismaPlanToDomain(r as unknown as PrismaPlan)));
      } catch (error) {
        return fail(
          technicalError('PLANS_FETCH_FAILED', 'Failed to fetch subscription plans', {
            cause: error,
          }),
        );
      }
    },

    async update(
      planId: string,
      data: UpdateSubscriptionPlanInput,
      operatorUserId: string,
    ): Promise<DomainResult<SubscriptionPlan>> {
      try {
        // Get before state for logging
        const beforeRecord = await prismaClient.subscriptionPlan.findUnique({
          where: { id: planId },
        });
        if (!beforeRecord) {
          return fail(notFoundError('PLAN_NOT_FOUND', `Plan ${planId} not found`));
        }
        const beforeState = mapPrismaPlanToDomain(beforeRecord as unknown as PrismaPlan);

        // Update the plan
        const record = await prismaClient.subscriptionPlan.update({
          where: { id: planId },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.maxUsers !== undefined && { maxUsers: data.maxUsers }),
            ...(data.features !== undefined && { features: data.features as string[] }),
            ...(data.price !== undefined && { price: data.price }),
            ...(data.description !== undefined && { description: data.description }),
          },
        });

        const afterState = mapPrismaPlanToDomain(record as unknown as PrismaPlan);

        // Log the update
        await logChange(planId, operatorUserId, 'UPDATE', beforeState, afterState);

        return ok(afterState);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Unique constraint')
        ) {
          return fail(
            technicalError(
              'PLAN_UPDATE_FAILED',
              'Failed to update plan - name may already exist',
              { cause: error },
            ),
          );
        }
        return fail(
          technicalError('PLAN_UPDATE_FAILED', 'Failed to update subscription plan', {
            cause: error,
          }),
        );
      }
    },

    async delete(planId: string, operatorUserId: string): Promise<DomainResult<void>> {
      try {
        // Get before state for logging
        const beforeRecord = await prismaClient.subscriptionPlan.findUnique({
          where: { id: planId },
        });
        if (!beforeRecord) {
          return fail(notFoundError('PLAN_NOT_FOUND', `Plan ${planId} not found`));
        }
        const beforeState = mapPrismaPlanToDomain(beforeRecord as unknown as PrismaPlan);

        // Delete the plan
        await prismaClient.subscriptionPlan.delete({
          where: { id: planId },
        });

        // Log the deletion
        await logChange(planId, operatorUserId, 'DELETE', beforeState, null);

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError('PLAN_DELETE_FAILED', 'Failed to delete subscription plan', {
            cause: error,
          }),
        );
      }
    },

    async existsByName(
      name: string,
      excludePlanId?: string,
    ): Promise<DomainResult<boolean>> {
      try {
        const record = await prismaClient.subscriptionPlan.findFirst({
          where: {
            name,
            ...(excludePlanId && { NOT: { id: excludePlanId } }),
          },
        });
        return ok(record !== null);
      } catch (error) {
        return fail(
          technicalError('PLAN_EXISTS_CHECK_FAILED', 'Failed to check plan name existence', {
            cause: error,
          }),
        );
      }
    },

    async countSubscribers(planId: string): Promise<DomainResult<number>> {
      try {
        // Count tenants directly using subscriptionPlanId
        const count = await prismaClient.tenant.count({
          where: { subscriptionPlanId: planId },
        });
        return ok(count);
      } catch (error) {
        return fail(
          technicalError('PLAN_SUBSCRIBER_COUNT_FAILED', 'Failed to count plan subscribers', {
            cause: error,
          }),
        );
      }
    },

    async getChangeLog(
      planId: string,
      options?: { limit?: number; offset?: number },
    ): Promise<DomainResult<PlanChangeLog[]>> {
      try {
        const records = await prismaClient.planChangeLog.findMany({
          where: { planId },
          orderBy: { timestamp: 'desc' },
          take: options?.limit ?? 50,
          skip: options?.offset ?? 0,
        });
        return ok(records.map((r) => mapPrismaChangeLogToDomain(r as unknown as PrismaChangeLog)));
      } catch (error) {
        return fail(
          technicalError('PLAN_CHANGELOG_FETCH_FAILED', 'Failed to fetch plan change log', {
            cause: error,
          }),
        );
      }
    },

    async createChangeLog(
      log: Omit<PlanChangeLog, 'id'>,
    ): Promise<DomainResult<PlanChangeLog>> {
      try {
        const record = await prismaClient.planChangeLog.create({
          data: {
            planId: log.planId,
            operatorUserId: log.operatorUserId,
            action: log.action,
            beforeState: log.beforeState as Prisma.InputJsonValue,
            afterState: log.afterState as Prisma.InputJsonValue,
            timestamp: log.timestamp,
          },
        });
        return ok(mapPrismaChangeLogToDomain(record as unknown as PrismaChangeLog));
      } catch (error) {
        return fail(
          technicalError('PLAN_CHANGELOG_CREATE_FAILED', 'Failed to create change log entry', {
            cause: error,
          }),
        );
      }
    },

    async ensureDefaultPlans(): Promise<DomainResult<void>> {
      try {
        const defaultPlans = [
          {
            name: 'Basic',
            maxUsers: 50,
            features: DEFAULT_PLAN_FEATURES.Basic as unknown as string[],
            price: 0,
            description: 'Basic plan for small communities',
            isSystemPlan: true,
          },
          {
            name: 'Standard',
            maxUsers: 200,
            features: DEFAULT_PLAN_FEATURES.Standard as unknown as string[],
            price: 500000, // IDR 500,000
            description: 'Standard plan with additional features',
            isSystemPlan: true,
          },
          {
            name: 'Pro',
            maxUsers: null, // unlimited
            features: DEFAULT_PLAN_FEATURES.Pro as unknown as string[],
            price: 1500000, // IDR 1,500,000
            description: 'Pro plan with all features and unlimited users',
            isSystemPlan: true,
          },
        ];

        for (const plan of defaultPlans) {
          const existing = await prismaClient.subscriptionPlan.findFirst({
            where: { name: plan.name },
          });

          if (!existing) {
            await prismaClient.subscriptionPlan.create({
              data: plan,
            });
          }
        }

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'DEFAULT_PLANS_INIT_FAILED',
            'Failed to initialize default subscription plans',
            { cause: error },
          ),
        );
      }
    },
  };
};
