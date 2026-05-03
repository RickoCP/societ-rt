/**
 * TriggerEmergencyAlertUseCase — Creates a new emergency alert within a tenant.
 *
 * Logic:
 * 1. Create alert via emergencyRepository.createAlert
 *    - If GPS coordinates are missing, set locationUnavailable = true
 * 2. Enqueue real-time notification to Ketua_RT, Pengurus, and
 *    Security_Guard via NotificationQueueProtocol (fire-and-forget)
 * 3. Enqueue audit (action: 'emergency_alert_created', fire-and-forget)
 * 4. Return ok(alert)
 *
 * @see Requirements 10.1, 10.2, 10.4, 10.5
 */

import type {
  AuthContext,
  AuditQueueProtocol,
  NotificationQueueProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { EmergencyRepository } from '../repositories/EmergencyRepository';
import type { EmergencyAlert, CreateEmergencyAlertInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface TriggerEmergencyAlertUseCase {
  execute(params: {
    authContext: AuthContext;
    data: CreateEmergencyAlertInput;
  }): Promise<DomainResult<EmergencyAlert>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const TriggerEmergencyAlertUseCaseImpl = ({
  emergencyRepository,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  emergencyRepository: EmergencyRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): TriggerEmergencyAlertUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Create alert via repository
    const result = await emergencyRepository.createAlert(
      authContext.tenantId,
      authContext.userId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const alert = result.data;

    // 2. Enqueue real-time notification to Ketua_RT, Pengurus, Security_Guard
    //    (fire-and-forget — notification must not block the response)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: authContext.tenantId,
        userId: '', // broadcast to Ketua_RT, Pengurus, Security_Guard
        type: 'emergency_alert',
        title: 'Emergency Alert',
        body: alert.locationUnavailable
          ? 'Emergency alert triggered (location unavailable)'
          : `Emergency alert triggered at ${String(alert.latitude)}, ${String(alert.longitude)}`,
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'emergency_alert_created',
        resourceType: 'emergency_alert',
        resourceId: alert.id,
        details: {
          latitude: alert.latitude,
          longitude: alert.longitude,
          locationUnavailable: alert.locationUnavailable,
          status: alert.status,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(alert);
  },
});
