/**
 * RecordPatrolAttendanceUseCase — Records a security guard's check-in
 * for a patrol schedule.
 *
 * Logic:
 * 1. Record attendance via securityRepository.recordAttendance
 * 2. Enqueue audit (action: 'patrol_attendance_recorded', fire-and-forget)
 * 3. Return ok(attendance)
 *
 * @see Requirements 12.2
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { SecurityRepository } from '../repositories/SecurityRepository';
import type { PatrolAttendance, RecordAttendanceInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RecordPatrolAttendanceUseCase {
  execute(params: {
    authContext: AuthContext;
    data: RecordAttendanceInput;
  }): Promise<DomainResult<PatrolAttendance>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RecordPatrolAttendanceUseCaseImpl = ({
  securityRepository,
  auditQueueProtocol,
}: {
  securityRepository: SecurityRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RecordPatrolAttendanceUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Record attendance via repository
    const result = await securityRepository.recordAttendance(
      authContext.tenantId,
      authContext.userId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const attendance = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'patrol_attendance_recorded',
        resourceType: 'patrol_attendance',
        resourceId: attendance.id,
        details: {
          scheduleId: data.scheduleId,
          checkInTimestamp: data.checkInTimestamp.toISOString(),
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(attendance);
  },
});
