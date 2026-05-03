/**
 * GET /api/voting/[id]/tally — Get the aggregated tally for a vote.
 *
 * BFF pattern: resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 8.6, 8.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetVoteTallyUseCase } from '@core/domains/voting/usecases';

// ---------------------------------------------------------------------------
// GET handler — Get vote tally
// ---------------------------------------------------------------------------

export async function GET(
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

  // 2. Execute use case via DI
  const useCase = container.resolve<GetVoteTallyUseCase>(
    'getVoteTallyUseCase',
  );
  const result = await useCase.execute({
    authContext,
    voteId: id,
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const tally = result.data;

  return NextResponse.json(
    {
      data: {
        voteId: tally.voteId,
        totalVotes: tally.totalVotes,
        options: tally.options.map((opt) => ({
          optionId: opt.optionId,
          label: opt.label,
          voteCount: opt.voteCount,
        })),
      },
    },
    { status: 200 },
  );
}
