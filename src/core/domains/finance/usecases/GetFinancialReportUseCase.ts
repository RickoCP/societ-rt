/**
 * GetFinancialReportUseCase — Generates a financial report for a tenant
 * within a given date range.
 *
 * Logic:
 * 1. Call financeRepository.getReport(tenantId, dateRange)
 * 2. Return the report
 *
 * @see Requirements 7.7, 7.8
 */

import type { AuthContext } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import type { FinanceRepository } from '../repositories/FinanceRepository';
import type { DateRange, FinancialReport } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetFinancialReportUseCase {
  execute(params: {
    authContext: AuthContext;
    dateRange: DateRange;
  }): Promise<DomainResult<FinancialReport>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetFinancialReportUseCaseImpl = ({
  financeRepository,
}: {
  financeRepository: FinanceRepository;
}): GetFinancialReportUseCase => ({
  execute: async ({ authContext, dateRange }) => {
    // 1. Get report via repository
    return financeRepository.getReport(authContext.tenantId, dateRange);
  },
});
