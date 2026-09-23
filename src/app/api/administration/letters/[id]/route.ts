/**
 * PATCH /api/administration/letters/:id — Edit a pending letter request.
 *
 * Only the creator can edit, and only while the letter is still pending.
 *
 * @see Requirements 13.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const updateLetterSchema = z.object({
  letterType: z.enum(['surat_pengantar', 'domisili', 'SKTM']).optional(),
  purpose: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// PATCH handler — Edit pending letter request
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

  const validation = updateLetterSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid input', correlationId },
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const letter = await prisma.letterRequest.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!letter) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Letter request not found', correlationId },
        { status: 404 },
      );
    }

    // Only the creator can edit
    if (letter.userId !== authContext.userId) {
      return NextResponse.json(
        { code: 'AUTH_INSUFFICIENT_ROLE', message: 'You do not have permission.', correlationId },
        { status: 403 },
      );
    }

    // Can only edit pending letters
    if (letter.status !== 'pending') {
      return NextResponse.json(
        { code: 'COMMON_VALIDATION_FAILED', message: 'Only pending letters can be edited.', correlationId },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (validation.data.letterType) updateData.letterType = validation.data.letterType;
    if (validation.data.purpose) updateData.purpose = validation.data.purpose;

    const updated = await prisma.letterRequest.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        userId: updated.userId,
        letterType: updated.letterType,
        purpose: updated.purpose,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
