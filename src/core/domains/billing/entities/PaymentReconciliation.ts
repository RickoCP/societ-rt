/**
 * PaymentReconciliation — Domain entity representing a reconciliation record
 * between a payment gateway transaction and an internal invoice.
 *
 * Used for auditing and verifying that gateway payments match internal records.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 29.7
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface PaymentReconciliation {
  readonly id: string;
  readonly gatewayTransactionId: string;
  readonly internalInvoiceId: string;
  readonly amount: number;
  readonly status: string;
  readonly gatewayResponse: Record<string, unknown>;
  readonly reconciledAt: Date | null;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a reconciliation record. */
export interface CreateReconciliationInput {
  readonly gatewayTransactionId: string;
  readonly internalInvoiceId: string;
  readonly amount: number;
  readonly status: string;
  readonly gatewayResponse: Record<string, unknown>;
  readonly reconciledAt: Date | null;
}
