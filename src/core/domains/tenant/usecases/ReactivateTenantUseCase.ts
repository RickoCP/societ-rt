/**
 * ReactivateTenantUseCase — Reactivates a suspended tenant, restoring access.
 *
 * Logic:
 * 1. Call tenantRepository.reactivate(tenantId)
 * 2. Enqueue audit log (fire-and-forget)
 * 3. Return ok(undefined)
 *
 * @see Requirements 30.2
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { TenantRepository } from '../repositories/TenantRepository';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ReactivateTenantUseCase {
  execute(params: {
    tenantId: string;
    actorUserId: string;
    ipAddress?: string;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ReactivateTenantUseCaseImpl = ({
  tenantRepository,
  auditQueueProtocol,
}: {
  tenantRepository: TenantRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): ReactivateTenantUseCase => ({
  execute: async ({ tenantId, actorUserId, ipAddress }) => {
    // 1. Reactivate tenant
    const reactivateResult = await tenantRepository.reactivate(tenantId);
    if (!reactivateResult.success) {
      return fail(reactivateResult.error);
    }

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId,
        actionType: 'tenant_reactivated',
        resourceType: 'tenant',
        resourceId: tenantId,
        details: {},
        ipAddress,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(undefined);
  },
});
