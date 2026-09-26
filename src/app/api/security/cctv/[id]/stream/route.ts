/**
 * GET /api/security/cctv/[id]/stream — Get RTSP stream URL for a camera.
 *
 * Returns the decrypted RTSP URL for WebRTC proxy setup.
 * Role-restricted to users with security:read permission.
 *
 * BFF pattern: withPermission wrapper → validate role → decrypt and return stream URL.
 *
 * @see Requirements 34.1, 34.9, 34.10
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 * @see Permission Mapping: GET /api/security/cctv/:id/stream → security:read
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { CctvRepository } from '@core/domains/cctv/repositories/CctvRepository';

// ---------------------------------------------------------------------------
// GET handler — Get stream URL
// ---------------------------------------------------------------------------

const handleGetStreamUrl: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract camera ID from route params
  const { id: cameraId } = await routeContext!.params!;

  // 2. Find camera (repository returns decrypted RTSP URL)
  try {
    const cctvRepository = container.resolve<CctvRepository>('cctvRepository');
    const camerasResult = await cctvRepository.findByTenant(authContext.tenantId);

    if (!camerasResult.success) {
      return mapAppErrorToHttpResponse(camerasResult.error, correlationId);
    }

    const camera = camerasResult.data.find((c) => c.id === cameraId);
    if (!camera) {
      return NextResponse.json(
        {
          code: 'CCTV_CAMERA_NOT_FOUND',
          message: 'The requested resource was not found.',
          correlationId,
        },
        { status: 404 },
      );
    }

    if (camera.status === 'offline') {
      return NextResponse.json(
        {
          code: 'CCTV_STREAM_UNAVAILABLE',
          message: 'Camera is currently offline.',
          correlationId,
        },
        { status: 409 },
      );
    }

    // 3. Return stream URL (decrypted RTSP URL for WebRTC proxy)
    return NextResponse.json(
      {
        data: {
          cameraId: camera.id,
          name: camera.name,
          rtspUrl: camera.rtspUrl,
          status: camera.status,
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Internal server error',
        correlationId,
      },
      { status: 500 },
    );
  }
};

/**
 * GET /api/security/cctv/:id/stream — Get RTSP stream URL for a camera
 * Permission: security:read
 *
 * Note: The legacy role-based check (STREAM_ALLOWED_ROLES) has been replaced
 * with permission-based authorization. Users with security:read permission
 * (Security_Guard, Pengurus, Ketua_RT, etc.) can access stream URLs.
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetStreamUrl,
);
