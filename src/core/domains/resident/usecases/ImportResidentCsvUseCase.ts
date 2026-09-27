/**
 * ImportResidentCsvUseCase — Imports residents from a CSV string.
 *
 * Logic:
 * 1. Call residentRepository.importFromCsv(tenantId, csvContent)
 * 2. Enqueue audit log with createdCount and skippedCount (fire-and-forget)
 * 3. Return the import summary
 *
 * @see Requirements 5.8, 5.9, 6.1, 6.2, 6.3
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { ResidentRepository } from '../repositories/ResidentRepository';
import type { CsvImportResult } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ImportResidentCsvUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    csvContent: string;
  }): Promise<DomainResult<CsvImportResult>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ImportResidentCsvUseCaseImpl = ({
  residentRepository,
  auditQueueProtocol,
}: {
  residentRepository: ResidentRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): ImportResidentCsvUseCase => ({
  execute: async ({ authContext, csvContent }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Import CSV via repository
    const result = await residentRepository.importFromCsv(
      tenantId,
      csvContent,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const importResult = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'residents_imported',
        resourceType: 'resident',
        resourceId: tenantId,
        details: {
          createdCount: importResult.createdCount,
          skippedCount: importResult.skippedRows.length,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(importResult);
  },
});
