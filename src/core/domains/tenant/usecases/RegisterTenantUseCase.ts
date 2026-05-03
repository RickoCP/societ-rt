/**
 * RegisterTenantUseCase — Registers a new tenant (RT/RW community).
 *
 * Logic:
 * 1. Generate subdomain from tenant name
 * 2. Check for duplicates (subdomain + RT/RW number per region)
 * 3. If duplicate → fail with tenantDuplicate()
 * 4. Create tenant via repository (repo associates with Free plan)
 * 5. Enqueue audit log (fire-and-forget)
 * 6. Return ok(tenant)
 *
 * @see Requirements 2.1, 2.2, 2.5
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { TenantRepository } from '../repositories/TenantRepository';
import type { CreateTenantInput, Tenant } from '../entities';
import { tenantDuplicate } from '../errors/tenantErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RegisterTenantUseCase {
  execute(params: {
    data: CreateTenantInput;
    actorUserId: string;
    ipAddress?: string;
  }): Promise<DomainResult<Tenant>>;
}

// ---------------------------------------------------------------------------
// Subdomain helper (private)
// ---------------------------------------------------------------------------

function generateSubdomain(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RegisterTenantUseCaseImpl = ({
  tenantRepository,
  auditQueueProtocol,
}: {
  tenantRepository: TenantRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RegisterTenantUseCase => ({
  execute: async ({ data, actorUserId, ipAddress }) => {
    // 1. Generate subdomain from tenant name
    const subdomain = generateSubdomain(data.name);

    // 2. Check for duplicates (subdomain or same RT/RW in same region)
    const duplicateResult = await tenantRepository.checkDuplicate(
      subdomain,
      data.rtRwNumber,
      data.region,
    );
    if (!duplicateResult.success) {
      return fail(duplicateResult.error);
    }

    // 3. If duplicate found → fail
    if (duplicateResult.data) {
      return fail(tenantDuplicate());
    }

    // 4. Create tenant via repository (repo associates with Free plan)
    const createResult = await tenantRepository.create(data);
    if (!createResult.success) {
      return fail(createResult.error);
    }

    const tenant = createResult.data;

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: tenant.id,
        actorUserId,
        actionType: 'tenant_created',
        resourceType: 'tenant',
        resourceId: tenant.id,
        details: { name: tenant.name, subdomain: tenant.subdomain },
        ipAddress,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 6. Return success
    return ok(tenant);
  },
});
