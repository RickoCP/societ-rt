/**
 * DetectPatrolDeviationUseCase — Detects if a guard has deviated from
 * the patrol route and notifies Ketua_RT.
 *
 * Logic:
 * 1. Check if guard hasn't visited the next expected checkpoint within
 *    the expected time window
 * 2. If deviation detected, send notification to Ketua_RT via
 *    NotificationQueueProtocol
 * 3. Enqueue audit log (fire-and-forget)
 * 4. Return ok with deviation status
 *
 * @see Requirements 35.6, 35.10
 */

import type {
  AuthContext,
  NotificationQueueProtocol,
  AuditQueueProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok } from '@core/utils';
import type { PatrolRepository } from '../repositories/PatrolRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectPatrolDeviationParams {
  sessionId: string;
  guardId: string;
  /** Guard's current GPS latitude. */
  currentLatitude: number;
  /** Guard's current GPS longitude. */
  currentLongitude: number;
  /** Minutes since last checkpoint visit. */
  minutesSinceLastCheckpoint: number;
  /** Expected maximum minutes between checkpoints. */
  expectedMaxMinutes: number;
}

export interface PatrolDeviationResult {
  readonly deviationDetected: boolean;
  readonly sessionId: string;
  readonly guardId: string;
  readonly minutesSinceLastCheckpoint: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface DetectPatrolDeviationUseCase {
  execute(params: {
    authContext: AuthContext;
    data: DetectPatrolDeviationParams;
  }): Promise<DomainResult<PatrolDeviationResult>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const DetectPatrolDeviationUseCaseImpl = ({
  patrolRepository: _patrolRepository,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  patrolRepository: PatrolRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): DetectPatrolDeviationUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Determine if deviation has occurred
    const deviationDetected =
      data.minutesSinceLastCheckpoint > data.expectedMaxMinutes;

    const result: PatrolDeviationResult = {
      deviationDetected,
      sessionId: data.sessionId,
      guardId: data.guardId,
      minutesSinceLastCheckpoint: data.minutesSinceLastCheckpoint,
    };

    if (!deviationDetected) {
      return ok(result);
    }

    // 2. Deviation detected — notify Ketua_RT (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: authContext.tenantId,
        userId: '', // broadcast to Ketua_RT
        type: 'patrol_deviation_detected',
        title: 'Deviasi Patroli Terdeteksi',
        body: `Petugas keamanan belum mengunjungi checkpoint berikutnya selama ${data.minutesSinceLastCheckpoint} menit.`,
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
        actionType: 'patrol_deviation_detected',
        resourceType: 'patrol_session',
        resourceId: data.sessionId,
        details: {
          guardId: data.guardId,
          currentLatitude: data.currentLatitude,
          currentLongitude: data.currentLongitude,
          minutesSinceLastCheckpoint: data.minutesSinceLastCheckpoint,
          expectedMaxMinutes: data.expectedMaxMinutes,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(result);
  },
});
