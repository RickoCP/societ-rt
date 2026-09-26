/**
 * POST /api/security/patrols — Create a new patrol schedule.
 * GET  /api/security/patrols — List patrol schedules for the tenant.
 *
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 12.1
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
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

const handleCreateSchedule: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate input
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

  // 2. Execute use case via DI
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

  // 3. Map result to safe response
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
};

export const POST = withPermission(
  { permissions: ['security:write'] },
  handleCreateSchedule,
);

// ---------------------------------------------------------------------------
// GET handler — List patrol schedules
// ---------------------------------------------------------------------------

const handleListSchedules: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Query repository for schedules
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
      data: result.data.map(schedule => ({
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
};

export const GET = withPermission(
  { permissions: ['security:read'] },
  handleListSchedules,
);
