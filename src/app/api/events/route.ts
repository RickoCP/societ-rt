/**
 * POST /api/events — Create a new community event.
 * GET  /api/events — List events for the tenant.
 *
 * BFF pattern: withPermission → validate input → execute use case / query → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * Permission Mapping:
 * - GET /api/events → announcement:read (community events are viewable by all who can read announcements)
 * - POST /api/events → announcement:publish (only admins who can publish announcements can create events)
 *
 * @see Requirements 14.1, 14.2
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
import type { CreateEventUseCase } from '@core/domains/event/usecases';
import type { EventRepository } from '@core/domains/event/repositories/EventRepository';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  date: z.string().datetime({ message: 'Date must be a valid ISO datetime' }),
  time: z.string().min(1, 'Time is required'),
  location: z.string().min(1, 'Location is required'),
  maxRsvp: z.number().int().positive().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface EventResponse {
  data: {
    id: string;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    createdBy: string;
    createdAt: string;
  };
}

interface EventListResponse {
  data: Array<{
    id: string;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    createdBy: string;
    authorName: string;
    rsvpCount: number;
    createdAt: string;
  }>;
}

interface ErrorResponse {
  code: string;
  message?: string;
  fields?: Record<string, string>;
  correlationId: string;
}

type EventCreateResponse = EventResponse | ErrorResponse;
type EventListApiResponse = EventListResponse | ErrorResponse;

// ---------------------------------------------------------------------------
// POST handler — Create event
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/events — Create a new community event.
 *
 * AuthorizationContext is guaranteed to have announcement:publish permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with created event or error
 *
 * @see Permission Mapping: POST /api/events → announcement:publish
 */
const handleCreateEvent: AuthorizedRouteHandler<EventCreateResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<EventCreateResponse>> => {
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

  const validation = createEventSchema.safeParse(body);
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
  const useCase = container.resolve<CreateEventUseCase>('createEventUseCase');
  const result = await useCase.execute({
    authContext,
    data: {
      title: validation.data.title,
      description: validation.data.description,
      date: new Date(validation.data.date),
      time: validation.data.time,
      location: validation.data.location,
    },
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const event = result.data;

  return NextResponse.json(
    {
      data: {
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date.toISOString(),
        time: event.time,
        location: event.location,
        createdBy: event.createdBy,
        createdAt: event.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

// ---------------------------------------------------------------------------
// GET handler — List events
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/events — List events for the tenant.
 *
 * AuthorizationContext is guaranteed to have announcement:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with events list or error
 *
 * @see Permission Mapping: GET /api/events → announcement:read
 */
const handleListEvents: AuthorizedRouteHandler<EventListApiResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<EventListApiResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Query repository
  const eventRepository =
    container.resolve<EventRepository>('eventRepository');
  const result = await eventRepository.findByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // 2. Get RSVP counts for all events
  const prisma = container.resolve<PrismaClient>('prismaClient');
  const eventIds = result.data.map(e => e.id);
  let rsvpMap = new Map<string, number>();
  if (eventIds.length > 0) {
    try {
      const rsvpCounts = await prisma.eventRsvp.groupBy({
        by: ['eventId'],
        where: { eventId: { in: eventIds }, response: 'attending' },
        _count: { eventId: true },
      });
      rsvpMap = new Map(rsvpCounts.map(r => [r.eventId, r._count.eventId]));
    } catch { /* ignore if table doesn't exist */ }
  }

  // 3. Resolve author names
  const creatorIds = [...new Set(result.data.map(e => e.createdBy))];
  const users = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, name: true },
  });
  const userNameMap = new Map(users.map(u => [u.id, u.name]));

  return NextResponse.json(
    {
      data: result.data.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        date: e.date.toISOString(),
        time: e.time,
        location: e.location,
        createdBy: e.createdBy,
        authorName: userNameMap.get(e.createdBy) ?? 'Unknown',
        rsvpCount: rsvpMap.get(e.id) ?? 0,
        createdAt: e.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/events — List events for the tenant.
 *
 * Permission: announcement:read (community events are viewable by all who can read announcements)
 *
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: /api/events GET → announcement:read
 */
export const GET = withPermission(
  { permissions: ['announcement:read'] },
  handleListEvents,
);

/**
 * POST /api/events — Create a new community event.
 *
 * Permission: announcement:publish (only admins who can publish announcements can create events)
 *
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN roles.
 *
 * @see Permission Mapping: /api/events POST → announcement:publish
 */
export const POST = withPermission(
  { permissions: ['announcement:publish'] },
  handleCreateEvent,
);
