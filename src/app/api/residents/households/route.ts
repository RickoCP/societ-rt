/**
 * POST /api/residents/households — Creates a new household within a tenant.
 * GET  /api/residents/households — Lists households with pagination and search.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 5.1, 6.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { CreateHouseholdUseCase } from '@core/domains/resident/usecases';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const createHouseholdSchema = z.object({
  householdNumber: z.string().min(1, 'Household number is required'),
  address: z.string().min(1, 'Address is required'),
  block: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET handler — List households
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

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = 20;
  const search = searchParams.get('search') ?? '';

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const where = {
      tenantId: authContext.tenantId,
      ...(search
        ? {
            OR: [
              { householdNumber: { contains: search, mode: 'insensitive' as const } },
              { address: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [households, total] = await Promise.all([
      prisma.household.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { residents: true } },
          residents: {
            take: 1,
            orderBy: { createdAt: 'asc' },
            select: { name: true },
          },
        },
      }),
      prisma.household.count({ where }),
    ]);

    return NextResponse.json({
      data: households.map(h => ({
        id: h.id,
        householdNumber: h.householdNumber,
        address: h.address,
        block: h.block ?? '',
        headOfHousehold: h.residents[0]?.name ?? '-',
        residentCount: h._count.residents,
        createdAt: h.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  // 2. Parse and validate input
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

  const validation = createHouseholdSchema.safeParse(body);
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

  // 3. Execute use case via DI
  const useCase = container.resolve<CreateHouseholdUseCase>(
    'createHouseholdUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: validation.data,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const household = result.data;

  return NextResponse.json(
    {
      data: {
        id: household.id,
        householdNumber: household.householdNumber,
        address: household.address,
        block: household.block,
        createdAt: household.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
