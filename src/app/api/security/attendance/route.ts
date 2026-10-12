/**
 * POST /api/security/attendance — Record patrol attendance.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 12.2
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse, type ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import { uuidLike } from '@infrastructure/utils/uuidLike';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { RecordPatrolAttendanceUseCase } from '@core/domains/security/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const recordAttendanceSchema = z.object({
  scheduleId: uuidLike(),
  userId: uuidLike(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface AttendanceResponse {
  data: {
    id: string;
    scheduleId: string;
    userId: string;
    checkInTimestamp: string;
    createdAt: string;
  };
}

// ---------------------------------------------------------------------------
// POST handler — Record attendance
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/security/attendance — Record patrol attendance.
 *
 * AuthorizationContext is guaranteed to have security:manage permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with recorded attendance or error
 */
const handleRecordAttendance: AuthorizedRouteHandler<AttendanceResponse | ErrorResponseBody> = async (
  request,
  authContext,
): Promise<NextResponse<AttendanceResponse | ErrorResponseBody>> => {
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

  const validation = recordAttendanceSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Validation failed',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  // 2. Execute use case via DI
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

  // 3. Map result to safe response
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
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * POST /api/security/attendance — Record patrol attendance.
 *
 * Permission: security:manage (write access to security operations)
 *
 * @see Permission Mapping: /api/security/attendance POST → security:manage
 */
export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleRecordAttendance,
);
