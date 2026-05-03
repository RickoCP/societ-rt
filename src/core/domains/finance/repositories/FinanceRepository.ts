/**
 * FinanceRepository — Core repository interface for financial operations
 * (uang kas, iuran, reports).
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.9
 */

import type { DomainResult } from '@core/utils';
import type {
  CreateTransactionInput,
  DateRange,
  FinancialReport,
  FinancialTransaction,
  IuranStatus,
} from '../entities';

export interface FinanceRepository {
  /** Record a new income or expense transaction within a tenant. */
  recordTransaction(
    tenantId: string,
    data: CreateTransactionInput,
    createdBy: string,
  ): Promise<DomainResult<FinancialTransaction>>;

  /** Get the current running balance for a tenant (sum of income − sum of expense). */
  getBalance(tenantId: string): Promise<DomainResult<number>>;

  /** Get the iuran payment status for a specific household and month. */
  getIuranStatus(
    tenantId: string,
    householdId: string,
    month: string,
  ): Promise<DomainResult<IuranStatus>>;

  /** Record an iuran payment for a household, linking it to a transaction. */
  recordIuranPayment(
    tenantId: string,
    householdId: string,
    month: string,
    transactionId: string,
  ): Promise<DomainResult<void>>;

  /** Generate a financial report for a tenant within a date range. */
  getReport(
    tenantId: string,
    dateRange: DateRange,
  ): Promise<DomainResult<FinancialReport>>;
}
