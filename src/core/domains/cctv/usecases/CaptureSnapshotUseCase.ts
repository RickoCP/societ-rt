/**
 * CaptureSnapshotUseCase — Captures a still image from a CCTV camera stream.
 *
 * Logic:
 * 1. Validate caller has Security_Guard, Pengurus, or Ketua_RT role
 * 2. Verify camera exists and is online via cctvRepository
 * 3. Store snapshot file via FileStorageProtocol
 * 4. Associate snapshot with camera via cctvRepository.captureSnapshot
 * 5. Enqueue audit log via AuditQueueProtocol (fire-and-forget)
 * 6. Return ok(snapshot)
 *
 * @see Requirements 34.3, 34.9, 34.11
 */

import type {
  AuditQueueProtocol,
  FileStorageProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok, authorizationError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { CctvRepository } from '../repositories/CctvRepository';
import type { CctvSnapshot, CctvSnapshotTriggerType } from '../entities';
import { cctvCameraNotFound, cctvCameraOffline } from '../errors/cctvErrors';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { hasAllowedUserRole, getTenantId, getUserId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Security_Guard,
  UserRole.Pengurus,
  UserRole.Ketua_RT,
]);

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface CaptureSnapshotInput {
  readonly cameraId: string;
  readonly imageBuffer: Buffer;
  readonly triggerType: CctvSnapshotTriggerType;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CaptureSnapshotUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: CaptureSnapshotInput;
  }): Promise<DomainResult<CctvSnapshot>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CaptureSnapshotUseCaseImpl = ({
  cctvRepository,
  fileStorageProtocol,
  auditQueueProtocol,
}: {
  cctvRepository: CctvRepository;
  fileStorageProtocol: FileStorageProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): CaptureSnapshotUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Validate role: only Security_Guard, Pengurus, or Ketua_RT
    if (!hasAllowedUserRole(authContext, ALLOWED_ROLES)) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          'Only Security_Guard, Pengurus, or Ketua_RT can capture snapshots',
          { userMessage: 'Anda tidak memiliki izin untuk mengambil snapshot CCTV.' },
        ),
      );
    }

    // 2. Verify camera exists and is online
    const camerasResult = await cctvRepository.findByTenant(tenantId);
    if (!camerasResult.success) {
      return fail(camerasResult.error);
    }

    const camera = camerasResult.data.find(c => c.id === data.cameraId);
    if (!camera) {
      return fail(cctvCameraNotFound(data.cameraId));
    }

    if (camera.status === 'offline') {
      return fail(cctvCameraOffline(data.cameraId));
    }

    // 3. Store snapshot file via FileStorageProtocol
    const fileMetadata = await fileStorageProtocol.upload({
      buffer: data.imageBuffer,
      originalFilename: `snapshot_${data.cameraId}_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: data.imageBuffer.length,
      tenantId,
      domain: 'cctv',
    });

    // 4. Associate snapshot with camera via repository
    const snapshotResult = await cctvRepository.captureSnapshot(
      tenantId,
      data.cameraId,
      fileMetadata.key,
      data.triggerType,
    );

    if (!snapshotResult.success) {
      return fail(snapshotResult.error);
    }

    const snapshot = snapshotResult.data;

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'cctv_snapshot_captured',
        resourceType: 'cctv_snapshot',
        resourceId: snapshot.id,
        details: {
          cameraId: data.cameraId,
          triggerType: data.triggerType,
          fileKey: fileMetadata.key,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 6. Return success
    return ok(snapshot);
  },
});
