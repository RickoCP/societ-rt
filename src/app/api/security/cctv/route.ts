/**
 * GET  /api/security/cctv — List CCTV cameras for the tenant.
 * POST /api/security/cctv — Register a new CCTV camera.
 *
 * Role-restricted to users with security:read/security:manage permission.
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 34.1, 34.3, 34.9
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 * @see Permission Mapping: GET /api/security/cctv → security:read
 * @see Permission Mapping: POST /api/security/cctv → security:manage
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { RegisterCameraUseCase } from '@core/domains/cctv/usecases';
import type { CctvRepository } from '@core/domains/cctv/repositories/CctvRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const registerCameraSchema = z.object({
  name: z.string().min(1).max(200),
  rtspUrl: z.string().min(1).max(500),
  location: z.string().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  resolution: z.string().min(1).max(50),
});

// ---------------------------------------------------------------------------
// GET handler — List cameras
// ---------------------------------------------------------------------------

const handleListCameras: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  try {
    // Query repository for cameras
    const cctvRepository = container.resolve<CctvRepository>('cctvRepository');
    const result = await cctvRepository.findByTenant(authContext.tenantId);

    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const cameras = result.data;

    return NextResponse.json(
      {
        data: cameras.map((camera) => ({
          id: camera.id,
          tenantId: camera.tenantId,
          name: camera.name,
          location: camera.location,
          latitude: camera.latitude,
          longitude: camera.longitude,
          resolution: camera.resolution,
          status: camera.status,
          lastOnline: camera.lastOnline.toISOString(),
          createdAt: camera.createdAt.toISOString(),
        })),
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

// ---------------------------------------------------------------------------
// POST handler — Register camera
// ---------------------------------------------------------------------------

const handleRegisterCamera: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    );
  }

  const validation = registerCameraSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  // 2. Execute use case via DI
  try {
    const useCase = container.resolve<RegisterCameraUseCase>('registerCameraUseCase');
    const result = await useCase.execute({
      authContext,
      data: validation.data,
    });

    // 3. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const camera = result.data;

    return NextResponse.json(
      {
        data: {
          id: camera.id,
          tenantId: camera.tenantId,
          name: camera.name,
          location: camera.location,
          latitude: camera.latitude,
          longitude: camera.longitude,
          resolution: camera.resolution,
          status: camera.status,
          lastOnline: camera.lastOnline.toISOString(),
          createdAt: camera.createdAt.toISOString(),
        },
      },
      { status: 201 },
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
 * GET /api/security/cctv — List CCTV cameras for the tenant
 * Permission: security:read
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleListCameras,
);

/**
 * POST /api/security/cctv — Register a new CCTV camera
 * Permission: security:manage
 */
export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleRegisterCamera,
);
