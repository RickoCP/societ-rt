/**
 * ExportResidentCsvUseCase — Exports all resident data for a tenant as CSV.
 *
 * Logic:
 * 1. Call residentRepository.exportToCsv(tenantId)
 * 2. Return the CSV string
 *
 * @see Requirements 5.7, 6.1, 6.2
 */

import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import type { ResidentRepository } from '../repositories/ResidentRepository';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ExportResidentCsvUseCase {
  execute(params: {
    authContext: AuthContextCompat;
  }): Promise<DomainResult<string>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ExportResidentCsvUseCaseImpl = ({
  residentRepository,
}: {
  residentRepository: ResidentRepository;
}): ExportResidentCsvUseCase => ({
  execute: async ({ authContext }) => {
    const tenantId = getTenantId(authContext);
    // 1. Export CSV via repository
    return residentRepository.exportToCsv(tenantId);
  },
});
