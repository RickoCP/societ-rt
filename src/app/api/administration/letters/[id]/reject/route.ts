/**
 * POST /api/administration/letters/[id]/reject — Reject a letter request.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 13.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RejectLetterRequestUseCase } from '@core/domains/administration/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const rejectSchema = z.object({
  rejectionReason: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST handler — Reject letter request
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await params;

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

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

  const validation = rejectSchema.safeParse(body);
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
  const useCase = container.resolve<RejectLetterRequestUseCase>(
    'rejectLetterRequestUseCase',
  );
  const result = await useCase.execute({
    authContext,
    requestId: id,
    data: validation.data,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const letterRequest = result.data;

  return NextResponse.json(
    {
      data: {
        id: letterRequest.id,
        userId: letterRequest.userId,
        letterType: letterRequest.letterType,
        purpose: letterRequest.purpose,
        status: letterRequest.status,
        rejectionReason: letterRequest.rejectionReason,
        decidedBy: letterRequest.decidedBy,
        decidedAt: letterRequest.decidedAt?.toISOString() ?? null,
        createdAt: letterRequest.createdAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
