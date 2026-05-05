/**
 * PATCH /api/residents/:id — Update a resident's residency status.
 * DELETE /api/residents/:id — Remove a resident.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 5.3, 5.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { UpdateResidentStatusUseCase } from '@core/domains/resident/usecases';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const updateStatusSchema = z.object({
  status: z.enum(['tetap', 'kontrak', 'kos', 'pindah']),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  // 2. Extract route param
  const { id: residentId } = await params;

  // 3. Parse and validate input
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

  const validation = updateStatusSchema.safeParse(body);
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

  // 4. Execute use case via DI
  const useCase = container.resolve<UpdateResidentStatusUseCase>(
    'updateResidentStatusUseCase',
  );
  const result = await useCase.execute({
    authContext,
    residentId,
    status: validation.data.status,
  });

  // 5. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const resident = result.data;

  return NextResponse.json(
    {
      data: {
        id: resident.id,
        name: resident.name,
        status: resident.status,
        updatedAt: resident.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}


// ---------------------------------------------------------------------------
// DELETE handler — Remove a resident
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  // 2. Extract route param
  const { id: residentId } = await params;

  // 3. Delete resident via Prisma
  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    // Verify resident belongs to the same tenant
    const resident = await prisma.resident.findFirst({
      where: {
        id: residentId,
        household: { tenantId: authContext.tenantId },
      },
    });

    if (!resident) {
      return NextResponse.json(
        {
          code: 'COMMON_NOT_FOUND',
          message: 'Resident not found',
          correlationId,
        },
        { status: 404 },
      );
    }

    await prisma.resident.delete({ where: { id: residentId } });

    return NextResponse.json(
      { data: { id: residentId, deleted: true } },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Internal server error',
        correlationId,
      },
      { status: 500 },
    );
  }
}
