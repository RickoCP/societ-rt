/**
 * BroadcastNeighborhoodAlertUseCase — Broadcasts a security alert to all
 * Warga within the tenant.
 *
 * Logic:
 * 1. Validate caller has Ketua_RT or Security_Guard role
 * 2. Persist alert via securityCenterRepository.broadcastAlert
 * 3. Dispatch notification to all Warga via NotificationQueueProtocol (within 5s)
 * 4. Publish event to Realtime Bus for live dashboard updates
 * 5. Enqueue audit log (fire-and-forget)
 * 6. Return ok(alert)
 *
 * @see Requirements 31.4, 31.5, 31.9, 31.10
 */

import type {
  AuditQueueProtocol,
  NotificationQueueProtocol,
  RealtimeBusProtocol,
} from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, authorizationError } from '@core/utils';
import type { NeighborhoodAlert, CreateNeighborhoodAlertInput } from '../entities';
import type { SecurityCenterRepository } from '../repositories/SecurityCenterRepository';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId, hasAllowedUserRole } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BROADCAST_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Ketua_RT,
  UserRole.Security_Guard,
]);

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface BroadcastNeighborhoodAlertUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    input: CreateNeighborhoodAlertInput;
  }): Promise<DomainResult<NeighborhoodAlert>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const BroadcastNeighborhoodAlertUseCaseImpl = ({
  securityCenterRepository,
  notificationQueueProtocol,
  realtimeBusProtocol,
  auditQueueProtocol,
}: {
  securityCenterRepository: SecurityCenterRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  realtimeBusProtocol: RealtimeBusProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): BroadcastNeighborhoodAlertUseCase => ({
  execute: async ({ authContext, input }) => {
    // 1. Validate role — only Ketua_RT and Security_Guard can broadcast
    if (!hasAllowedUserRole(authContext, BROADCAST_ROLES)) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          `User role is not allowed to broadcast neighborhood alerts`,
        ),
      );
    }

    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 2. Persist alert
    const result = await securityCenterRepository.broadcastAlert(
      tenantId,
      userId,
      input,
    );

    if (!result.success) {
      return result;
    }

    const alert = result.data;

    // 3. Dispatch notification to all Warga (fire-and-forget, must complete within 5s)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId,
        userId: '', // broadcast to all Warga
        type: 'neighborhood_alert',
        title: `Security Alert: ${alert.severity.toUpperCase()}`,
        body: alert.message,
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 4. Publish to Realtime Bus for live dashboard updates
    realtimeBusProtocol
      .publish(`tenant:${tenantId}:security`, {
        id: alert.id,
        tenantId,
        channel: `tenant:${tenantId}:security`,
        eventType: 'neighborhood_alert',
        payload: {
          alertId: alert.id,
          severity: alert.severity,
          message: alert.message,
          createdBy: alert.createdBy,
        },
        privacy: 'shared' as const,
        timestamp: alert.createdAt,
      })
      .catch(() => {
        /* realtime bus must not block the response */
      });

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'neighborhood_alert_broadcast',
        resourceType: 'neighborhood_alert',
        resourceId: alert.id,
        details: {
          severity: alert.severity,
          message: alert.message,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 6. Return success
    return result;
  },
});
