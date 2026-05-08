/**
 * CreateIncidentUseCase — Creates a new security incident within a tenant.
 *
 * Logic:
 * 1. Create incident via incidentRepository.createIncident (status: open)
 * 2. Enqueue notification to Security_Guard and Ketua_RT via
 *    NotificationQueueProtocol (fire-and-forget)
 * 3. Publish incident_created event to Realtime Bus channel
 *    `incident_updates:{tenantId}` (fire-and-forget)
 * 4. Enqueue audit log via AuditQueueProtocol (fire-and-forget)
 * 5. Return ok(incident)
 *
 * @see Requirements 32.1, 32.2, 32.5, 32.10
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
import type { Incident, CreateIncidentInput } from '../entities';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreateIncidentUseCase {
  execute(params: {
    authContext: AuthContext;
    data: CreateIncidentInput;
  }): Promise<DomainResult<Incident>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreateIncidentUseCaseImpl = ({
  incidentRepository,
  notificationQueueProtocol,
  realtimeBusProtocol,
  auditQueueProtocol,
}: {
  incidentRepository: IncidentRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  realtimeBusProtocol: RealtimeBusProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): CreateIncidentUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Create incident via repository (status defaults to 'open')
    const result = await incidentRepository.createIncident(
      authContext.tenantId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const incident = result.data;

    // 2. Enqueue notification to Security_Guard and Ketua_RT (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: authContext.tenantId,
        userId: '', // broadcast to Security_Guard and Ketua_RT
        type: 'incident_created',
        title: 'Insiden Baru Dilaporkan',
        body: `[${incident.severity.toUpperCase()}] ${incident.title} - ${incident.location}`,
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 3. Publish to Realtime Bus (fire-and-forget)
    const channel = `${EVENT_CHANNELS.INCIDENT_UPDATES}:${authContext.tenantId}`;
    realtimeBusProtocol
      .publish(channel, {
        id: incident.id,
        tenantId: authContext.tenantId,
        channel: EVENT_CHANNELS.INCIDENT_UPDATES,
        eventType: 'incident_created',
        payload: {
          incidentId: incident.id,
          title: incident.title,
          severity: incident.severity,
          category: incident.category,
          location: incident.location,
          status: incident.status,
          reportedBy: incident.reportedBy,
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
        actionType: 'incident_created',
        resourceType: 'incident',
        resourceId: incident.id,
        details: {
          title: incident.title,
          severity: incident.severity,
          category: incident.category,
          location: incident.location,
          status: incident.status,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(incident);
  },
});
