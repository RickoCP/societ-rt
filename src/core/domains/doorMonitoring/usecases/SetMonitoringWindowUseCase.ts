/**
 * SetMonitoringWindowUseCase — Lets a resident configure the door-monitoring
 * window for their own household (usually night hours), and enable/disable it.
 *
 * Each resident can set a different window because everyone's routine differs.
 *
 * Authorization:
 *  - Warga / Ketua_RT may configure, but ONLY for a household they own
 *    (verified via HomeRepository.findByOwner, matching the existing
 *    Home_Owner ownership pattern).
 *
 * Logic:
 *  1. Role gate (Warga or Ketua_RT).
 *  2. Validate HH:mm window format.
 *  3. Verify the user owns the target household.
 *  4. Ensure a config row exists, then update the window.
 *  5. Audit (fire-and-forget).
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, authorizationError } from '@core/utils';
import type { HomeRepository } from '@core/domains/societHome/repositories/HomeRepository';
import type { DoorMonitoringRepository } from '../repositories/DoorMonitoringRepository';
import type { DoorSensorConfig, SetMonitoringWindowInput } from '../entities';
import { invalidMonitoringWindow } from '../errors/doorMonitoringErrors';
import { isValidTimeOfDay } from '../utils/monitoringWindow';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SetMonitoringWindowUseCase {
  execute(params: {
    authContext: AuthContext;
    input: SetMonitoringWindowInput;
  }): Promise<DomainResult<DoorSensorConfig>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const SetMonitoringWindowUseCaseImpl = ({
  doorMonitoringRepository,
  homeRepository,
  auditQueueProtocol,
}: {
  doorMonitoringRepository: DoorMonitoringRepository;
  homeRepository: HomeRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): SetMonitoringWindowUseCase => ({
  execute: async ({ authContext, input }) => {
    // 1. Role gate — only Home_Owner (Warga or Ketua_RT).
    if (
      authContext.role !== UserRole.Warga &&
      authContext.role !== UserRole.Ketua_RT
    ) {
      return fail(
        authorizationError(
          'DOOR_MONITORING_ACCESS_DENIED',
          'Only a Home_Owner can configure the monitoring window',
          {
            userMessage:
              'Anda tidak memiliki akses untuk mengatur jam monitoring.',
          },
        ),
      );
    }

    // 2. Validate window format.
    if (
      !isValidTimeOfDay(input.monitorStart) ||
      !isValidTimeOfDay(input.monitorEnd)
    ) {
      return fail(
        invalidMonitoringWindow(
          `start=${input.monitorStart} end=${input.monitorEnd}`,
        ),
      );
    }

    // 3. Verify the user owns the target household.
    const homesResult = await homeRepository.findByOwner(
      authContext.tenantId,
      authContext.userId,
    );
    if (!homesResult.success) {
      return fail(homesResult.error);
    }
    const ownsHousehold = homesResult.data.some(
      home => home.householdId === input.householdId,
    );
    if (!ownsHousehold) {
      return fail(
        authorizationError(
          'DOOR_MONITORING_ACCESS_DENIED',
          `User ${authContext.userId} does not own household ${input.householdId}`,
          {
            userMessage: 'Anda hanya dapat mengatur monitoring rumah Anda sendiri.',
          },
        ),
      );
    }

    // 4. Ensure a config row exists, then update the window.
    const ensured = await doorMonitoringRepository.ensureConfig(
      authContext.tenantId,
      input.householdId,
    );
    if (!ensured.success) {
      return fail(ensured.error);
    }

    const updateResult = await doorMonitoringRepository.updateWindow(
      authContext.tenantId,
      input.householdId,
      {
        monitorStart: input.monitorStart,
        monitorEnd: input.monitorEnd,
        enabled: input.enabled,
      },
    );
    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    // 5. Audit (fire-and-forget).
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'door_monitoring_window_updated',
        resourceType: 'door_sensor_config',
        resourceId: input.householdId,
        details: {
          monitorStart: input.monitorStart,
          monitorEnd: input.monitorEnd,
          enabled: input.enabled,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(updateResult.data);
  },
});
