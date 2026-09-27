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

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { SecurityRepository } from '../repositories/SecurityRepository';
import type { PatrolSchedule, CreatePatrolScheduleInput } from '../entities';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreatePatrolScheduleUseCase {
  execute(params: {
    authContext: AuthContextCompat;
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
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Create schedule via repository
    const result = await securityRepository.createSchedule(
      tenantId,
      userId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const schedule = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
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
