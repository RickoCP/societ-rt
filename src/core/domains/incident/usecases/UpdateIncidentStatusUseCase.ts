/**
 * UpdateIncidentStatusUseCase — Validates and updates an incident's status.
 *
 * Logic:
 * 1. Find incident by ID
 * 2. Validate status transition against allowed transitions map
 * 3. Update status via incidentRepository.updateStatus
 * 4. Record log entry via incidentRepository.addLog
 * 5. Enqueue notification to Security_Guard and Ketua_RT (fire-and-forget)
 * 6. Publish status update to Realtime Bus (fire-and-forget)
 * 7. Enqueue audit log (fire-and-forget)
 * 8. Return ok(updatedIncident)
 *
 * @see Requirements 32.2, 32.4, 32.5, 32.10
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
import type { Incident, IncidentStatus } from '../entities';
import { isValidIncidentTransition } from '../entities';
import { incidentNotFound, incidentInvalidTransition } from '../errors/incidentErrors';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UpdateIncidentStatusUseCase {
  execute(params: {
    authContext: AuthContext;
    incidentId: string;
    newStatus: IncidentStatus;
    notes?: string | null;
  }): Promise<DomainResult<Incident>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const UpdateIncidentStatusUseCaseImpl = ({
  incidentRepository,
  notificationQueueProtocol,
  realtimeBusProtocol,
  auditQueueProtocol,
}: {
  incidentRepository: IncidentRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  realtimeBusProtocol: RealtimeBusProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): UpdateIncidentStatusUseCase => ({
  execute: async ({ authContext, incidentId, newStatus, notes }) => {
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

    // 2. Validate status transition
    if (!isValidIncidentTransition(incident.status, newStatus)) {
      return fail(incidentInvalidTransition(incident.status, newStatus));
    }

    // 3. Update status via repository
    const updateResult = await incidentRepository.updateStatus(
      authContext.tenantId,
      incidentId,
      newStatus,
    );

    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    const updatedIncident = updateResult.data;

    // 4. Record log entry
    incidentRepository
      .addLog(authContext.tenantId, incidentId, {
        status: newStatus,
        notes: notes ?? null,
        actorId: authContext.userId,
      })
      .catch(() => {
        /* log recording must not block the response */
      });

    // 5. Enqueue notification to Security_Guard and Ketua_RT (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: authContext.tenantId,
        userId: '', // broadcast to Security_Guard and Ketua_RT
        type: 'incident_status_updated',
        title: 'Status Insiden Diperbarui',
        body: `Insiden "${updatedIncident.title}" diubah ke status ${newStatus}`,
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 6. Publish to Realtime Bus (fire-and-forget)
    const channel = `${EVENT_CHANNELS.INCIDENT_UPDATES}:${authContext.tenantId}`;
    realtimeBusProtocol
      .publish(channel, {
        id: updatedIncident.id,
        tenantId: authContext.tenantId,
        channel: EVENT_CHANNELS.INCIDENT_UPDATES,
        eventType: 'incident_status_updated',
        payload: {
          incidentId: updatedIncident.id,
          title: updatedIncident.title,
          previousStatus: incident.status,
          newStatus,
          severity: updatedIncident.severity,
          actorId: authContext.userId,
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
        actionType: 'incident_status_updated',
        resourceType: 'incident',
        resourceId: incidentId,
        details: {
          previousStatus: incident.status,
          newStatus,
          notes: notes ?? null,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 8. Return success
    return ok(updatedIncident);
  },
});
