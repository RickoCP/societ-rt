/**
 * RegisterGateUseCase — Registers a new gate with IoT device association.
 *
 * Logic:
 * 1. Validate caller has Ketua_RT or Pengurus role
 * 2. Register gate via gateRepository.registerGate
 * 3. Enqueue audit log via AuditQueueProtocol (fire-and-forget)
 * 4. Return ok(gate)
 *
 * @see Requirements 33.1, 33.7, 33.10
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok, authorizationError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { GateRepository } from '../repositories/GateRepository';
import type { Gate, RegisterGateInput } from '../entities';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId, hasAllowedUserRole } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RegisterGateUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: RegisterGateInput;
  }): Promise<DomainResult<Gate>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RegisterGateUseCaseImpl = ({
  gateRepository,
  auditQueueProtocol,
}: {
  gateRepository: GateRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RegisterGateUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Validate role: only Ketua_RT or Pengurus can register gates
    const ALLOWED_ROLES = new Set([UserRole.Ketua_RT, UserRole.Pengurus]);
    if (!hasAllowedUserRole(authContext, ALLOWED_ROLES)) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          'Only Ketua_RT or Pengurus can register gates',
          { userMessage: 'Anda tidak memiliki izin untuk mendaftarkan gerbang.' },
        ),
      );
    }

    // 2. Register gate via repository
    const result = await gateRepository.registerGate(
      tenantId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const gate = result.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'gate_registered',
        resourceType: 'gate',
        resourceId: gate.id,
        details: {
          name: gate.name,
          location: gate.location,
          deviceId: gate.deviceId,
          latitude: gate.latitude,
          longitude: gate.longitude,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(gate);
  },
});
