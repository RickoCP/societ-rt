/**
 * IuranStatus — Domain entity representing the monthly dues (iuran)
 * payment status for a household within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 7.4, 7.5
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type IuranPaymentStatus = 'paid' | 'unpaid';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface IuranStatus {
  readonly id: string;
  readonly tenantId: string;
  readonly householdId: string;
  /** Month in YYYY-MM format. */
  readonly month: string;
  readonly status: IuranPaymentStatus;
  readonly paidAt: Date | null;
  readonly transactionId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
