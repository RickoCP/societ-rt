/**
 * Invoice — Domain entity representing a billing invoice for a tenant.
 *
 * Tracks billing period, payment status, gateway transaction references,
 * retry count, and idempotency key for duplicate prevention.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 29.1, 29.7
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type InvoiceStatus = 'pending' | 'paid' | 'failed';

// ---------------------------------------------------------------------------
// Entity
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
