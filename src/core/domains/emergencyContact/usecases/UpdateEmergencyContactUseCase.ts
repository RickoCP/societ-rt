/**
 * UpdateEmergencyContactUseCase — Edits an emergency contact within the
 * caller's tenant. Admin-only (Ketua_RT / Pengurus / Super_Admin).
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';
import type { EmergencyContactRepository } from '../repositories';
import type {
  EmergencyContact,
  UpdateEmergencyContactInput,
} from '../entities';
import {
  emergencyContactNotFound,
  emergencyContactInvalidLabel,
  emergencyContactInvalidPhone,
} from '../errors';
import {
  EMERGENCY_CONTACT_ADMIN_ROLES,
  isValidLabel,
  isValidPhone,
} from './emergencyContactValidation';

export interface UpdateEmergencyContactUseCase {
  execute(params: {
    authContext: AuthContext;
    id: string;
    input: UpdateEmergencyContactInput;
  }): Promise<DomainResult<EmergencyContact>>;
}

export const UpdateEmergencyContactUseCaseImpl = ({
  emergencyContactRepository,
  auditQueueProtocol,
}: {
  emergencyContactRepository: EmergencyContactRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): UpdateEmergencyContactUseCase => ({
  execute: async ({ authContext, id, input }) => {
    // 1. Role gate.
    if (!EMERGENCY_CONTACT_ADMIN_ROLES.has(authContext.role)) {
      return fail(authInsufficientRole());
    }

    // 2. Validate provided fields (partial update).
    if (input.label !== undefined && !isValidLabel(input.label)) {
      return fail(emergencyContactInvalidLabel());
    }
    if (input.phone !== undefined && !isValidPhone(input.phone)) {
      return fail(emergencyContactInvalidPhone());
    }

    // 3. Ensure it exists within the tenant.
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

    // 4. Normalize + update.
    const patch: UpdateEmergencyContactInput = {
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    };

    const result = await emergencyContactRepository.update(
      authContext.tenantId,
      id,
      patch,
    );
    if (!result.success) {
      return fail(result.error);
    }

    // 5. Audit (fire-and-forget).
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'emergency_contact_updated',
        resourceType: 'emergency_contact',
        resourceId: id,
        details: { category: result.data.category },
        impersonatorId: authContext.impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(result.data);
  },
});
