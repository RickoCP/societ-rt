/**
 * GET /api/security/gates/[id]/events — Get paginated event history for a gate.
 *
 * BFF pattern: validate input → resolve auth context → query repository → return safe response.
 *
 * @see Requirements 33.2, 33.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GateRepository } from '@core/domains/gate/repositories/GateRepository';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const eventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ---------------------------------------------------------------------------
// GET handler — Gate event history (paginated)
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
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  const { id: gateId } = await params;

  // 2. Parse query parameters
  const { searchParams } = new URL(request.url);
  const queryValidation = eventsQuerySchema.safeParse({
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });

  if (!queryValidation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(queryValidation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  const { page, pageSize, from, to } = queryValidation.data;

  // 3. Query repository for gate events
  const gateRepository =
    container.resolve<GateRepository>('gateRepository');

  const result = await gateRepository.findEventsByGate(
    authContext.tenantId,
    gateId,
    page,
    pageSize,
    { from, to },
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const { data: events, total } = result.data;

  return NextResponse.json(
    {
      data: events.map(event => ({
        id: event.id,
        gateId: event.gateId,
        state: event.state,
        duration: event.duration,
        timestamp: event.timestamp.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
    { status: 200 },
  );
}
