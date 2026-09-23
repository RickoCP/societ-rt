/**
 * DeleteEmergencyContactUseCase — Removes an emergency contact from the
 * caller's tenant. Admin-only (Ketua_RT / Pengurus / Super_Admin).
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';
import type { EmergencyContactRepository } from '../repositories';
import { emergencyContactNotFound } from '../errors';
import { EMERGENCY_CONTACT_ADMIN_ROLES } from './emergencyContactValidation';

export interface DeleteEmergencyContactUseCase {
  execute(params: {
    authContext: AuthContext;
    id: string;
  }): Promise<DomainResult<void>>;
}

export const DeleteEmergencyContactUseCaseImpl = ({
  emergencyContactRepository,
  auditQueueProtocol,
}: {
  emergencyContactRepository: EmergencyContactRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): DeleteEmergencyContactUseCase => ({
  execute: async ({ authContext, id }) => {
    // 1. Role gate.
    if (!EMERGENCY_CONTACT_ADMIN_ROLES.has(authContext.role)) {
      return fail(authInsufficientRole());
    }

    // 2. Ensure it exists within the tenant.
    const existing = await emergencyContactRepository.findById(
      authContext.tenantId,
      id,
    );
    if (!existing.success) {
      return fail(existing.error);
    }
    if (!existing.data) {
      return fail(emergencyContactNotFound(id));
    }

    // 3. Delete.
    const result = await emergencyContactRepository.remove(
      authContext.tenantId,
      id,
    );
    if (!result.success) {
      return fail(result.error);
    }

    // 4. Audit (fire-and-forget).
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'emergency_contact_deleted',
        resourceType: 'emergency_contact',
        resourceId: id,
        details: {},
        impersonatorId: authContext.impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(undefined);
  },
});
