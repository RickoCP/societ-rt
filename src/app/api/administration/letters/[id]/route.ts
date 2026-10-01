/**
 * PATCH /api/administration/letters/:id — Edit a pending letter request.
 *
 * Only the creator can edit, and only while the letter is still pending.
 *
 * @see Requirements 13.1
 * @see Requirements 2.1, 2.2, 2.3 (Route Handler withPermission Migration)
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
// Input schema
// ---------------------------------------------------------------------------

const updateLetterSchema = z.object({
  letterType: z.enum(['surat_pengantar', 'domisili', 'SKTM']).optional(),
  purpose: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/**
 * Response type for letter update endpoint.
 */
interface LetterUpdateResponse {
  data?: {
    id: string;
    userId: string;
    letterType: string;
    purpose: string;
    status: string;
    createdAt: string;
  };
  code?: string;
  message?: string;
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// PATCH handler — Edit pending letter request
// ---------------------------------------------------------------------------

/**
 * Handler for editing a pending letter request.
 *
 * AuthorizationContext is guaranteed to have resident:write permission
 * after withPermission validation.
 *
 * Business rules:
 * - Only the creator (userId match) can edit their letter
 * - Only letters with status 'pending' can be edited
 */
const handlePatchLetter: AuthorizedRouteHandler<LetterUpdateResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse<LetterUpdateResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await routeContext!.params!;

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
};

/**
 * PATCH handler wrapped with resident:write permission requirement.
 *
 * Users with resident:write permission can edit their own pending letters.
 * Additional ownership check is performed inside the handler.
 *
 * @see Permission Mapping: /api/administration/letters/[id] PATCH → resident:write
 */
export const PATCH = withPermission(
  { permissions: ['resident:write'] },
  handlePatchLetter,
);
