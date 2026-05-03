/**
 * CreatePatrolScheduleUseCase — Creates a new patrol schedule within a tenant.
 *
 * Logic:
 * 1. Create schedule via securityRepository.createSchedule
 * 2. Enqueue audit (action: 'patrol_schedule_created', fire-and-forget)
 * 3. Return ok(schedule)
 *
 * @see Requirements 12.1
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { SecurityRepository } from '../repositories/SecurityRepository';
import type { PatrolSchedule, CreatePatrolScheduleInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreatePatrolScheduleUseCase {
  execute(params: {
    authContext: AuthContext;
    data: CreatePatrolScheduleInput;
  }): Promise<DomainResult<PatrolSchedule>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreatePatrolScheduleUseCaseImpl = ({
  securityRepository,
  auditQueueProtocol,
}: {
  securityRepository: SecurityRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): CreatePatrolScheduleUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Create schedule via repository
    const result = await securityRepository.createSchedule(
      authContext.tenantId,
      authContext.userId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const schedule = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'patrol_schedule_created',
        resourceType: 'patrol_schedule',
        resourceId: schedule.id,
        details: {
          date: data.date.toISOString(),
          timeSlot: data.timeSlot,
          assignedUserIds: data.assignedUserIds,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(schedule);
  },
});
