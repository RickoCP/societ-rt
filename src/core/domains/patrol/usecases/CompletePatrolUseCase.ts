/**
 * CompletePatrolUseCase — Marks a patrol session as completed.
 *
 * Logic:
 * 1. Complete session via patrolRepository.completeSession (sets completedAt)
 * 2. Publish patrol_completed event to Realtime Bus (fire-and-forget)
 * 3. Enqueue audit log (fire-and-forget)
 * 4. Return ok(session)
 *
 * @see Requirements 35.8, 35.10
 */

import type {
  AuditQueueProtocol,
  RealtimeBusProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { PatrolRepository } from '../repositories/PatrolRepository';
import type { PatrolSession, CompletePatrolSessionInput } from '../entities';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CompletePatrolUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    sessionId: string;
    data: CompletePatrolSessionInput;
  }): Promise<DomainResult<PatrolSession>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CompletePatrolUseCaseImpl = ({
  patrolRepository,
  realtimeBusProtocol,
  auditQueueProtocol,
}: {
  patrolRepository: PatrolRepository;
  realtimeBusProtocol: RealtimeBusProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): CompletePatrolUseCase => ({
  execute: async ({ authContext, sessionId, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Complete session via repository (sets completedAt, status = 'completed')
    const result = await patrolRepository.completeSession(
      tenantId,
      sessionId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const session = result.data;

    // 2. Publish to Realtime Bus (fire-and-forget)
    const channel = `${EVENT_CHANNELS.PATROL_EVENTS}:${tenantId}`;
    realtimeBusProtocol
      .publish(channel, {
        id: session.id,
        tenantId,
        channel: EVENT_CHANNELS.PATROL_EVENTS,
        eventType: 'patrol_completed',
        payload: {
          sessionId: session.id,
          routeId: session.routeId,
          guardId: session.guardId,
          checkpointsVisited: session.checkpointsVisited,
          distanceTraveled: session.distanceTraveled,
          completedAt: session.completedAt?.toISOString() ?? null,
          startedAt: session.startedAt.toISOString(),
        },
        privacy: 'shared',
        timestamp: new Date(),
      })
      .catch(() => {
        /* realtime delivery must not block the response */
      });

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'patrol_completed',
        resourceType: 'patrol_session',
        resourceId: session.id,
        details: {
          routeId: session.routeId,
          guardId: session.guardId,
          checkpointsVisited: session.checkpointsVisited,
          distanceTraveled: session.distanceTraveled,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(session);
  },
});
