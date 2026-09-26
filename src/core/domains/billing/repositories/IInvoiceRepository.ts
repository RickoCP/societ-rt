/**
 * IInvoiceRepository — Core repository interface for invoice operations.
 *
 * Provides invoice CRUD operations, query methods for billing cycle management,
 * and status tracking for payment processing.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 57 (Billing/Payment)
 * @see Task 47 — Billing and Payment Integration
 */

import type { DomainResult } from '@core/utils';
import type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from '../entities';
import type { BillingCycle } from '../types';

// ---------------------------------------------------------------------------
// Query Options
// ---------------------------------------------------------------------------

/**
 * Options for querying invoices.
 */
export interface InvoiceQueryOptions {
  /** Filter by invoice status */
  status?: InvoiceStatus | InvoiceStatus[];
  /** Filter by billing cycle type */
  billingCycle?: BillingCycle;
  /** Filter by subscription ID */
  subscriptionId?: string;
  /** Filter invoices with dueDate before this date */
  dueBefore?: Date;
  /** Filter invoices with dueDate after this date */
  dueAfter?: Date;
  /** Filter invoices created after this date */
  createdAfter?: Date;
  /** Filter invoices created before this date */
  createdBefore?: Date;
  /** Pagination: number of records to skip */
  offset?: number;
  /** Pagination: maximum records to return */
  limit?: number;
  /** Sort field */
  sortBy?: 'dueDate' | 'createdAt' | 'amount' | 'status';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Options for finding overdue invoices.
 */
export interface OverdueInvoiceOptions {
  /** Only find invoices that are at least this many days overdue */
  minDaysOverdue?: number;
  /** Only find invoices that are at most this many days overdue */
  maxDaysOverdue?: number;
  /** Limit results */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

export interface IInvoiceRepository {
  /**
   * Create a new invoice.
   */
  create(
    tenantId: string,
    data: CreateInvoiceInput,
  ): Promise<DomainResult<Invoice>>;

  /**
   * Find an invoice by ID.
   */
  findById(
    tenantId: string,
    invoiceId: string,
  ): Promise<DomainResult<Invoice | null>>;

  /**
   * Find an invoice by idempotency key (cross-tenant for duplicate prevention).
   */
  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<DomainResult<Invoice | null>>;

  /**
   * Update an invoice.
   */
  update(
    tenantId: string,
    invoiceId: string,
    data: UpdateInvoiceInput,
  ): Promise<DomainResult<Invoice>>;

  /**
   * Find all invoices for a tenant with optional filtering.
   */
  findByTenantId(
    tenantId: string,
    options?: InvoiceQueryOptions,
  ): Promise<DomainResult<Invoice[]>>;

  /**
   * Find the most recent invoice for a subscription.
   */
  findLatestBySubscription(
    tenantId: string,
    subscriptionId: string,
  ): Promise<DomainResult<Invoice | null>>;

  /**
   * Find invoices that are overdue (past due date but not yet OVERDUE status).
   * Used by billing service to mark invoices as overdue.
   */
  findPendingOverdue(
    options?: OverdueInvoiceOptions,
  ): Promise<DomainResult<Invoice[]>>;

  /**
   * Find invoices that have been OVERDUE for longer than grace period.
   * Used to trigger subscription status changes.
   */
  findOverdueExceedingGracePeriod(
    gracePeriodDays: number,
  ): Promise<DomainResult<Invoice[]>>;

  /**
   * Find invoices that are due for retry (FAILED status, retry count < max).
   */
  findDueForRetry(
    maxRetries: number,
    retryIntervalHours: number,
  ): Promise<DomainResult<Invoice[]>>;

  /**
   * Find unpaid invoices for a subscription (PENDING, OVERDUE, or FAILED).
   */
  findUnpaidBySubscription(
    tenantId: string,
    subscriptionId: string,
  ): Promise<DomainResult<Invoice[]>>;

  /**
   * Update invoice status (with validation).
   */
  updateStatus(
    tenantId: string,
    invoiceId: string,
    status: InvoiceStatus,
    metadata?: {
      gatewayTransactionId?: string;
      paidAt?: Date;
      overdueAt?: Date;
      lastRetryAt?: Date;
    },
  ): Promise<DomainResult<Invoice>>;

  /**
   * Increment retry count and update lastRetryAt.
   */
  incrementRetryCount(
    tenantId: string,
    invoiceId: string,
  ): Promise<DomainResult<Invoice>>;

  /**
   * Count invoices by status for a tenant.
   */
  countByStatus(
    tenantId: string,
    status: InvoiceStatus,
  ): Promise<DomainResult<number>>;

  /**
   * Get total amount for invoices in a billing period.
   */
  getTotalAmountInPeriod(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    status?: InvoiceStatus,
  ): Promise<DomainResult<number>>;

  /**
   * Delete an invoice (soft delete or hard delete based on implementation).
   * Only allowed for CANCELLED invoices.
   */
  delete(
    tenantId: string,
    invoiceId: string,
  ): Promise<DomainResult<void>>;
}
