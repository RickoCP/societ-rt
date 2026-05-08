/**
 * RegisterCameraUseCase — Registers a new CCTV camera within a tenant.
 *
 * Logic:
 * 1. Validate caller has Ketua_RT, Pengurus, or Security_Guard role
 * 2. Register camera via cctvRepository.registerCamera
 *    (RTSP URL encryption is handled at the infrastructure/repository layer)
 * 3. Enqueue audit log via AuditQueueProtocol (fire-and-forget)
 * 4. Return ok(camera)
 *
 * @see Requirements 34.1, 34.9, 34.10, 34.11
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok, authorizationError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { CctvRepository } from '../repositories/CctvRepository';
import type { CctvCamera, RegisterCctvCameraInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RegisterCameraUseCase {
  execute(params: {
    authContext: AuthContext;
    data: RegisterCctvCameraInput;
  }): Promise<DomainResult<CctvCamera>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RegisterCameraUseCaseImpl = ({
  cctvRepository,
  auditQueueProtocol,
}: {
  cctvRepository: CctvRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RegisterCameraUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Validate role: only Ketua_RT, Pengurus, or Security_Guard can register cameras
    if (
      authContext.role !== UserRole.Ketua_RT &&
      authContext.role !== UserRole.Pengurus &&
      authContext.role !== UserRole.Security_Guard
    ) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          'Only Ketua_RT, Pengurus, or Security_Guard can register cameras',
          { userMessage: 'Anda tidak memiliki izin untuk mendaftarkan kamera CCTV.' },
        ),
      );
    }

    // 2. Register camera via repository
    //    Note: RTSP URL encryption (AES-256) is handled at the infrastructure layer
    const result = await cctvRepository.registerCamera(
      authContext.tenantId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const camera = result.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'cctv_camera_registered',
        resourceType: 'cctv_camera',
        resourceId: camera.id,
        details: {
          name: camera.name,
          location: camera.location,
          resolution: camera.resolution,
          latitude: camera.latitude,
          longitude: camera.longitude,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(camera);
  },
});
