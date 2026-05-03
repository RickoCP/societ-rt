/**
 * POST /api/security/attendance — Record patrol attendance.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 12.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RecordPatrolAttendanceUseCase } from '@core/domains/security/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const recordAttendanceSchema = z.object({
  scheduleId: z.string().uuid(),
  userId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST handler — Record attendance
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

  const validation = recordAttendanceSchema.safeParse(body);
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
  const useCase = container.resolve<RecordPatrolAttendanceUseCase>(
    'recordPatrolAttendanceUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: {
      scheduleId: validation.data.scheduleId,
      checkInTimestamp: new Date(),
    },
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const attendance = result.data;

  return NextResponse.json(
    {
      data: {
        id: attendance.id,
        scheduleId: attendance.scheduleId,
        userId: attendance.userId,
        checkInTimestamp: attendance.checkInTimestamp.toISOString(),
        createdAt: attendance.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
