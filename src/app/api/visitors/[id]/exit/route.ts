/**
 * PATCH /api/visitors/[id]/exit — Record visitor exit timestamp.
 *
 * BFF pattern: withPermission → resolve auth context → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 15.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { RecordVisitorExitUseCase } from '@core/domains/visitor/usecases';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface VisitorExitResponse {
  data: {
    id: string;
    visitorName: string;
    purpose: string;
    destinationHouseholdId: string;
    entryTimestamp: string;
    exitTimestamp: string | null;
    loggedBy: string;
    createdAt: string;
    updatedAt: string;
  };
}

// ---------------------------------------------------------------------------
// PATCH handler — Record visitor exit
// ---------------------------------------------------------------------------

/**
 * Handle PATCH /api/visitors/[id]/exit — Record visitor exit timestamp.
 *
 * AuthorizationContext is guaranteed to have security:manage permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param routeContext - Route context with params
 * @returns NextResponse with updated visitor log or error
 */
const handleRecordVisitorExit: AuthorizedRouteHandler<VisitorExitResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<VisitorExitResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const id = params?.id;

  if (!id) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Visitor ID is required', correlationId } as unknown as VisitorExitResponse,
      { status: 400 },
    );
  }

  const useCase = container.resolve<RecordVisitorExitUseCase>(
    'recordVisitorExitUseCase',
  );
  const result = await useCase.execute({
    authContext,
    visitorLogId: id,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<VisitorExitResponse>;
  }

  const log = result.data;

  return NextResponse.json(
    {
      data: {
        id: log.id,
        visitorName: log.visitorName,
        purpose: log.purpose,
        destinationHouseholdId: log.destinationHouseholdId,
        entryTimestamp: log.entryTimestamp.toISOString(),
        exitTimestamp: log.exitTimestamp?.toISOString() ?? null,
        loggedBy: log.loggedBy,
        createdAt: log.createdAt.toISOString(),
        updatedAt: log.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handler with Permission Check
// ---------------------------------------------------------------------------

/**
 * PATCH /api/visitors/[id]/exit — Record visitor exit timestamp.
 *
 * Permission: security:manage (write access to visitor logs)
 *
 * @see Permission Mapping: /api/visitors/[id]/exit PATCH → security:manage
 */
export const PATCH = withPermission(
  { permissions: ['security:manage'] },
  handleRecordVisitorExit,
);
