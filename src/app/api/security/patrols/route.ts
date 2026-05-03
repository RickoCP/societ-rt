/**
 * POST /api/security/patrols — Create a new patrol schedule.
 * GET  /api/security/patrols — List patrol schedules for the tenant.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 12.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { CreatePatrolScheduleUseCase } from '@core/domains/security/usecases';
import type { SecurityRepository } from '@core/domains/security/repositories/SecurityRepository';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const createScheduleSchema = z.object({
  date: z.string().datetime(),
  timeSlot: z.string().min(1),
  assignedUserIds: z.array(z.string().uuid()).min(1),
});

// ---------------------------------------------------------------------------
// POST handler — Create patrol schedule
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

  const validation = createScheduleSchema.safeParse(body);
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
  const useCase = container.resolve<CreatePatrolScheduleUseCase>(
    'createPatrolScheduleUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: {
      date: new Date(validation.data.date),
      timeSlot: validation.data.timeSlot,
      assignedUserIds: validation.data.assignedUserIds,
    },
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const schedule = result.data;

  return NextResponse.json(
    {
      data: {
        id: schedule.id,
        date: schedule.date.toISOString(),
        timeSlot: schedule.timeSlot,
        assignedUserIds: schedule.assignedUserIds,
        createdBy: schedule.createdBy,
        createdAt: schedule.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET handler — List patrol schedules
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
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

  // 2. Query repository for schedules
  const securityRepository =
    container.resolve<SecurityRepository>('securityRepository');
  const result = await securityRepository.findSchedulesByTenant(
    authContext.tenantId,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.map((schedule) => ({
        id: schedule.id,
        date: schedule.date.toISOString(),
        timeSlot: schedule.timeSlot,
        assignedUserIds: schedule.assignedUserIds,
        createdBy: schedule.createdBy,
        createdAt: schedule.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
}
