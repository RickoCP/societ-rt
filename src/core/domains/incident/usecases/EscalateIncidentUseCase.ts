/**
 * EscalateIncidentUseCase — Escalates an incident by setting status to
 * 'escalated' and recording the escalatedAt timestamp.
 *
 * Logic:
 * 1. Find incident by ID
 * 2. Validate that escalation is a valid transition from current status
 * 3. Update status to 'escalated' via repository
 * 4. Record log entry with escalation notes
 * 5. Enqueue notification specifically to Ketua_RT (fire-and-forget)
 * 6. Publish escalation event to Realtime Bus (fire-and-forget)
 * 7. Enqueue audit log (fire-and-forget)
 * 8. Return ok(escalatedIncident)
 *
 * @see Requirements 32.2, 32.5, 32.8, 32.10
 */

import type {
  AuthContext,
  AuditQueueProtocol,
  NotificationQueueProtocol,
  RealtimeBusProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { IncidentRepository } from '../repositories/IncidentRepository';
import type { Incident } from '../entities';
import { isValidIncidentTransition } from '../entities';
import { incidentNotFound, incidentInvalidTransition } from '../errors/incidentErrors';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EscalateIncidentUseCase {
  execute(params: {
    authContext: AuthContext;
    incidentId: string;
    reason?: string | null;
  }): Promise<DomainResult<Incident>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const EscalateIncidentUseCaseImpl = ({
  incidentRepository,
  notificationQueueProtocol,
  realtimeBusProtocol,
  auditQueueProtocol,
}: {
  incidentRepository: IncidentRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  realtimeBusProtocol: RealtimeBusProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): EscalateIncidentUseCase => ({
  execute: async ({ authContext, incidentId, reason }) => {
    // 1. Find incident
    const findResult = await incidentRepository.findById(
      authContext.tenantId,
      incidentId,
    );

    if (!findResult.success) {
      return fail(findResult.error);
    }

    if (!findResult.data) {
      return fail(incidentNotFound(incidentId));
    }

    const incident = findResult.data;

    // 2. Validate that escalation is allowed from current status
    if (!isValidIncidentTransition(incident.status, 'escalated')) {
      return fail(incidentInvalidTransition(incident.status, 'escalated'));
    }

    // 3. Update status to 'escalated' (repository sets escalatedAt timestamp)
    const updateResult = await incidentRepository.updateStatus(
      authContext.tenantId,
      incidentId,
      'escalated',
    );

    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    const escalatedIncident = updateResult.data;

    // 4. Record log entry
    incidentRepository
      .addLog(authContext.tenantId, incidentId, {
        status: 'escalated',
        notes: reason ?? 'Incident escalated',
        actorId: authContext.userId,
      })
      .catch(() => {
        /* log recording must not block the response */
      });

    // 5. Enqueue notification to Ketua_RT (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: authContext.tenantId,
        userId: '', // broadcast to Ketua_RT
        type: 'incident_escalated',
        title: 'Insiden Dieskalasi',
        body: `Insiden "${escalatedIncident.title}" [${escalatedIncident.severity.toUpperCase()}] telah dieskalasi. ${reason ?? ''}`.trim(),
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 6. Publish to Realtime Bus (fire-and-forget)
    const channel = `${EVENT_CHANNELS.INCIDENT_UPDATES}:${authContext.tenantId}`;
    realtimeBusProtocol
      .publish(channel, {
        id: escalatedIncident.id,
        tenantId: authContext.tenantId,
        channel: EVENT_CHANNELS.INCIDENT_UPDATES,
        eventType: 'incident_escalated',
        payload: {
          incidentId: escalatedIncident.id,
          title: escalatedIncident.title,
          severity: escalatedIncident.severity,
          previousStatus: incident.status,
          newStatus: 'escalated',
          escalatedAt: escalatedIncident.escalatedAt?.toISOString() ?? null,
          reason: reason ?? null,
        },
        privacy: 'shared',
        timestamp: new Date(),
      })
      .catch(() => {
        /* realtime delivery must not block the response */
      });

    // 7. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'incident_escalated',
        resourceType: 'incident',
        resourceId: incidentId,
        details: {
          previousStatus: incident.status,
          newStatus: 'escalated',
          severity: escalatedIncident.severity,
          reason: reason ?? null,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 8. Return success
    return ok(escalatedIncident);
  },
});
