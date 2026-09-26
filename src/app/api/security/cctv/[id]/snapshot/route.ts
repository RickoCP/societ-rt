/**
 * POST /api/security/cctv/[id]/snapshot — Capture a snapshot from a CCTV camera.
 *
 * Role-restricted to users with security:read permission.
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 34.3, 34.9
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 * @see Permission Mapping: POST /api/security/cctv/:id/snapshot → security:read
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { CaptureSnapshotUseCase } from '@core/domains/cctv/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const captureSnapshotSchema = z.object({
  triggerType: z.enum(['manual', 'motion', 'scheduled']),
});

// ---------------------------------------------------------------------------
// POST handler — Capture snapshot
// ---------------------------------------------------------------------------

const handleCaptureSnapshot: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract camera ID from route params
  const { id: cameraId } = await routeContext!.params!;

  // 2. Parse and validate input
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

  const validation = captureSnapshotSchema.safeParse(body);
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

  // 3. Execute use case via DI
  // Note: In production, the imageBuffer would come from the RTSP stream.
  // For the BFF layer, we create a placeholder buffer since the actual
  // capture is handled by the use case + file storage protocol.
  try {
    const useCase = container.resolve<CaptureSnapshotUseCase>('captureSnapshotUseCase');
    const result = await useCase.execute({
      authContext,
      data: {
        cameraId,
        imageBuffer: Buffer.alloc(0), // Actual capture handled by infrastructure
        triggerType: validation.data.triggerType,
      },
    });

    // 4. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const snapshot = result.data;

    return NextResponse.json(
      {
        data: {
          id: snapshot.id,
          cameraId: snapshot.cameraId,
          tenantId: snapshot.tenantId,
          fileUrl: snapshot.fileUrl,
          triggerType: snapshot.triggerType,
          timestamp: snapshot.timestamp.toISOString(),
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
 * POST /api/security/cctv/:id/snapshot — Capture a snapshot from a CCTV camera
 * Permission: security:read
 */
export const POST = withPermission(
  { permissions: ['security:read'] },
  handleCaptureSnapshot,
);
