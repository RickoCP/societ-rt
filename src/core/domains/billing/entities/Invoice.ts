/**
 * Invoice — Domain entity representing a billing invoice for a tenant.
 *
 * Tracks billing period, payment status, gateway transaction references,
 * retry count, and idempotency key for duplicate prevention.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * NOTE: The enhanced Invoice with additional fields (subscriptionId, billingCycle,
 * paymentUrl, overdueAt, currency, maxRetries, lastRetryAt) requires a Prisma
 * schema migration. Use InvoiceV2 for the enhanced version.
 *
 * @see Requirements 29.1, 29.7, 57
 * @see Task 47 — Billing and Payment Integration
 */

// ---------------------------------------------------------------------------
// Value types (compatible with current Prisma schema)
// ---------------------------------------------------------------------------

/**
 * Current invoice status values from Prisma schema (lowercase).
 */
export type InvoiceStatus = 'pending' | 'paid' | 'failed';

// ---------------------------------------------------------------------------
// Entity (current schema)
// ---------------------------------------------------------------------------

export interface Invoice {
  readonly id: string;
  readonly tenantId: string;
  readonly planName: string;
  readonly amount: number;
  readonly billingPeriodStart: Date;
  readonly billingPeriodEnd: Date;
  readonly dueDate: Date;
  readonly status: InvoiceStatus;
  readonly gatewayTransactionId: string | null;
  readonly paidAt: Date | null;
  readonly retryCount: number;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new invoice. */
export interface CreateInvoiceInput {
  readonly planName: string;
  readonly amount: number;
  readonly billingPeriodStart: Date;
  readonly billingPeriodEnd: Date;
  readonly dueDate: Date;
  readonly idempotencyKey: string;
}

/** Data for updating an invoice. */
export interface UpdateInvoiceInput {
  readonly status?: InvoiceStatus;
  readonly gatewayTransactionId?: string | null;
  readonly paidAt?: Date | null;
  readonly retryCount?: number;
}
