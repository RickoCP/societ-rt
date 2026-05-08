/**
 * StartPatrolUseCase — Starts a new patrol session for a security guard.
 *
 * Logic:
 * 1. Check no active session exists for the guard (PATROL_ALREADY_ACTIVE)
 * 2. Create session via patrolRepository.startSession
 * 3. Publish patrol_started event to Realtime Bus (fire-and-forget)
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(session)
 *
 * @see Requirements 35.3, 35.10
 */

import type {
  AuthContext,
  AuditQueueProtocol,
  RealtimeBusProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { PatrolRepository } from '../repositories/PatrolRepository';
import type { PatrolSession, StartPatrolSessionInput } from '../entities';
import { patrolAlreadyActive } from '../errors/patrolErrors';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface StartPatrolUseCase {
  execute(params: {
    authContext: AuthContext;
    data: StartPatrolSessionInput;
  }): Promise<DomainResult<PatrolSession>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const StartPatrolUseCaseImpl = ({
  patrolRepository,
  realtimeBusProtocol,
  auditQueueProtocol,
}: {
  patrolRepository: PatrolRepository;
  realtimeBusProtocol: RealtimeBusProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): StartPatrolUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Check no active session for this guard
    const activeResult = await patrolRepository.findActiveSessions(
      authContext.tenantId,
    );

    if (!activeResult.success) {
      return fail(activeResult.error);
    }

    const guardHasActive = activeResult.data.some(
      session => session.guardId === authContext.userId,
    );

    if (guardHasActive) {
      return fail(patrolAlreadyActive(authContext.userId));
    }

    // 2. Create session via repository
    const result = await patrolRepository.startSession(
      authContext.tenantId,
      authContext.userId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const session = result.data;

    // 3. Publish to Realtime Bus (fire-and-forget)
    const channel = `${EVENT_CHANNELS.PATROL_EVENTS}:${authContext.tenantId}`;
    realtimeBusProtocol
      .publish(channel, {
        id: session.id,
        tenantId: authContext.tenantId,
        channel: EVENT_CHANNELS.PATROL_EVENTS,
        eventType: 'patrol_started',
        payload: {
          sessionId: session.id,
          routeId: session.routeId,
          guardId: session.guardId,
          startedAt: session.startedAt.toISOString(),
        },
        privacy: 'shared',
        timestamp: new Date(),
      })
      .catch(() => {
        /* realtime delivery must not block the response */
      });

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'patrol_started',
        resourceType: 'patrol_session',
        resourceId: session.id,
        details: {
          routeId: session.routeId,
          guardId: session.guardId,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(session);
  },
});
