/**
 * FinancialTransaction — Domain entity representing an income or expense
 * transaction within a tenant's community treasury (uang kas).
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.7, 7.9
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type TransactionType = 'income' | 'expense';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface FinancialTransaction {
  readonly id: string;
  readonly tenantId: string;
  readonly type: TransactionType;
  readonly amount: number;
  readonly description: string;
  readonly category: string;
  readonly date: Date;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to record a new financial transaction. */
export interface CreateTransactionInput {
  readonly type: TransactionType;
  readonly amount: number;
  readonly description: string;
  readonly category: string;
  readonly date: Date;
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

/** A date range used to scope financial queries and reports. */
export interface DateRange {
  readonly start: Date;
  readonly end: Date;
}

/** Financial report for a given date range within a tenant. */
export interface FinancialReport {
  readonly transactions: readonly FinancialTransaction[];
  readonly categorizedTotals: Readonly<Record<string, number>>;
  readonly openingBalance: number;
  readonly closingBalance: number;
  readonly dateRange: DateRange;
}
