/**
 * ImportTenantSirenCsvUseCase — Bulk-updates per-RT siren device ids from a CSV
 * (as exported by ExportTenantSirenCsvUseCase / editable in Excel).
 *
 * Matching: each row is resolved by `tenantId` when present, otherwise by
 * `subdomain`. Only `sirenDeviceId` is written; other columns are informational.
 * An empty sirenDeviceId cell clears the device (falls back to the env default).
 *
 * The operation is best-effort per row: invalid/unmatched rows are skipped and
 * reported, valid rows are applied. Role: Super_Admin only.
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, validationError } from '@core/utils';
import type { TenantRepository } from '../repositories/TenantRepository';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';

// ---------------------------------------------------------------------------
// Result shape (mirrors the resident CSV import summary)
// ---------------------------------------------------------------------------

export interface TenantSirenImportResult {
  readonly updatedCount: number;
  readonly clearedCount: number;
  readonly skippedRows: ReadonlyArray<{
    readonly row: number;
    readonly reason: string;
  }>;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ImportTenantSirenCsvUseCase {
  execute(params: {
    authContext: AuthContext;
    csvContent: string;
  }): Promise<DomainResult<TenantSirenImportResult>>;
}

// ---------------------------------------------------------------------------
// Minimal RFC-4180 CSV line parser (handles quotes, commas, escaped quotes)
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ImportTenantSirenCsvUseCaseImpl = ({
  tenantRepository,
  auditQueueProtocol,
}: {
  tenantRepository: TenantRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): ImportTenantSirenCsvUseCase => ({
  execute: async ({ authContext, csvContent }) => {
    // 1. Role gate — platform admin only
    if (authContext.role !== UserRole.Super_Admin) {
      return fail(authInsufficientRole());
    }

    // 2. Split into rows (strip BOM, tolerate CRLF/LF, drop blank lines)
    const rows = csvContent
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0);

    if (rows.length === 0) {
      return fail(
        validationError('COMMON_VALIDATION_FAILED', 'CSV is empty'),
      );
    }

    // 3. Parse header and locate columns (order-independent)
    const header = parseCsvLine(rows[0] ?? '').map(h => h.trim().toLowerCase());
    const idIdx = header.indexOf('tenantid');
    const subIdx = header.indexOf('subdomain');
    const deviceIdx = header.indexOf('sirendeviceid');

    if (deviceIdx === -1 || (idIdx === -1 && subIdx === -1)) {
      return fail(
        validationError(
          'COMMON_VALIDATION_FAILED',
          'CSV must have a "sirenDeviceId" column and at least one of "tenantId" or "subdomain"',
        ),
      );
    }

    // 4. Preload tenants once to resolve rows without N queries.
    const listResult = await tenantRepository.listAll();
    if (!listResult.success) {
      return fail(listResult.error);
    }
    const byId = new Map(
      listResult.data.map(t => [t.id, t] as const),
    );
    const bySubdomain = new Map(
      listResult.data.map(t => [t.subdomain.toLowerCase(), t] as const),
    );

    const skippedRows: Array<{ row: number; reason: string }> = [];
    let updatedCount = 0;
    let clearedCount = 0;

    // 5. Apply each data row
    for (let i = 1; i < rows.length; i++) {
      const cells = parseCsvLine(rows[i] ?? '');
      const rawId = (idIdx !== -1 ? cells[idIdx] : '')?.trim() ?? '';
      const rawSub = (subIdx !== -1 ? cells[subIdx] : '')?.trim() ?? '';
      const rawDevice = (cells[deviceIdx] ?? '').trim();

      const tenant = rawId
        ? byId.get(rawId)
        : bySubdomain.get(rawSub.toLowerCase());

      if (!tenant) {
        skippedRows.push({
          row: i + 1,
          reason: rawId
            ? `Tenant id "${rawId}" not found`
            : rawSub
              ? `Subdomain "${rawSub}" not found`
              : 'Missing tenantId and subdomain',
        });
        continue;
      }

      const sirenDeviceId = rawDevice.length > 0 ? rawDevice : null;

      // Skip no-op rows to avoid unnecessary writes.
      if ((tenant.sirenDeviceId ?? null) === sirenDeviceId) {
        continue;
      }

      const updateResult = await tenantRepository.update(tenant.id, {
        sirenDeviceId,
      });
      if (!updateResult.success) {
        skippedRows.push({
          row: i + 1,
          reason: `Update failed for "${tenant.subdomain}"`,
        });
        continue;
      }

      if (sirenDeviceId === null) {
        clearedCount++;
      } else {
        updatedCount++;
      }
    }

    // 6. Audit (fire-and-forget) — no device ids logged, only counts.
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'tenant_siren_devices_imported',
        resourceType: 'tenant',
        resourceId: authContext.tenantId,
        details: {
          updatedCount,
          clearedCount,
          skippedCount: skippedRows.length,
        },
        impersonatorId: authContext.impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok({ updatedCount, clearedCount, skippedRows });
  },
});
