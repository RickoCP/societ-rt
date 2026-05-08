/**
 * HandleMotionDetectionUseCase — Handles a motion detection event from a CCTV camera.
 *
 * Logic:
 * 1. Update camera status to 'motion_detected' via cctvRepository
 * 2. Publish motion detection event to Realtime Bus channel
 *    `cctv_events:{tenantId}` (fire-and-forget)
 * 3. Enqueue notification to Security_Guard users (fire-and-forget)
 * 4. Enqueue audit log via AuditQueueProtocol (fire-and-forget)
 * 5. Return ok(camera) with updated status
 *
 * @see Requirements 34.4, 34.5, 34.8, 34.11
 */

import type {
  AuditQueueProtocol,
  NotificationQueueProtocol,
  RealtimeBusProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { CctvRepository } from '../repositories/CctvRepository';
import type { CctvCamera } from '../entities';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface HandleMotionDetectionInput {
  readonly tenantId: string;
  readonly cameraId: string;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface HandleMotionDetectionUseCase {
  execute(params: {
    data: HandleMotionDetectionInput;
  }): Promise<DomainResult<CctvCamera>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const HandleMotionDetectionUseCaseImpl = ({
  cctvRepository,
  realtimeBusProtocol,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  cctvRepository: CctvRepository;
  realtimeBusProtocol: RealtimeBusProtocol;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): HandleMotionDetectionUseCase => ({
  execute: async ({ data }) => {
    // 1. Update camera status to 'motion_detected'
    const result = await cctvRepository.updateStatus(
      data.tenantId,
      data.cameraId,
      'motion_detected',
    );

    if (!result.success) {
      return fail(result.error);
    }

    const camera = result.data;

    // 2. Publish motion detection event to Realtime Bus (fire-and-forget)
    const channel = `${EVENT_CHANNELS.CCTV_EVENTS}:${data.tenantId}`;
    realtimeBusProtocol
      .publish(channel, {
        id: `motion_${data.cameraId}_${Date.now()}`,
        tenantId: data.tenantId,
        channel: EVENT_CHANNELS.CCTV_EVENTS,
        eventType: 'motion_detection_alert',
        payload: {
          cameraId: data.cameraId,
          cameraName: camera.name,
          location: camera.location,
          latitude: camera.latitude,
          longitude: camera.longitude,
          detectedAt: data.timestamp.toISOString(),
        },
        privacy: 'shared',
        timestamp: data.timestamp,
      })
      .catch(() => {
        /* realtime delivery must not block the response */
      });

    // 3. Enqueue notification to Security_Guard users (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: data.tenantId,
        userId: '', // broadcast to Security_Guard role
        type: 'cctv_motion_detected',
        title: 'Deteksi Gerakan CCTV',
        body: `Gerakan terdeteksi pada kamera ${camera.name} di ${camera.location}`,
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: data.tenantId,
        actorUserId: 'system',
        actionType: 'cctv_motion_detected',
        resourceType: 'cctv_camera',
        resourceId: data.cameraId,
        details: {
          cameraName: camera.name,
          location: camera.location,
          detectedAt: data.timestamp.toISOString(),
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(camera);
  },
});
