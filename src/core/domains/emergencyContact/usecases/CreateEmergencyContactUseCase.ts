/**
 * CreateEmergencyContactUseCase — Adds an emergency contact to the caller's
 * tenant (RT). Admin-only (Ketua_RT / Pengurus / Super_Admin).
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';
import type { EmergencyContactRepository } from '../repositories';
import type {
  EmergencyContact,
  CreateEmergencyContactInput,
} from '../entities';
import {
  emergencyContactInvalidLabel,
  emergencyContactInvalidPhone,
} from '../errors';
import {
  EMERGENCY_CONTACT_ADMIN_ROLES,
  isValidLabel,
  isValidPhone,
} from './emergencyContactValidation';

export interface CreateEmergencyContactUseCase {
  execute(params: {
    authContext: AuthContext;
    input: CreateEmergencyContactInput;
  }): Promise<DomainResult<EmergencyContact>>;
}

export const CreateEmergencyContactUseCaseImpl = ({
  emergencyContactRepository,
  auditQueueProtocol,
}: {
  emergencyContactRepository: EmergencyContactRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): CreateEmergencyContactUseCase => ({
  execute: async ({ authContext, input }) => {
    // 1. Role gate.
    if (!EMERGENCY_CONTACT_ADMIN_ROLES.has(authContext.role)) {
      return fail(authInsufficientRole());
    }

    // 2. Validate.
    if (!isValidLabel(input.label)) {
      return fail(emergencyContactInvalidLabel());
    }
    if (!isValidPhone(input.phone)) {
      return fail(emergencyContactInvalidPhone());
    }

    // 3. Create.
    const result = await emergencyContactRepository.create(
      authContext.tenantId,
      {
        label: input.label.trim(),
        phone: input.phone.trim(),
        category: input.category ?? 'other',
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
      },
    );
    if (!result.success) {
      return fail(result.error);
    }

    // 4. Audit (fire-and-forget).
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'emergency_contact_created',
        resourceType: 'emergency_contact',
        resourceId: result.data.id,
        details: { category: result.data.category },
        impersonatorId: authContext.impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(result.data);
  },
});
