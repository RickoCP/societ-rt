/**
 * GET /api/events/:id — Get event detail.
 * PATCH /api/events/:id — Update event.
 * DELETE /api/events/:id — Delete event.
 *
 * BFF pattern: withPermission → validate input → execute business logic → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * Permission Mapping:
 * - GET /api/events/:id → announcement:read (community events are viewable by all who can read announcements)
 * - PATCH /api/events/:id → announcement:publish (only admins can update events)
 * - DELETE /api/events/:id → announcement:publish (only admins or creator can delete events)
 *
 * @see Requirements 14.1, 14.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  location: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface EventDetailResponse {
  data: {
    id: string;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    maxRsvp: number | null;
    createdBy: string;
    rsvpCount: number;
    createdAt: string;
    myRsvpStatus: string | null;
    attendees: Array<{
      userName: string;
      response: string;
      respondedAt: string;
    }>;
  };
}

interface EventUpdateResponse {
  data: {
    id: string;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
  };
}

interface EventDeleteResponse {
  data: {
    id: string;
    deleted: boolean;
  };
}

// ---------------------------------------------------------------------------
// GET — Event detail
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/events/:id — Get event detail.
 *
 * AuthorizationContext is guaranteed to have announcement:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param context - Route context with params
 * @returns NextResponse with event detail or error
 *
 * @see Permission Mapping: GET /api/events/:id → announcement:read
 */
const handleGetEvent: AuthorizedRouteHandler<EventDetailResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<EventDetailResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await context?.params ?? { id: '' };

  if (!id) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Event ID is required', correlationId } as unknown as EventDetailResponse,
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');
    const event = await prisma.communityEvent.findFirst({
      where: { id, tenantId: authContext.tenantId },
      include: {
        _count: { select: { rsvps: true } },
        rsvps: {
          select: {
            userId: true,
            response: true,
            createdAt: true,
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Event not found', correlationId } as unknown as EventDetailResponse,
        { status: 404 },
      );
    }

    // Get user names for attendees
    const userIds = event.rsvps.map(r => r.userId);
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u.name]));

    // Check if current user already RSVP'd
    const myRsvp = event.rsvps.find(r => r.userId === authContext.userId);

    return NextResponse.json({
      data: {
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date.toISOString(),
        time: event.time,
        location: event.location,
        maxRsvp: event.maxRsvp,
        createdBy: event.createdBy,
        rsvpCount: event._count.rsvps,
        createdAt: event.createdAt.toISOString(),
        myRsvpStatus: myRsvp?.response ?? null,
        attendees: event.rsvps.map(r => ({
          userName: userMap.get(r.userId) ?? 'Unknown',
          response: r.response,
          respondedAt: r.createdAt.toISOString(),
        })),
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId } as unknown as EventDetailResponse,
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// PATCH — Update event
// ---------------------------------------------------------------------------

/**
 * Handle PATCH /api/events/:id — Update event.
 *
 * AuthorizationContext is guaranteed to have announcement:publish permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param context - Route context with params
 * @returns NextResponse with updated event or error
 *
 * @see Permission Mapping: PATCH /api/events/:id → announcement:publish
 */
const handleUpdateEvent: AuthorizedRouteHandler<EventUpdateResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<EventUpdateResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await context?.params ?? { id: '' };

  if (!id) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Event ID is required', correlationId } as unknown as EventUpdateResponse,
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId } as unknown as EventUpdateResponse,
      { status: 400 },
    );
  }

  const validation = updateEventSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid input', correlationId } as unknown as EventUpdateResponse,
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const event = await prisma.communityEvent.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!event) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Event not found', correlationId } as unknown as EventUpdateResponse,
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (validation.data.title) updateData.title = validation.data.title;
    if (validation.data.description) updateData.description = validation.data.description;
    if (validation.data.date) updateData.date = new Date(validation.data.date);
    if (validation.data.time) updateData.time = validation.data.time;
    if (validation.data.location) updateData.location = validation.data.location;

    const updated = await prisma.communityEvent.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        date: updated.date.toISOString(),
        time: updated.time,
        location: updated.location,
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId } as unknown as EventUpdateResponse,
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// DELETE — Delete event (cascade RSVPs)
// ---------------------------------------------------------------------------

/**
 * Handle DELETE /api/events/:id — Delete event.
 *
 * AuthorizationContext is guaranteed to have announcement:publish permission
 * after withPermission validation.
 *
 * Additional authorization: only the event creator can delete their own events.
 * This is enforced at the handler level after the permission check.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param context - Route context with params
 * @returns NextResponse with deletion confirmation or error
 *
 * @see Permission Mapping: DELETE /api/events/:id → announcement:publish
 */
const handleDeleteEvent: AuthorizedRouteHandler<EventDeleteResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<EventDeleteResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await context?.params ?? { id: '' };

  if (!id) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Event ID is required', correlationId } as unknown as EventDeleteResponse,
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const event = await prisma.communityEvent.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!event) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Event not found', correlationId } as unknown as EventDeleteResponse,
        { status: 404 },
      );
    }

    // Additional authorization: only the creator can delete
    // (withPermission already ensures user has announcement:publish)
    const isCreator = event.createdBy === authContext.userId;

    if (!isCreator) {
      return NextResponse.json(
        { code: 'AUTH_INSUFFICIENT_PERMISSION', message: 'Only the event creator can delete this event.', correlationId } as unknown as EventDeleteResponse,
        { status: 403 },
      );
    }

    await prisma.eventRsvp.deleteMany({ where: { eventId: id } });
    await prisma.communityEvent.delete({ where: { id } });

    return NextResponse.json({ data: { id, deleted: true } });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId } as unknown as EventDeleteResponse,
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/events/:id — Get event detail.
 *
 * Permission: announcement:read (community events are viewable by all who can read announcements)
 *
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: GET /api/events/:id → announcement:read
 */
export const GET = withPermission(
  { permissions: ['announcement:read'] },
  handleGetEvent,
);

/**
 * PATCH /api/events/:id — Update event.
 *
 * Permission: announcement:publish (only admins who can publish announcements can update events)
 *
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN roles.
 *
 * @see Permission Mapping: PATCH /api/events/:id → announcement:publish
 */
export const PATCH = withPermission(
  { permissions: ['announcement:publish'] },
  handleUpdateEvent,
);

/**
 * DELETE /api/events/:id — Delete event.
 *
 * Permission: announcement:publish (only admins who can publish announcements can delete events)
 *
 * Additional check: only the event creator can delete their own events.
 *
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN roles.
 *
 * @see Permission Mapping: DELETE /api/events/:id → announcement:publish
 */
export const DELETE = withPermission(
  { permissions: ['announcement:publish'] },
  handleDeleteEvent,
);
