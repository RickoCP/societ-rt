/**
 * POST /api/voting/[id]/vote — Cast a vote on a specific poll.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * Authorization:
 * - POST: vote:cast (cast a vote)
 *
 * @see Requirements 8.3, 8.4, 8.5
 * @see Requirements 2.1, 2.2, 2.3 — Route authorization migration
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
import type { CastVoteUseCase } from '@core/domains/voting/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const castVoteSchema = z.object({
  optionId: z.string().min(1, 'optionId is required'),
});

// ---------------------------------------------------------------------------
// POST handler — Cast vote
// ---------------------------------------------------------------------------

const handleCastVote: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const voteId = params?.id;

  if (!voteId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Vote ID is required',
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<void>;
  }

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
    ) as NextResponse<void>;
  }

  const validation = castVoteSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<void>;
  }

  // 2. Execute use case via DI
  const useCase = container.resolve<CastVoteUseCase>('castVoteUseCase');
  const result = await useCase.execute({
    authContext,
    voteId,
    optionId: validation.data.optionId,
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  return NextResponse.json(
    { data: { message: 'Vote cast successfully' } },
    { status: 200 },
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// Export route handler with permission wrapper
// ---------------------------------------------------------------------------

/**
 * POST /api/voting/[id]/vote — Cast a vote (requires vote:cast)
 */
export const POST = withPermission(
  { permissions: ['vote:cast'] },
  handleCastVote,
);
