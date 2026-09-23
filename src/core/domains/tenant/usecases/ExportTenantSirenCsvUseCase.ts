/**
 * ExportTenantSirenCsvUseCase — Exports every RT (tenant) and its configured
 * siren device id as CSV, so a platform admin can bulk-edit device ids in a
 * spreadsheet (Excel opens CSV directly) and re-import.
 *
 * The CSV doubles as the import template: keep the header row and the
 * tenantId/subdomain columns intact, edit only sirenDeviceId, then re-upload.
 *
 * Role: Super_Admin only (platform-level device management).
 */

import type { AuthContext } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { TenantRepository } from '../repositories/TenantRepository';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';

// ---------------------------------------------------------------------------
// CSV column contract (shared with the import use case)
// ---------------------------------------------------------------------------

export const SIREN_CSV_HEADER = [
  'tenantId',
  'subdomain',
  'name',
  'sirenDeviceId',
] as const;

/** Escape a value for safe inclusion in a CSV cell (RFC 4180 style). */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ExportTenantSirenCsvUseCase {
  execute(params: {
    authContext: AuthContext;
  }): Promise<DomainResult<string>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ExportTenantSirenCsvUseCaseImpl = ({
  tenantRepository,
}: {
  tenantRepository: TenantRepository;
}): ExportTenantSirenCsvUseCase => ({
  execute: async ({ authContext }) => {
    // 1. Role gate — platform admin only
    if (authContext.role !== UserRole.Super_Admin) {
      return fail(authInsufficientRole());
    }

    // 2. Load all tenants
    const result = await tenantRepository.listAll();
    if (!result.success) {
      return fail(result.error);
    }

    // 3. Build CSV
    const lines: string[] = [SIREN_CSV_HEADER.join(',')];
    for (const t of result.data) {
      lines.push(
        [
          csvCell(t.id),
          csvCell(t.subdomain),
          csvCell(t.name),
          csvCell(t.sirenDeviceId ?? ''),
        ].join(','),
      );
    }

    // Prepend a UTF-8 BOM so Excel opens it with correct encoding.
    return ok(`\uFEFF${lines.join('\r\n')}\r\n`);
  },
});
