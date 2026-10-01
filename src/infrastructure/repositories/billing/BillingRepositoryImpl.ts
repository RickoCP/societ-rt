/**
 * BillingRepositoryImpl — Infrastructure implementation of BillingRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped invoice queries and
 * direct Prisma queries for cross-tenant operations (plans, reconciliation).
 *
 * Prisma stores `amount` as Decimal — all domain conversions use `Number()`.
 *
 * @see Requirements 16.1, 16.2, 16.6, 29.1
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type { BillingRepository } from '@core/domains/billing/repositories/BillingRepository';
import type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceInput,
  SubscriptionPlan,
  PaymentReconciliation,
  CreateReconciliationInput,
} from '@core/domains/billing/entities';
import type { PlanName } from '@core/domains/billing/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaInvoice {
  id: string;
  tenantId: string;
  planName: string;
  amount: unknown; // Prisma Decimal
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  dueDate: Date;
  status: string;
  gatewayTransactionId: string | null;
  paidAt: Date | null;
  retryCount: number;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaInvoiceToDomain(p: PrismaInvoice): Invoice {
  return {
    id: p.id,
    tenantId: p.tenantId,
    planName: p.planName,
    amount: Number(p.amount),
    billingPeriodStart: p.billingPeriodStart,
    billingPeriodEnd: p.billingPeriodEnd,
    dueDate: p.dueDate,
    status: p.status as InvoiceStatus,
    gatewayTransactionId: p.gatewayTransactionId,
    paidAt: p.paidAt,
    retryCount: p.retryCount,
    idempotencyKey: p.idempotencyKey,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface PrismaPlan {
  id: string;
  name: string;
  maxUsers: number | null;
  features: string[];
  price: unknown; // Prisma Decimal
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaPlanToDomain(p: PrismaPlan): SubscriptionPlan {
  return {
    id: p.id,
    name: p.name as PlanName,
    maxUsers: p.maxUsers,
    features: p.features,
    price: Number(p.price),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface PrismaReconciliation {
  id: string;
  gatewayTransactionId: string;
  internalInvoiceId: string;
  amount: unknown; // Prisma Decimal
  status: string;
  gatewayResponse: unknown;
  reconciledAt: Date | null;
  createdAt: Date;
}

function mapPrismaReconciliationToDomain(
  p: PrismaReconciliation,
): PaymentReconciliation {
  return {
    id: p.id,
    gatewayTransactionId: p.gatewayTransactionId,
    internalInvoiceId: p.internalInvoiceId,
    amount: Number(p.amount),
    status: p.status,
    gatewayResponse: p.gatewayResponse as Record<string, unknown>,
    reconciledAt: p.reconciledAt,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const BillingRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): BillingRepository => {
  const invoiceRepo: TenantScopedRepository<PrismaInvoice> =
    createTenantScopedRepository(
      prismaClient.invoice as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    async createInvoice(
      tenantId: string,
      data: CreateInvoiceInput,
    ): Promise<DomainResult<Invoice>> {
      try {
        const record = await invoiceRepo.create(tenantId, {
          data: {
            planName: data.planName,
            amount: data.amount,
            billingPeriodStart: data.billingPeriodStart,
            billingPeriodEnd: data.billingPeriodEnd,
            dueDate: data.dueDate,
            idempotencyKey: data.idempotencyKey,
          },
        });
        return ok(mapPrismaInvoiceToDomain(record));
      } catch (error) {
        return fail(
          technicalError('BILLING_INVOICE_CREATE_FAILED', 'Failed to create invoice', { cause: error }),
        );
      }
    },

    async updateInvoiceStatus(
      tenantId: string,
      invoiceId: string,
      status: InvoiceStatus,
      gatewayTransactionId?: string,
      paidAt?: Date,
    ): Promise<DomainResult<Invoice>> {
      try {
        const record = await invoiceRepo.update(tenantId, {
          where: { id: invoiceId },
          data: {
            status,
            ...(gatewayTransactionId !== undefined && { gatewayTransactionId }),
            ...(paidAt !== undefined && { paidAt }),
          },
        });
        return ok(mapPrismaInvoiceToDomain(record));
      } catch (error) {
        return fail(
          technicalError('BILLING_INVOICE_UPDATE_FAILED', 'Failed to update invoice status', { cause: error }),
        );
      }
    },

    async findInvoicesByTenant(
      tenantId: string,
      status?: InvoiceStatus,
    ): Promise<DomainResult<Invoice[]>> {
      try {
        const records = await invoiceRepo.findMany(tenantId, {
          where: status ? { status } : {},
          orderBy: { dueDate: 'desc' },
        });
        return ok(records.map(mapPrismaInvoiceToDomain));
      } catch (error) {
        return fail(
          technicalError('BILLING_INVOICES_FETCH_FAILED', 'Failed to fetch invoices', { cause: error }),
        );
      }
    },

    async getActivePlan(tenantId: string): Promise<DomainResult<SubscriptionPlan>> {
      try {
        const tenant = await prismaClient.tenant.findUnique({
          where: { id: tenantId },
          include: { subscriptionPlan: true },
        });
        if (!tenant || !tenant.subscriptionPlan) {
          return fail(notFoundError('BILLING_PLAN_NOT_FOUND', 'Active subscription plan not found for tenant'));
        }
        return ok(mapPrismaPlanToDomain(tenant.subscriptionPlan as unknown as PrismaPlan));
      } catch (error) {
        return fail(technicalError('BILLING_PLAN_FETCH_FAILED', 'Failed to fetch active plan', { cause: error }));
      }
    },

    async changePlan(tenantId: string, planName: string): Promise<DomainResult<void>> {
      try {
        const plan = await prismaClient.subscriptionPlan.findFirst({ where: { name: planName } });
        if (!plan) {
          return fail(notFoundError('BILLING_PLAN_NOT_FOUND', `Subscription plan '${planName}' not found`));
        }
        await prismaClient.tenant.update({ where: { id: tenantId }, data: { subscriptionPlanId: plan.id } });
        return ok(undefined);
      } catch (error) {
        return fail(technicalError('BILLING_PLAN_CHANGE_FAILED', 'Failed to change subscription plan', { cause: error }));
      }
    },

    async findInvoiceByIdempotencyKey(idempotencyKey: string): Promise<DomainResult<Invoice | null>> {
      try {
        const record = await prismaClient.invoice.findUnique({ where: { idempotencyKey } });
        if (!record) return ok(null);
        return ok(mapPrismaInvoiceToDomain(record as unknown as PrismaInvoice));
      } catch (error) {
        return fail(technicalError('BILLING_IDEMPOTENCY_LOOKUP_FAILED', 'Failed to look up invoice by idempotency key', { cause: error }));
      }
    },

    async incrementRetryCount(tenantId: string, invoiceId: string): Promise<DomainResult<Invoice>> {
      try {
        const record = await invoiceRepo.update(tenantId, {
          where: { id: invoiceId },
          data: { retryCount: { increment: 1 } },
        });
        return ok(mapPrismaInvoiceToDomain(record));
      } catch (error) {
        return fail(technicalError('BILLING_RETRY_INCREMENT_FAILED', 'Failed to increment retry count', { cause: error }));
      }
    },

    async createReconciliation(data: CreateReconciliationInput): Promise<DomainResult<PaymentReconciliation>> {
      try {
        const record = await prismaClient.paymentReconciliation.create({
          data: {
            gatewayTransactionId: data.gatewayTransactionId,
            internalInvoiceId: data.internalInvoiceId,
            amount: data.amount,
            status: data.status,
            gatewayResponse: data.gatewayResponse as object,
            reconciledAt: data.reconciledAt,
          },
        });
        return ok(mapPrismaReconciliationToDomain(record as unknown as PrismaReconciliation));
      } catch (error) {
        return fail(technicalError('BILLING_RECONCILIATION_CREATE_FAILED', 'Failed to create reconciliation record', { cause: error }));
      }
    },

    async countTenantUsers(tenantId: string): Promise<DomainResult<number>> {
      try {
        const count = await prismaClient.user.count({
          where: { tenantId, status: 'active', deletedAt: null },
        });
        return ok(count);
      } catch (error) {
        return fail(technicalError('BILLING_USER_COUNT_FAILED', 'Failed to count tenant users', { cause: error }));
      }
    },

    async getAllPlans(): Promise<DomainResult<SubscriptionPlan[]>> {
      try {
        const plans = await prismaClient.subscriptionPlan.findMany({ orderBy: { price: 'asc' } });
        return ok(plans.map((p) => mapPrismaPlanToDomain(p as unknown as PrismaPlan)));
      } catch (error) {
        return fail(technicalError('BILLING_PLANS_FETCH_FAILED', 'Failed to fetch subscription plans', { cause: error }));
      }
    },
  };
};
