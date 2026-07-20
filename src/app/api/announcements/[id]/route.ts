/**
 * PATCH /api/announcements/:id — Update an announcement.
 * DELETE /api/announcements/:id — Delete an announcement.
 *
 * Only Super_Admin, Ketua_RT, or the creator can edit/delete.
 *
 * @see Requirements 9.1, 9.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import { UserRole } from '@core/protocols';
import type { PrismaClient } from '@prisma/client';

const EDIT_DELETE_ROLES: UserRole[] = [UserRole.Super_Admin, UserRole.Ketua_RT];

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  category: z.enum(['umum', 'keamanan', 'keuangan', 'kegiatan', 'darurat']).optional(),
});

// ---------------------------------------------------------------------------
// PATCH — Update announcement
// ---------------------------------------------------------------------------

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

  const validation = updateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid input', correlationId },
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const announcement = await prisma.announcement.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!announcement) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Announcement not found', correlationId },
        { status: 404 },
      );
    }

    // Authorization: only Super_Admin, Ketua_RT, or the creator can edit
    const isAdminRole = EDIT_DELETE_ROLES.includes(authContext.role as UserRole);
    const isCreator = announcement.createdBy === authContext.userId;

    if (!isAdminRole && !isCreator) {
      return NextResponse.json(
        { code: 'AUTH_INSUFFICIENT_ROLE', message: 'You do not have permission.', correlationId },
        { status: 403 },
      );
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        title: updated.title,
        content: updated.content,
        category: updated.category,
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
// DELETE — Delete announcement
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

  const { id } = await params;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const announcement = await prisma.announcement.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!announcement) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Announcement not found', correlationId },
        { status: 404 },
      );
    }

    // Authorization: only Super_Admin, Ketua_RT, or the creator can delete
    const isAdminRole = EDIT_DELETE_ROLES.includes(authContext.role as UserRole);
    const isCreator = announcement.createdBy === authContext.userId;

    if (!isAdminRole && !isCreator) {
      return NextResponse.json(
        { code: 'AUTH_INSUFFICIENT_ROLE', message: 'You do not have permission.', correlationId },
        { status: 403 },
      );
    }

    await prisma.announcement.delete({ where: { id } });

    return NextResponse.json({ data: { id, deleted: true } });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
