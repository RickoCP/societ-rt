/**
 * SuspendTenantUseCase — Suspends a tenant, blocking all API access.
 *
 * Logic:
 * 1. Call tenantRepository.suspend(tenantId)
 * 2. Enqueue audit log (fire-and-forget)
 * 3. Return ok(undefined)
 *
 * @see Requirements 30.1
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { TenantRepository } from '../repositories/TenantRepository';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SuspendTenantUseCase {
  execute(params: {
    tenantId: string;
    actorUserId: string;
    ipAddress?: string;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const SuspendTenantUseCaseImpl = ({
  tenantRepository,
  auditQueueProtocol,
}: {
  tenantRepository: TenantRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): SuspendTenantUseCase => ({
  execute: async ({ tenantId, actorUserId, ipAddress }) => {
    // 1. Suspend tenant
    const suspendResult = await tenantRepository.suspend(tenantId);
    if (!suspendResult.success) {
      return fail(suspendResult.error);
    }

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId,
        actionType: 'tenant_suspended',
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
