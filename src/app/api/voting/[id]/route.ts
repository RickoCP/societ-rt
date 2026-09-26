/**
 * GET /api/voting/:id — Get vote detail with options.
 * PATCH /api/voting/:id — Update vote title/description/deadline.
 * DELETE /api/voting/:id — Delete a vote and its options/ballots.
 *
 * Authorization:
 * - GET: vote:cast (view vote details to cast a vote)
 * - PATCH: vote:manage (update vote polls)
 * - DELETE: vote:manage (delete vote polls)
 *
 * @see Requirements 8.1
 * @see Requirements 2.1, 2.2, 2.3 — Route authorization migration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// GET handler — Get vote detail
// ---------------------------------------------------------------------------

const handleGetVote: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const voteId = params?.id;

  if (!voteId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Vote ID is required', correlationId },
      { status: 400 },
    ) as NextResponse<void>;
  }

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
      ) as NextResponse<void>;
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
    }) as NextResponse<void>;
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    ) as NextResponse<void>;
  }
};

// ---------------------------------------------------------------------------
// PATCH handler — Update vote
// ---------------------------------------------------------------------------

const updateVoteSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  deadline: z.string().optional(),
});

const handleUpdateVote: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const voteId = params?.id;

  if (!voteId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Vote ID is required', correlationId },
      { status: 400 },
    ) as NextResponse<void>;
  }

  // Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    ) as NextResponse<void>;
  }

  const validation = updateVoteSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<void>;
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
      ) as NextResponse<void>;
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
    }) as NextResponse<void>;
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    ) as NextResponse<void>;
  }
};

// ---------------------------------------------------------------------------
// DELETE handler — Delete vote (cascade: options + ballots)
// ---------------------------------------------------------------------------

const handleDeleteVote: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const voteId = params?.id;

  if (!voteId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Vote ID is required', correlationId },
      { status: 400 },
    ) as NextResponse<void>;
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
      ) as NextResponse<void>;
    }

    // Additional ownership check: Only the creator or users with vote:manage can delete
    // Note: The permission check via withPermission already ensures vote:manage is present
    // We keep the creator check as an additional business rule
    const isCreator = vote.createdBy === authContext.userId;
    
    // If not creator and reached this point (has vote:manage permission),
    // that's allowed because vote:manage implies administrative control
    if (!isCreator && !authContext.permissions.has('vote:manage')) {
      return NextResponse.json(
        { code: 'AUTH_INSUFFICIENT_PERMISSION', message: 'You do not have permission.', correlationId },
        { status: 403 },
      ) as NextResponse<void>;
    }

    // Delete in order: ballots → options → vote
    await prisma.ballot.deleteMany({ where: { voteId } });
    await prisma.voteOption.deleteMany({ where: { voteId } });
    await prisma.vote.delete({ where: { id: voteId } });

    return NextResponse.json({ data: { id: voteId, deleted: true } }) as NextResponse<void>;
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    ) as NextResponse<void>;
  }
};

// ---------------------------------------------------------------------------
// Export route handlers with permission wrappers
// ---------------------------------------------------------------------------

/**
 * GET /api/voting/:id — Get vote detail (requires vote:cast to view available votes)
 */
export const GET = withPermission(
  { permissions: ['vote:cast'] },
  handleGetVote,
);

/**
 * PATCH /api/voting/:id — Update vote (requires vote:manage)
 */
export const PATCH = withPermission(
  { permissions: ['vote:manage'] },
  handleUpdateVote,
);

/**
 * DELETE /api/voting/:id — Delete vote (requires vote:manage)
 */
export const DELETE = withPermission(
  { permissions: ['vote:manage'] },
  handleDeleteVote,
);
