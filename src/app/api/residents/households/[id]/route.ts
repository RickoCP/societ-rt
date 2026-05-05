/**
 * DELETE /api/residents/households/:id — Remove a household and its residents.
 *
 * BFF pattern: resolve auth context → verify ownership → delete → return safe response.
 *
 * @see Requirements 5.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { PrismaClient } from '@prisma/client';

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
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  // 2. Extract route param
  const { id: householdId } = await params;

  // 3. Delete household (cascade deletes residents via DB constraint)
  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    // Verify household belongs to the same tenant
    const household = await prisma.household.findFirst({
      where: { id: householdId, tenantId: authContext.tenantId },
    });

    if (!household) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Household not found', correlationId },
        { status: 404 },
      );
    }

    // Delete residents first, then household
    await prisma.resident.deleteMany({ where: { householdId } });
    await prisma.household.delete({ where: { id: householdId } });

    return NextResponse.json(
      { data: { id: householdId, deleted: true } },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
