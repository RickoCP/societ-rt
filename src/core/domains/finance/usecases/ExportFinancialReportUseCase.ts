/**
 * ExportFinancialReportUseCase — Exports a financial report as a simple
 * text/CSV summary for a tenant within a given date range.
 *
 * Logic:
 * 1. Get report via financeRepository.getReport
 * 2. Format as simple CSV summary (placeholder — PDF/Excel generation
 *    would need external libs)
 * 3. Return ok(csvString)
 *
 * @see Requirements 7.7, 7.10
 */

import type { AuthContext } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { FinanceRepository } from '../repositories/FinanceRepository';
import type { DateRange, FinancialReport } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ExportFinancialReportUseCase {
  execute(params: {
    authContext: AuthContext;
    dateRange: DateRange;
  }): Promise<DomainResult<string>>;
}

// ---------------------------------------------------------------------------
// CSV formatting helper (pure function)
// ---------------------------------------------------------------------------

function formatReportAsCsv(report: FinancialReport): string {
  const lines: string[] = [];

  // Header section
  lines.push(
    `Financial Report: ${report.dateRange.start.toISOString().slice(0, 10)} to ${report.dateRange.end.toISOString().slice(0, 10)}`,
  );
  lines.push(`Opening Balance: ${report.openingBalance}`);
  lines.push(`Closing Balance: ${report.closingBalance}`);
  lines.push('');

  // Categorized totals
  lines.push('Category,Total');
  for (const [category, total] of Object.entries(report.categorizedTotals)) {
    lines.push(`${category},${total}`);
  }
  lines.push('');

  // Transaction details
  lines.push('Date,Type,Category,Description,Amount');
  for (const tx of report.transactions) {
    const date = tx.date.toISOString().slice(0, 10);
    const description = tx.description.replace(/,/g, ';');
    lines.push(
      `${date},${tx.type},${tx.category},${description},${tx.amount}`,
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ExportFinancialReportUseCaseImpl = ({
  financeRepository,
}: {
  financeRepository: FinanceRepository;
}): ExportFinancialReportUseCase => ({
  execute: async ({ authContext, dateRange }) => {
    // 1. Get report via repository
    const result = await financeRepository.getReport(
      authContext.tenantId,
      dateRange,
    );

    if (!result.success) {
      return fail(result.error);
    }

    // 2. Format as CSV summary
    const csv = formatReportAsCsv(result.data);

    // 3. Return success
    return ok(csv);
  },
});
