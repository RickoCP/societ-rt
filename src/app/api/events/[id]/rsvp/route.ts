/**
 * POST /api/events/[id]/rsvp — Submit an RSVP for a community event.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * Permission Mapping:
 * - POST /api/events/[id]/rsvp → announcement:read (any user who can read events can RSVP)
 *
 * @see Requirements 14.3, 14.4
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
import type { SubmitRsvpUseCase } from '@core/domains/event/usecases';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const submitRsvpSchema = z.object({
  response: z.enum(['attending', 'not_attending']),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface RsvpResponse {
  data: {
    id: string;
    eventId: string;
    userId: string;
    response: string;
    createdAt: string;
  };
}

interface ErrorResponse {
  code: string;
  message?: string;
  fields?: Record<string, string>;
  correlationId: string;
}

type RsvpApiResponse = RsvpResponse | ErrorResponse;

// ---------------------------------------------------------------------------
// POST handler — Submit RSVP
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/events/[id]/rsvp — Submit an RSVP for a community event.
 *
 * AuthorizationContext is guaranteed to have announcement:read permission
 * after withPermission validation.
 *
 * Any authenticated user who can read events can submit an RSVP.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param context - Route context with params
 * @returns NextResponse with RSVP or error
 *
 * @see Permission Mapping: POST /api/events/[id]/rsvp → announcement:read
 */
const handleSubmitRsvp: AuthorizedRouteHandler<RsvpApiResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<RsvpApiResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await context?.params ?? { id: '' };

  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Event ID is required',
        correlationId,
      },
      { status: 400 },
    );
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
    );
  }

  const validation = submitRsvpSchema.safeParse(body);
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

  // 2. Check quota if attending
  if (validation.data.response === 'attending') {
    try {
      const prisma = container.resolve<PrismaClient>('prismaClient');
      const event = await prisma.communityEvent.findFirst({
        where: { id, tenantId: authContext.tenantId },
        select: { maxRsvp: true },
      });

      if (event?.maxRsvp) {
        const attendingCount = await prisma.eventRsvp.count({
          where: { eventId: id, response: 'attending', userId: { not: authContext.userId } },
        });
        if (attendingCount >= event.maxRsvp) {
          return NextResponse.json(
            { code: 'EVENT_RSVP_FULL', message: 'Event has reached maximum capacity.', correlationId },
            { status: 409 },
          );
        }
      }
    } catch {
      // If max_rsvp column doesn't exist yet or query fails, skip quota check
    }
  }

  // 3. Execute use case via DI
  const useCase = container.resolve<SubmitRsvpUseCase>('submitRsvpUseCase');
  const result = await useCase.execute({
    authContext,
    eventId: id,
    response: validation.data.response,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const rsvp = result.data;

  return NextResponse.json(
    {
      data: {
        id: rsvp.id,
        eventId: rsvp.eventId,
        userId: rsvp.userId,
        response: rsvp.response,
        createdAt: rsvp.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handler with Permission Check
// ---------------------------------------------------------------------------

/**
 * POST /api/events/[id]/rsvp — Submit an RSVP for a community event.
 *
 * Permission: announcement:read (any user who can read events can RSVP)
 *
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: POST /api/events/[id]/rsvp → announcement:read
 */
export const POST = withPermission(
  { permissions: ['announcement:read'] },
  handleSubmitRsvp,
);
