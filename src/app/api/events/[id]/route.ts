/**
 * GET /api/events/:id — Get event detail.
 * PATCH /api/events/:id — Update event.
 * DELETE /api/events/:id — Delete event.
 *
 * Only admin roles (Super_Admin, Ketua_RT, Pengurus) can edit/delete.
 *
 * @see Requirements 14.1, 14.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import { UserRole } from '@core/protocols';
import type { PrismaClient } from '@prisma/client';

const ADMIN_ROLES = [UserRole.Super_Admin, UserRole.Ketua_RT, UserRole.Pengurus];

// ---------------------------------------------------------------------------
// GET — Event detail
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const { id } = await params;

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
        { code: 'COMMON_NOT_FOUND', message: 'Event not found', correlationId },
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
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — Update event
// ---------------------------------------------------------------------------

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  location: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  if (!ADMIN_ROLES.includes(authContext.role as UserRole)) {
    return NextResponse.json(
      { code: 'AUTH_INSUFFICIENT_ROLE', message: 'You do not have permission.', correlationId },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = updateEventSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid input', correlationId },
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
        { code: 'COMMON_NOT_FOUND', message: 'Event not found', correlationId },
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
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — Delete event (cascade RSVPs)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  if (!ADMIN_ROLES.includes(authContext.role as UserRole)) {
    return NextResponse.json(
      { code: 'AUTH_INSUFFICIENT_ROLE', message: 'You do not have permission.', correlationId },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const event = await prisma.communityEvent.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!event) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Event not found', correlationId },
        { status: 404 },
      );
    }

    await prisma.eventRsvp.deleteMany({ where: { eventId: id } });
    await prisma.communityEvent.delete({ where: { id } });

    return NextResponse.json({ data: { id, deleted: true } });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
