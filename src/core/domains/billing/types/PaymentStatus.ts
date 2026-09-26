/**
 * PaymentStatus — Types and utilities for payment and invoice status management.
 *
 * Defines the payment lifecycle states and invoice status values used
 * throughout the billing domain.
 *
 * @see Requirements 57 (Billing/Payment)
 * @see Task 47 — Billing and Payment Integration
 */

// ---------------------------------------------------------------------------
// Invoice Status
// ---------------------------------------------------------------------------

/**
 * Invoice status values representing the billing lifecycle.
 */
export const InvoiceStatus = {
  /** Invoice created, awaiting payment */
  PENDING: 'PENDING',
  /** Payment has been received and confirmed */
  PAID: 'PAID',
  /** Payment attempt failed */
  FAILED: 'FAILED',
  /** Invoice is past due date but still within grace period */
  OVERDUE: 'OVERDUE',
  /** Invoice cancelled (e.g., subscription cancelled before billing) */
  CANCELLED: 'CANCELLED',
  /** Refund has been issued for this invoice */
  REFUNDED: 'REFUNDED',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

/**
 * All valid invoice status values.
 */
export const ALL_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.PENDING,
  InvoiceStatus.PAID,
  InvoiceStatus.FAILED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.CANCELLED,
  InvoiceStatus.REFUNDED,
] as const;

// ---------------------------------------------------------------------------
// Payment Attempt Status
// ---------------------------------------------------------------------------

/**
 * Status of an individual payment attempt.
 */
export const PaymentAttemptStatus = {
  /** Payment initiated, waiting for confirmation */
  INITIATED: 'INITIATED',
  /** Payment is being processed by gateway */
  PROCESSING: 'PROCESSING',
  /** Payment completed successfully */
  COMPLETED: 'COMPLETED',
  /** Payment failed (insufficient funds, card declined, etc.) */
  FAILED: 'FAILED',
  /** Payment expired before completion */
  EXPIRED: 'EXPIRED',
  /** Payment was cancelled by user or system */
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentAttemptStatus =
  (typeof PaymentAttemptStatus)[keyof typeof PaymentAttemptStatus];

// ---------------------------------------------------------------------------
// Billing Cycle
// ---------------------------------------------------------------------------

/**
 * Billing cycle/period types.
 */
export const BillingCycle = {
  /** Monthly billing */
  MONTHLY: 'MONTHLY',
  /** Quarterly billing (every 3 months) */
  QUARTERLY: 'QUARTERLY',
  /** Annual billing */
  ANNUAL: 'ANNUAL',
} as const;

export type BillingCycle = (typeof BillingCycle)[keyof typeof BillingCycle];

/**
 * Get the number of months in a billing cycle.
 */
export function getBillingCycleMonths(cycle: BillingCycle): number {
  switch (cycle) {
    case BillingCycle.MONTHLY:
      return 1;
    case BillingCycle.QUARTERLY:
      return 3;
    case BillingCycle.ANNUAL:
      return 12;
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Status Transitions
// ---------------------------------------------------------------------------

/**
 * Valid invoice status transitions.
 *
 * PENDING → PAID (payment successful)
 * PENDING → FAILED (payment failed)
 * PENDING → OVERDUE (past due date)
 * PENDING → CANCELLED (subscription cancelled)
 * OVERDUE → PAID (payment received)
 * OVERDUE → FAILED (payment failed after overdue)
 * OVERDUE → CANCELLED (subscription cancelled)
 * FAILED → PENDING (retry payment)
 * FAILED → CANCELLED (give up)
 * PAID → REFUNDED (refund issued)
 */
export const INVOICE_STATUS_TRANSITIONS: Record<
  InvoiceStatus,
  readonly InvoiceStatus[]
> = {
  [InvoiceStatus.PENDING]: [
    InvoiceStatus.PAID,
    InvoiceStatus.FAILED,
    InvoiceStatus.OVERDUE,
    InvoiceStatus.CANCELLED,
  ],
  [InvoiceStatus.OVERDUE]: [
    InvoiceStatus.PAID,
    InvoiceStatus.FAILED,
    InvoiceStatus.CANCELLED,
  ],
  [InvoiceStatus.FAILED]: [InvoiceStatus.PENDING, InvoiceStatus.CANCELLED],
  [InvoiceStatus.PAID]: [InvoiceStatus.REFUNDED],
  [InvoiceStatus.CANCELLED]: [], // Terminal
  [InvoiceStatus.REFUNDED]: [], // Terminal
} as const;

/**
 * Check if an invoice status transition is valid.
 */
export function isValidInvoiceStatusTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): boolean {
  const allowedTransitions = INVOICE_STATUS_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Check if invoice status is terminal (no further transitions).
 */
export function isTerminalInvoiceStatus(status: InvoiceStatus): boolean {
  return (
    status === InvoiceStatus.CANCELLED || status === InvoiceStatus.REFUNDED
  );
}

/**
 * Check if invoice requires payment action.
 */
export function requiresPaymentAction(status: InvoiceStatus): boolean {
  return (
    status === InvoiceStatus.PENDING ||
    status === InvoiceStatus.OVERDUE ||
    status === InvoiceStatus.FAILED
  );
}

// ---------------------------------------------------------------------------
// Grace Period Configuration
// ---------------------------------------------------------------------------

/**
 * Default grace period in days before subscription status changes.
 */
export const DEFAULT_GRACE_PERIOD_DAYS = 7;

/**
 * Maximum retry attempts for failed payments.
 */
export const MAX_PAYMENT_RETRY_ATTEMPTS = 3;

/**
 * Interval between payment retry attempts in hours.
 */
export const PAYMENT_RETRY_INTERVAL_HOURS = 24;
