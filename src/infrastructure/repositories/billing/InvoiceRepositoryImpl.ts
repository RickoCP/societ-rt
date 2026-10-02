/**
 * InvoiceRepositoryImpl — Infrastructure implementation of IInvoiceRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped invoice queries.
 * Handles Prisma Decimal to number conversion for amount fields.
 *
 * @see Requirements 57 (Billing/Payment)
 * @see Task 47 — Billing and Payment Integration
 */

import type { PrismaClient } from '@prisma/client';

type PrismaInvoiceStatus = 'pending' | 'paid' | 'failed';
import type { DomainResult } from '@core/utils';
import { ok, fail, notFoundError, technicalError, businessError } from '@core/utils';
import type {
  IInvoiceRepository,
  InvoiceQueryOptions,
  OverdueInvoiceOptions,
} from '@core/domains/billing/repositories/IInvoiceRepository';
import type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from '@core/domains/billing/entities';
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

function mapDomainStatusToPrisma(status: InvoiceStatus): PrismaInvoiceStatus {
  return status as PrismaInvoiceStatus;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const InvoiceRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): IInvoiceRepository => {
  const invoiceRepo: TenantScopedRepository<PrismaInvoice> = createTenantScopedRepository(
    prismaClient.invoice as unknown as Parameters<typeof createTenantScopedRepository>[0],
  );

  return {
    // -------------------------------------------------------------------------
    // Create Operations
    // -------------------------------------------------------------------------

    async create(
      tenantId: string,
      data: CreateInvoiceInput,
    ): Promise<DomainResult<Invoice>> {
      try {
        const invoice = await invoiceRepo.create(tenantId, {
          data: {
            planName: data.planName,
            amount: data.amount,
            billingPeriodStart: data.billingPeriodStart,
            billingPeriodEnd: data.billingPeriodEnd,
            dueDate: data.dueDate,
            idempotencyKey: data.idempotencyKey,
          },
        });

        return ok(mapPrismaInvoiceToDomain(invoice));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_CREATE_FAILED',
            'Failed to create invoice',
            { cause: error },
          ),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Read Operations
    // -------------------------------------------------------------------------

    async findById(
      tenantId: string,
      invoiceId: string,
    ): Promise<DomainResult<Invoice | null>> {
      try {
        const invoice = await invoiceRepo.findFirst(tenantId, {
          where: { id: invoiceId },
        });

        if (!invoice) {
          return ok(null);
        }

        return ok(mapPrismaInvoiceToDomain(invoice));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_FIND_FAILED',
            'Failed to find invoice',
            { cause: error },
          ),
        );
      }
    },

    async findByIdempotencyKey(
      idempotencyKey: string,
    ): Promise<DomainResult<Invoice | null>> {
      try {
        const invoice = await prismaClient.invoice.findUnique({
          where: { idempotencyKey },
        });

        if (!invoice) {
          return ok(null);
        }

        return ok(mapPrismaInvoiceToDomain(invoice as unknown as PrismaInvoice));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_IDEMPOTENCY_LOOKUP_FAILED',
            'Failed to look up invoice by idempotency key',
            { cause: error },
          ),
        );
      }
    },

    async findByTenantId(
      tenantId: string,
      options?: InvoiceQueryOptions,
    ): Promise<DomainResult<Invoice[]>> {
      try {
        const where: Record<string, unknown> = {};

        // Build status filter
        if (options?.status) {
          if (Array.isArray(options.status)) {
            where.status = { in: options.status.map(mapDomainStatusToPrisma) };
          } else {
            where.status = mapDomainStatusToPrisma(options.status);
          }
        }

        // Build date filters
        if (options?.dueBefore || options?.dueAfter) {
          where.dueDate = {};
          if (options.dueBefore) {
            (where.dueDate as Record<string, unknown>).lt = options.dueBefore;
          }
          if (options.dueAfter) {
            (where.dueDate as Record<string, unknown>).gt = options.dueAfter;
          }
        }

        if (options?.createdBefore || options?.createdAfter) {
          where.createdAt = {};
          if (options.createdBefore) {
            (where.createdAt as Record<string, unknown>).lt = options.createdBefore;
          }
          if (options.createdAfter) {
            (where.createdAt as Record<string, unknown>).gt = options.createdAfter;
          }
        }

        // Build sort options
        const orderBy: Record<string, string> = {};
        if (options?.sortBy) {
          orderBy[options.sortBy] = options.sortOrder ?? 'desc';
        } else {
          orderBy.createdAt = 'desc';
        }

        const invoices = await invoiceRepo.findMany(tenantId, {
          where,
          orderBy,
          skip: options?.offset ?? 0,
          take: options?.limit ?? 50,
        });

        return ok(invoices.map(mapPrismaInvoiceToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_FIND_BY_TENANT_FAILED',
            'Failed to find invoices by tenant',
            { cause: error },
          ),
        );
      }
    },

    async findLatestBySubscription(
      tenantId: string,
      _subscriptionId: string,
    ): Promise<DomainResult<Invoice | null>> {
      try {
        // Current schema doesn't have subscriptionId on Invoice
        // Fall back to finding the latest invoice for the tenant
        const invoice = await invoiceRepo.findFirst(tenantId, {
          orderBy: { createdAt: 'desc' },
        });

        if (!invoice) {
          return ok(null);
        }

        return ok(mapPrismaInvoiceToDomain(invoice));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_FIND_LATEST_FAILED',
            'Failed to find latest invoice by subscription',
            { cause: error },
          ),
        );
      }
    },

    async findPendingOverdue(
      options?: OverdueInvoiceOptions,
    ): Promise<DomainResult<Invoice[]>> {
      try {
        const now = new Date();
        const where: Record<string, unknown> = {
          status: 'pending' as PrismaInvoiceStatus,
          dueDate: { lt: now },
        };

        if (options?.minDaysOverdue) {
          const minDate = new Date(now);
          minDate.setDate(minDate.getDate() - options.minDaysOverdue);
          (where.dueDate as Record<string, unknown>).lt = minDate;
        }

        if (options?.maxDaysOverdue) {
          const maxDate = new Date(now);
          maxDate.setDate(maxDate.getDate() - options.maxDaysOverdue);
          (where.dueDate as Record<string, unknown>).gt = maxDate;
        }

        const invoices = await prismaClient.invoice.findMany({
          where,
          take: options?.limit ?? 100,
          orderBy: { dueDate: 'asc' },
        });

        return ok(invoices.map((i: PrismaInvoice) => mapPrismaInvoiceToDomain(i as unknown as PrismaInvoice)));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_FIND_PENDING_OVERDUE_FAILED',
            'Failed to find pending overdue invoices',
            { cause: error },
          ),
        );
      }
    },

    async findOverdueExceedingGracePeriod(
      gracePeriodDays: number,
    ): Promise<DomainResult<Invoice[]>> {
      try {
        const now = new Date();
        const gracePeriodDate = new Date(now);
        gracePeriodDate.setDate(gracePeriodDate.getDate() - gracePeriodDays);

        const invoices = await prismaClient.invoice.findMany({
          where: {
            status: 'pending' as PrismaInvoiceStatus,
            dueDate: { lt: gracePeriodDate },
          },
          orderBy: { dueDate: 'asc' },
        });

        return ok(invoices.map((i: PrismaInvoice) => mapPrismaInvoiceToDomain(i as unknown as PrismaInvoice)));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_FIND_OVERDUE_EXCEEDING_GRACE_FAILED',
            'Failed to find invoices exceeding grace period',
            { cause: error },
          ),
        );
      }
    },

    async findDueForRetry(
      maxRetries: number,
      _retryIntervalHours: number,
    ): Promise<DomainResult<Invoice[]>> {
      try {
        const invoices = await prismaClient.invoice.findMany({
          where: {
            status: 'failed' as PrismaInvoiceStatus,
            retryCount: { lt: maxRetries },
          },
          orderBy: { updatedAt: 'asc' },
        });

        return ok(invoices.map((i: PrismaInvoice) => mapPrismaInvoiceToDomain(i as unknown as PrismaInvoice)));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_FIND_DUE_FOR_RETRY_FAILED',
            'Failed to find invoices due for retry',
            { cause: error },
          ),
        );
      }
    },

    async findUnpaidBySubscription(
      tenantId: string,
      _subscriptionId: string,
    ): Promise<DomainResult<Invoice[]>> {
      try {
        // Current schema doesn't have subscriptionId on Invoice
        // Fall back to finding unpaid invoices for the tenant
        const invoices = await invoiceRepo.findMany(tenantId, {
          where: {
            status: { in: ['pending', 'failed'] as PrismaInvoiceStatus[] },
          },
          orderBy: { dueDate: 'asc' },
        });

        return ok(invoices.map(mapPrismaInvoiceToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_FIND_UNPAID_FAILED',
            'Failed to find unpaid invoices',
            { cause: error },
          ),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Update Operations
    // -------------------------------------------------------------------------

    async update(
      tenantId: string,
      invoiceId: string,
      data: UpdateInvoiceInput,
    ): Promise<DomainResult<Invoice>> {
      try {
        const updateData: Record<string, unknown> = {};

        if (data.status !== undefined) {
          updateData.status = mapDomainStatusToPrisma(data.status);
        }
        if (data.gatewayTransactionId !== undefined) {
          updateData.gatewayTransactionId = data.gatewayTransactionId;
        }
        if (data.paidAt !== undefined) {
          updateData.paidAt = data.paidAt;
        }
        if (data.retryCount !== undefined) {
          updateData.retryCount = data.retryCount;
        }

        const invoice = await invoiceRepo.update(tenantId, {
          where: { id: invoiceId },
          data: updateData,
        });

        return ok(mapPrismaInvoiceToDomain(invoice));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_UPDATE_FAILED',
            'Failed to update invoice',
            { cause: error },
          ),
        );
      }
    },

    async updateStatus(
      tenantId: string,
      invoiceId: string,
      status: InvoiceStatus,
      metadata?: {
        gatewayTransactionId?: string;
        paidAt?: Date;
        overdueAt?: Date;
        lastRetryAt?: Date;
      },
    ): Promise<DomainResult<Invoice>> {
      try {
        const updateData: Record<string, unknown> = {
          status: mapDomainStatusToPrisma(status),
        };

        if (metadata?.gatewayTransactionId !== undefined) {
          updateData.gatewayTransactionId = metadata.gatewayTransactionId;
        }
        if (metadata?.paidAt !== undefined) {
          updateData.paidAt = metadata.paidAt;
        }
        // Note: overdueAt and lastRetryAt not in current schema

        const invoice = await invoiceRepo.update(tenantId, {
          where: { id: invoiceId },
          data: updateData,
        });

        return ok(mapPrismaInvoiceToDomain(invoice));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_STATUS_UPDATE_FAILED',
            'Failed to update invoice status',
            { cause: error },
          ),
        );
      }
    },

    async incrementRetryCount(
      tenantId: string,
      invoiceId: string,
    ): Promise<DomainResult<Invoice>> {
      try {
        const invoice = await invoiceRepo.update(tenantId, {
          where: { id: invoiceId },
          data: { retryCount: { increment: 1 } },
        });

        return ok(mapPrismaInvoiceToDomain(invoice));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_RETRY_INCREMENT_FAILED',
            'Failed to increment retry count',
            { cause: error },
          ),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Count/Stats Operations
    // -------------------------------------------------------------------------

    async countByStatus(
      tenantId: string,
      status: InvoiceStatus,
    ): Promise<DomainResult<number>> {
      try {
        const count = await invoiceRepo.count(tenantId, {
          where: { status: mapDomainStatusToPrisma(status) },
        });

        return ok(count);
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_COUNT_BY_STATUS_FAILED',
            'Failed to count invoices by status',
            { cause: error },
          ),
        );
      }
    },

    async getTotalAmountInPeriod(
      tenantId: string,
      periodStart: Date,
      periodEnd: Date,
      status?: InvoiceStatus,
    ): Promise<DomainResult<number>> {
      try {
        const where: Record<string, unknown> = {
          tenantId,
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        };

        if (status) {
          where.status = mapDomainStatusToPrisma(status);
        }

        const result = await prismaClient.invoice.aggregate({
          where,
          _sum: {
            amount: true,
          },
        });

        return ok(Number(result._sum.amount ?? 0));
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_TOTAL_AMOUNT_FAILED',
            'Failed to get total amount in period',
            { cause: error },
          ),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Delete Operations
    // -------------------------------------------------------------------------

    async delete(
      tenantId: string,
      invoiceId: string,
    ): Promise<DomainResult<void>> {
      try {
        // Verify the invoice is in CANCELLED status (or appropriate for deletion)
        const existing = await invoiceRepo.findFirst(tenantId, {
          where: { id: invoiceId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'INVOICE_NOT_FOUND',
              `Invoice ${invoiceId} not found`,
            ),
          );
        }

        // Only allow deletion of non-paid invoices
        if (existing.status === 'paid') {
          return fail(
            businessError(
              'INVOICE_CANNOT_DELETE_PAID',
              'Cannot delete a paid invoice',
            ),
          );
        }

        await invoiceRepo.delete(tenantId, {
          where: { id: invoiceId },
        });

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'INVOICE_DELETE_FAILED',
            'Failed to delete invoice',
            { cause: error },
          ),
        );
      }
    },
  };
};
