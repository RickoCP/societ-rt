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

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok, authorizationError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { GateRepository } from '../repositories/GateRepository';
import type { Gate, RegisterGateInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RegisterGateUseCase {
  execute(params: {
    authContext: AuthContext;
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
    // 1. Validate role: only Ketua_RT or Pengurus can register gates
    if (
      authContext.role !== UserRole.Ketua_RT &&
      authContext.role !== UserRole.Pengurus
    ) {
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
      authContext.tenantId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const gate = result.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
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
