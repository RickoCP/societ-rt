/**
 * POST /api/security/cctv/[id]/snapshot — Capture a snapshot from a CCTV camera.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 34.3, 34.9
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
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

export async function POST(
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

  // 2. Extract camera ID from route params
  const { id: cameraId } = await params;

  // 3. Parse and validate input
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

  // 4. Execute use case via DI
  // Note: In production, the imageBuffer would come from the RTSP stream.
  // For the BFF layer, we create a placeholder buffer since the actual
  // capture is handled by the use case + file storage protocol.
  const useCase = container.resolve<CaptureSnapshotUseCase>('captureSnapshotUseCase');
  const result = await useCase.execute({
    authContext,
    data: {
      cameraId,
      imageBuffer: Buffer.alloc(0), // Actual capture handled by infrastructure
      triggerType: validation.data.triggerType,
    },
  });

  // 5. Map result to safe response
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
}
