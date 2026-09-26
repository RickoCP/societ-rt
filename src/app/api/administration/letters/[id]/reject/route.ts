/**
 * POST /api/administration/letters/[id]/reject — Reject a letter request.
 *
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 13.3
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler withPermission Migration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
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

/**
 * Handler for POST /api/administration/letters/[id]/reject
 * Rejects a letter request (admin action).
 *
 * Permission: admin:manage (reject letter)
 */
const handleRejectLetterRequest: AuthorizedRouteHandler = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await routeContext!.params!;

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

  // 2. Execute use case via DI
  const useCase = container.resolve<RejectLetterRequestUseCase>(
    'rejectLetterRequestUseCase',
  );
  const result = await useCase.execute({
    authContext,
    requestId: id,
    data: validation.data,
  });

  // 3. Map result to safe response
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
};

// ---------------------------------------------------------------------------
// Exports with withPermission wrapper
// ---------------------------------------------------------------------------

/**
 * POST /api/administration/letters/[id]/reject
 * Permission: admin:manage — Reject a letter request
 */
export const POST = withPermission(
  { permissions: ['admin:manage'] },
  handleRejectLetterRequest,
);
