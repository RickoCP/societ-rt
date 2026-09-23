/**
 * POST /api/events — Create a new community event.
 * GET  /api/events — List events for the tenant.
 *
 * BFF pattern: validate input → resolve auth context → execute use case / query → return safe response.
 *
 * @see Requirements 14.1, 14.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { CreateEventUseCase } from '@core/domains/event/usecases';
import type { EventRepository } from '@core/domains/event/repositories/EventRepository';
import type { PrismaClient } from '@/generated/prisma/client';

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
// POST handler — Create event
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  // 3. Execute use case via DI
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

  // 4. Map result to safe response
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
}

// ---------------------------------------------------------------------------
// GET handler — List events
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
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

  // 2. Query repository
  const eventRepository =
    container.resolve<EventRepository>('eventRepository');
  const result = await eventRepository.findByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // Get RSVP counts for all events
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

  // Resolve author names
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
}
