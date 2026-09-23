/**
 * GET /api/voting/:id — Get vote detail with options.
 * PATCH /api/voting/:id — Update vote title/description/deadline.
 * DELETE /api/voting/:id — Delete a vote and its options/ballots.
 *
 * Only admin roles (Super_Admin, Ketua_RT, Pengurus) can edit/delete.
 *
 * @see Requirements 8.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import { UserRole } from '@core/protocols';
import type { PrismaClient } from '@/generated/prisma/client';

const ADMIN_ROLES = [UserRole.Super_Admin, UserRole.Ketua_RT, UserRole.Pengurus];

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

  const { id: voteId } = await params;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const vote = await prisma.vote.findFirst({
      where: { id: voteId, tenantId: authContext.tenantId },
      include: {
        options: {
          select: { id: true, label: true, voteCount: true },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!vote) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Vote not found', correlationId },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        id: vote.id,
        title: vote.title,
        description: vote.description,
        mode: vote.mode,
        deadline: vote.deadline.toISOString(),
        createdBy: vote.createdBy,
        createdAt: vote.createdAt.toISOString(),
        options: vote.options.map(o => ({
          id: o.id,
          label: o.label,
          voteCount: o.voteCount,
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
// PATCH — Update vote
// ---------------------------------------------------------------------------

const updateVoteSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  deadline: z.string().optional(),
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

  const { id: voteId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = updateVoteSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid input', correlationId },
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const vote = await prisma.vote.findFirst({
      where: { id: voteId, tenantId: authContext.tenantId },
    });

    if (!vote) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Vote not found', correlationId },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (validation.data.title) updateData.title = validation.data.title;
    if (validation.data.description) updateData.description = validation.data.description;
    if (validation.data.deadline) updateData.deadline = new Date(validation.data.deadline);

    const updated = await prisma.vote.update({
      where: { id: voteId },
      data: updateData,
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        deadline: updated.deadline.toISOString(),
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
// DELETE — Delete vote (cascade: options + ballots)
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

  const { id: voteId } = await params;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const vote = await prisma.vote.findFirst({
      where: { id: voteId, tenantId: authContext.tenantId },
    });

    if (!vote) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Vote not found', correlationId },
        { status: 404 },
      );
    }

    // Authorization: only Super_Admin, Ketua_RT, or the vote creator can delete
    const DELETE_ROLES: UserRole[] = [UserRole.Super_Admin, UserRole.Ketua_RT];
    const isAdminRole = DELETE_ROLES.includes(authContext.role as UserRole);
    const isCreator = vote.createdBy === authContext.userId;

    if (!isAdminRole && !isCreator) {
      return NextResponse.json(
        { code: 'AUTH_INSUFFICIENT_ROLE', message: 'You do not have permission.', correlationId },
        { status: 403 },
      );
    }

    // Delete in order: ballots → options → vote
    await prisma.ballot.deleteMany({ where: { voteId } });
    await prisma.voteOption.deleteMany({ where: { voteId } });
    await prisma.vote.delete({ where: { id: voteId } });

    return NextResponse.json({ data: { id: voteId, deleted: true } });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
