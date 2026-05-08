/**
 * GET /api/security/cctv/[id]/stream — Get RTSP stream URL for a camera.
 *
 * Returns the decrypted RTSP URL for WebRTC proxy setup.
 * Only accessible by Security_Guard, Pengurus, or Ketua_RT.
 *
 * BFF pattern: resolve auth context → validate role → decrypt and return stream URL.
 *
 * @see Requirements 34.1, 34.9, 34.10
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import { UserRole } from '@core/protocols';
import type { CctvRepository } from '@core/domains/cctv/repositories/CctvRepository';

// ---------------------------------------------------------------------------
// Allowed roles for stream access
// ---------------------------------------------------------------------------

const STREAM_ALLOWED_ROLES = new Set<string>([
  UserRole.Security_Guard,
  UserRole.Pengurus,
  UserRole.Ketua_RT,
]);

// ---------------------------------------------------------------------------
// GET handler — Get stream URL
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  // 2. Validate role
  if (!STREAM_ALLOWED_ROLES.has(authContext.role)) {
    return NextResponse.json(
      {
        code: 'AUTH_INSUFFICIENT_ROLE',
        message: 'You do not have permission to access camera streams.',
        correlationId,
      },
      { status: 403 },
    );
  }

  // 3. Extract camera ID from route params
  const { id: cameraId } = await params;

  // 4. Find camera (repository returns decrypted RTSP URL)
  const cctvRepository = container.resolve<CctvRepository>('cctvRepository');
  const camerasResult = await cctvRepository.findByTenant(authContext.tenantId);

  if (!camerasResult.success) {
    return mapAppErrorToHttpResponse(camerasResult.error, correlationId);
  }

  const camera = camerasResult.data.find(c => c.id === cameraId);
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

  // 5. Return stream URL (decrypted RTSP URL for WebRTC proxy)
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
}
