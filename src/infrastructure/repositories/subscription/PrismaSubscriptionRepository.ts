/**
 * PrismaSubscriptionRepository — Infrastructure implementation of ISubscriptionRepository.
 *
 * Manages tenant subscriptions with:
 * - Status tracking and transitions
 * - History logging for audit
 * - Plan assignment
 *
 * Subscriptions are keyed by tenantId (1:1 relationship).
 *
 * @see Requirements 18 (AC 1-7)
 */

import type { PrismaClient, Prisma, SubscriptionStatusEnum } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type {
  ISubscriptionRepository,
  SubscriptionQueryOptions,
} from '@core/domains/subscription/repositories';
import type { SubscriptionStatus } from '@core/domains/subscription/types';
import type {
  Subscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionStatusHistory,
  CreateStatusHistoryInput,
  StatusHistoryQueryOptions,
} from '@core/domains/subscription/entities';

// ---------------------------------------------------------------------------
// Type mappers (Prisma Enum ↔ Domain String)
// ---------------------------------------------------------------------------

function domainStatusToPrisma(status: SubscriptionStatus): SubscriptionStatusEnum {
  return status as SubscriptionStatusEnum;
}

function prismaStatusToDomain(status: SubscriptionStatusEnum): SubscriptionStatus {
  return status as SubscriptionStatus;
}

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaSubscription {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatusEnum;
  startedAt: Date;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  suspendedAt: Date | null;
  closedAt: Date | null;
  statusReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaSubscriptionToDomain(p: PrismaSubscription): Subscription {
  return {
    id: p.id,
    tenantId: p.tenantId,
    planId: p.planId,
    status: prismaStatusToDomain(p.status),
    startedAt: p.startedAt,
    currentPeriodEnd: p.currentPeriodEnd,
    trialEndsAt: p.trialEndsAt,
    suspendedAt: p.suspendedAt,
    closedAt: p.closedAt,
    statusReason: p.statusReason,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface PrismaStatusHistory {
  id: string;
  subscriptionId: string;
  tenantId: string;
  fromStatus: SubscriptionStatusEnum | null;
  toStatus: SubscriptionStatusEnum;
  reason: string | null;
  changedBy: string;
  isAutomated: boolean;
  metadata: unknown;
  changedAt: Date;
  createdAt: Date;
}

function mapPrismaStatusHistoryToDomain(p: PrismaStatusHistory): SubscriptionStatusHistory {
  return {
    id: p.id,
    subscriptionId: p.subscriptionId,
    tenantId: p.tenantId,
    fromStatus: p.fromStatus ? prismaStatusToDomain(p.fromStatus) : null,
    toStatus: prismaStatusToDomain(p.toStatus),
    reason: p.reason,
    changedBy: p.changedBy,
    isAutomated: p.isAutomated,
    metadata: p.metadata as Record<string, unknown> | null,
    changedAt: p.changedAt,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Repository Factory
// ---------------------------------------------------------------------------

export interface PrismaSubscriptionRepositoryDeps {
  prismaClient: PrismaClient;
}

export const PrismaSubscriptionRepositoryImpl = ({
  prismaClient,
}: PrismaSubscriptionRepositoryDeps): ISubscriptionRepository => {
  return {
    async create(data: CreateSubscriptionInput): Promise<DomainResult<Subscription>> {
      try {
        const record = await prismaClient.subscription.create({
          data: {
            tenantId: data.tenantId,
            planId: data.planId,
            status: domainStatusToPrisma(data.status),
            startedAt: data.startedAt ?? new Date(),
            currentPeriodEnd: data.currentPeriodEnd,
            trialEndsAt: data.trialEndsAt,
          },
        });
        return ok(mapPrismaSubscriptionToDomain(record as unknown as PrismaSubscription));
      } catch (error) {
        // Handle unique constraint violation (tenant already has subscription)
        if (
          error instanceof Error &&
          error.message.includes('Unique constraint')
        ) {
          return fail(
            technicalError(
              'SUBSCRIPTION_CREATE_FAILED',
              'Failed to create subscription - tenant may already have one',
              { cause: error },
            ),
          );
        }
        return fail(
          technicalError('SUBSCRIPTION_CREATE_FAILED', 'Failed to create subscription', {
            cause: error,
          }),
        );
      }
    },

    async findById(subscriptionId: string): Promise<DomainResult<Subscription | null>> {
      try {
        const record = await prismaClient.subscription.findUnique({
          where: { id: subscriptionId },
        });
        if (!record) return ok(null);
        return ok(mapPrismaSubscriptionToDomain(record as unknown as PrismaSubscription));
      } catch (error) {
        return fail(
          technicalError('SUBSCRIPTION_FETCH_FAILED', 'Failed to fetch subscription', {
            cause: error,
          }),
        );
      }
    },

    async findByTenantId(tenantId: string): Promise<DomainResult<Subscription | null>> {
      try {
        const record = await prismaClient.subscription.findUnique({
          where: { tenantId },
        });
        if (!record) return ok(null);
        return ok(mapPrismaSubscriptionToDomain(record as unknown as PrismaSubscription));
      } catch (error) {
        return fail(
          technicalError('SUBSCRIPTION_FETCH_FAILED', 'Failed to fetch subscription by tenant', {
            cause: error,
          }),
        );
      }
    },

    async findByPlanId(
      planId: string,
      options?: SubscriptionQueryOptions,
    ): Promise<DomainResult<Subscription[]>> {
      try {
        const records = await prismaClient.subscription.findMany({
          where: { planId },
          orderBy: {
            [options?.sortBy ?? 'createdAt']: options?.sortOrder ?? 'desc',
          },
          take: options?.limit,
          skip: options?.offset,
        });
        return ok(records.map((r) => mapPrismaSubscriptionToDomain(r as unknown as PrismaSubscription)));
      } catch (error) {
        return fail(
          technicalError('SUBSCRIPTIONS_FETCH_FAILED', 'Failed to fetch subscriptions by plan', {
            cause: error,
          }),
        );
      }
    },

    async findAll(options?: SubscriptionQueryOptions): Promise<DomainResult<Subscription[]>> {
      try {
        let statusFilter: SubscriptionStatusEnum | { in: SubscriptionStatusEnum[] } | undefined;
        
        if (options?.status) {
          const statusValue = options.status;
          if (Array.isArray(statusValue)) {
            // Type assertion needed because TypeScript doesn't narrow readonly arrays well
            const statusArray = statusValue as readonly SubscriptionStatus[];
            statusFilter = { in: statusArray.map((s) => domainStatusToPrisma(s)) };
          } else {
            statusFilter = domainStatusToPrisma(statusValue as SubscriptionStatus);
          }
        }

        const records = await prismaClient.subscription.findMany({
          where: {
            ...(statusFilter && { status: statusFilter }),
            ...(options?.planId && { planId: options.planId }),
          },
          orderBy: {
            [options?.sortBy ?? 'createdAt']: options?.sortOrder ?? 'desc',
          },
          take: options?.limit,
          skip: options?.offset,
        });
        return ok(records.map((r) => mapPrismaSubscriptionToDomain(r as unknown as PrismaSubscription)));
      } catch (error) {
        return fail(
          technicalError('SUBSCRIPTIONS_FETCH_FAILED', 'Failed to fetch subscriptions', {
            cause: error,
          }),
        );
      }
    },

    async update(
      subscriptionId: string,
      data: UpdateSubscriptionInput,
    ): Promise<DomainResult<Subscription>> {
      try {
        const record = await prismaClient.subscription.update({
          where: { id: subscriptionId },
          data: {
            ...(data.planId !== undefined && { planId: data.planId }),
            ...(data.status !== undefined && { status: domainStatusToPrisma(data.status) }),
            ...(data.currentPeriodEnd !== undefined && { currentPeriodEnd: data.currentPeriodEnd }),
            ...(data.trialEndsAt !== undefined && { trialEndsAt: data.trialEndsAt }),
            ...(data.suspendedAt !== undefined && { suspendedAt: data.suspendedAt }),
            ...(data.closedAt !== undefined && { closedAt: data.closedAt }),
            ...(data.statusReason !== undefined && { statusReason: data.statusReason }),
          },
        });
        return ok(mapPrismaSubscriptionToDomain(record as unknown as PrismaSubscription));
      } catch (error) {
        return fail(
          technicalError('SUBSCRIPTION_UPDATE_FAILED', 'Failed to update subscription', {
            cause: error,
          }),
        );
      }
    },

    async updateByTenantId(
      tenantId: string,
      data: UpdateSubscriptionInput,
    ): Promise<DomainResult<Subscription>> {
      try {
        const record = await prismaClient.subscription.update({
          where: { tenantId },
          data: {
            ...(data.planId !== undefined && { planId: data.planId }),
            ...(data.status !== undefined && { status: domainStatusToPrisma(data.status) }),
            ...(data.currentPeriodEnd !== undefined && { currentPeriodEnd: data.currentPeriodEnd }),
            ...(data.trialEndsAt !== undefined && { trialEndsAt: data.trialEndsAt }),
            ...(data.suspendedAt !== undefined && { suspendedAt: data.suspendedAt }),
            ...(data.closedAt !== undefined && { closedAt: data.closedAt }),
            ...(data.statusReason !== undefined && { statusReason: data.statusReason }),
          },
        });
        return ok(mapPrismaSubscriptionToDomain(record as unknown as PrismaSubscription));
      } catch (error) {
        return fail(
          technicalError('SUBSCRIPTION_UPDATE_FAILED', 'Failed to update subscription by tenant', {
            cause: error,
          }),
        );
      }
    },

    async existsByTenantId(tenantId: string): Promise<DomainResult<boolean>> {
      try {
        const record = await prismaClient.subscription.findUnique({
          where: { tenantId },
          select: { id: true },
        });
        return ok(record !== null);
      } catch (error) {
        return fail(
          technicalError('SUBSCRIPTION_EXISTS_CHECK_FAILED', 'Failed to check subscription existence', {
            cause: error,
          }),
        );
      }
    },

    async countByStatus(status: SubscriptionStatus): Promise<DomainResult<number>> {
      try {
        const count = await prismaClient.subscription.count({
          where: { status: domainStatusToPrisma(status) },
        });
        return ok(count);
      } catch (error) {
        return fail(
          technicalError('SUBSCRIPTION_COUNT_FAILED', 'Failed to count subscriptions by status', {
            cause: error,
          }),
        );
      }
    },

    async countByPlanId(planId: string): Promise<DomainResult<number>> {
      try {
        const count = await prismaClient.subscription.count({
          where: { planId },
        });
        return ok(count);
      } catch (error) {
        return fail(
          technicalError('SUBSCRIPTION_COUNT_FAILED', 'Failed to count subscriptions by plan', {
            cause: error,
          }),
        );
      }
    },

    // ---------------------------------------------------------------------------
    // Status History Operations
    // ---------------------------------------------------------------------------

    async createStatusHistory(
      data: CreateStatusHistoryInput,
    ): Promise<DomainResult<SubscriptionStatusHistory>> {
      try {
        const record = await prismaClient.subscriptionStatusHistory.create({
          data: {
            subscriptionId: data.subscriptionId,
            tenantId: data.tenantId,
            fromStatus: data.fromStatus ? domainStatusToPrisma(data.fromStatus) : null,
            toStatus: domainStatusToPrisma(data.toStatus),
            reason: data.reason,
            changedBy: data.changedBy,
            isAutomated: data.isAutomated ?? false,
            metadata: data.metadata as Prisma.InputJsonValue,
          },
        });
        return ok(mapPrismaStatusHistoryToDomain(record as unknown as PrismaStatusHistory));
      } catch (error) {
        return fail(
          technicalError('STATUS_HISTORY_CREATE_FAILED', 'Failed to create status history entry', {
            cause: error,
          }),
        );
      }
    },

    async getStatusHistory(
      options: StatusHistoryQueryOptions,
    ): Promise<DomainResult<SubscriptionStatusHistory[]>> {
      try {
        const records = await prismaClient.subscriptionStatusHistory.findMany({
          where: {
            ...(options.subscriptionId && { subscriptionId: options.subscriptionId }),
            ...(options.tenantId && { tenantId: options.tenantId }),
            ...(options.fromStatus && { fromStatus: domainStatusToPrisma(options.fromStatus) }),
            ...(options.toStatus && { toStatus: domainStatusToPrisma(options.toStatus) }),
            ...(options.changedBy && { changedBy: options.changedBy }),
            ...(options.startDate && { changedAt: { gte: options.startDate } }),
            ...(options.endDate && { changedAt: { lte: options.endDate } }),
          },
          orderBy: { changedAt: 'desc' },
          take: options.limit ?? 100,
          skip: options.offset ?? 0,
        });
        return ok(records.map((r) => mapPrismaStatusHistoryToDomain(r as unknown as PrismaStatusHistory)));
      } catch (error) {
        return fail(
          technicalError('STATUS_HISTORY_FETCH_FAILED', 'Failed to fetch status history', {
            cause: error,
          }),
        );
      }
    },

    async getLatestStatusHistory(
      subscriptionId: string,
    ): Promise<DomainResult<SubscriptionStatusHistory | null>> {
      try {
        const record = await prismaClient.subscriptionStatusHistory.findFirst({
          where: { subscriptionId },
          orderBy: { changedAt: 'desc' },
        });
        if (!record) return ok(null);
        return ok(mapPrismaStatusHistoryToDomain(record as unknown as PrismaStatusHistory));
      } catch (error) {
        return fail(
          technicalError('STATUS_HISTORY_FETCH_FAILED', 'Failed to fetch latest status history', {
            cause: error,
          }),
        );
      }
    },
  };
};
