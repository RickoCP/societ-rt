/**
 * POST /api/packages — Log a new package delivery.
 * GET  /api/packages — List package logs for the tenant.
 *
 * BFF pattern: validate input → resolve auth context → execute use case / query → return safe response.
 *
 * @see Requirements 15.3, 15.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { LogPackageUseCase } from '@core/domains/visitor/usecases';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const logPackageSchema = z.object({
  recipientHouseholdId: z.string().min(1, 'recipientHouseholdId is required'),
  courierName: z.string().min(1, 'Courier name is required'),
  description: z.string().min(1, 'Description is required'),
});

// ---------------------------------------------------------------------------
// POST handler — Log package
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = logPackageSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', fields: formatZodErrors(validation.error), correlationId },
      { status: 400 },
    );
  }

  const useCase = container.resolve<LogPackageUseCase>('logPackageUseCase');
  const result = await useCase.execute({ authContext, data: validation.data });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const pkg = result.data;

  return NextResponse.json(
    {
      data: {
        id: pkg.id,
        recipientHouseholdId: pkg.recipientHouseholdId,
        courierName: pkg.courierName,
        description: pkg.description,
        arrivalTimestamp: pkg.arrivalTimestamp.toISOString(),
        loggedBy: pkg.loggedBy,
        createdAt: pkg.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET handler — List package logs
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  // Query package logs directly via Prisma (tenant-scoped)
  const prismaClient = container.resolve<PrismaClient>('prismaClient');
  try {
    const packages = await prismaClient.packageLog.findMany({
      where: { tenantId: authContext.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    // Get collected_at via raw query (field not in generated client)
    const collectedData = await prismaClient.$queryRawUnsafe<Array<{ id: string; collected_at: Date | null }>>(
      `SELECT id, collected_at FROM package_logs WHERE tenant_id = $1`,
      authContext.tenantId,
    );
    const collectedMap = new Map(collectedData.map(r => [r.id, r.collected_at]));

    // Get household info for recipients
    const householdIds = [...new Set(packages.map(p => p.recipientHouseholdId))];
    const households = householdIds.length > 0
      ? await prismaClient.household.findMany({
          where: { id: { in: householdIds } },
          select: { id: true, householdNumber: true, address: true },
        })
      : [];
    const hhMap = new Map(households.map(h => [h.id, h]));

    return NextResponse.json(
      {
        data: packages.map((p) => ({
          id: p.id,
          recipientHouseholdId: p.recipientHouseholdId,
          recipientHousehold: hhMap.get(p.recipientHouseholdId)?.householdNumber ?? '-',
          recipientAddress: hhMap.get(p.recipientHouseholdId)?.address ?? '-',
          courierName: p.courierName,
          description: p.description,
          arrivalTimestamp: p.arrivalTimestamp.toISOString(),
          collectedAt: collectedMap.get(p.id)?.toISOString() ?? null,
          loggedBy: p.loggedBy,
          createdAt: p.createdAt.toISOString(),
        })),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { code: 'PACKAGE_LIST_FAILED', message: 'An unexpected error occurred. Please try again later.', correlationId },
      { status: 500 },
    );
  }
}
