/**
 * GET /api/security/gates/[id]/events — Get paginated event history for a gate.
 *
 * BFF pattern: withPermission → validate query → query repository → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 33.2, 33.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
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
// Response types
// ---------------------------------------------------------------------------

interface GateEventsResponse {
  data: Array<{
    id: string;
    gateId: string;
    state: string;
    duration: number;
    timestamp: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// GET handler — Gate event history (paginated)
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/security/gates/[id]/events — Get paginated event history for a gate.
 *
 * AuthorizationContext is guaranteed to have security:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param context - Route context containing params promise
 * @returns NextResponse with gate events or error
 */
const handleGetGateEvents: AuthorizedRouteHandler<GateEventsResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<GateEventsResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id: gateId } = await (context?.params ?? Promise.resolve({ id: '' }));

  // 1. Parse query parameters
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
      } as unknown as GateEventsResponse,
      { status: 400 },
    );
  }

  const { page, pageSize, from, to } = queryValidation.data;

  // 2. Query repository for gate events
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
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<GateEventsResponse>;
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
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/security/gates/[id]/events — Get paginated event history for a gate.
 *
 * Permission: security:read (view gate events)
 *
 * @see Permission Mapping: /api/security/gates/[id]/events GET → security:read
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetGateEvents,
);
