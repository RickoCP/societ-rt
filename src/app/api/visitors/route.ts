/**
 * POST /api/visitors — Log a new visitor entry.
 * GET  /api/visitors — List visitor logs for the tenant.
 *
 * BFF pattern: withPermission → validate input → execute use case / query → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 15.1, 15.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse, type ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { LogVisitorUseCase } from '@core/domains/visitor/usecases';
import type { VisitorRepository } from '@core/domains/visitor/repositories/VisitorRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const logVisitorSchema = z.object({
  visitorName: z.string().min(1, 'Visitor name is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  destinationHouseholdId: z.string().min(1, 'destinationHouseholdId is required'),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface VisitorLogResponse {
  data: {
    id: string;
    visitorName: string;
    purpose: string;
    destinationHouseholdId: string;
    entryTimestamp: string;
    exitTimestamp: string | null;
    loggedBy: string;
    createdAt: string;
  };
}

interface VisitorListResponse {
  data: Array<{
    id: string;
    visitorName: string;
    purpose: string;
    destinationHouseholdId: string;
    entryTimestamp: string;
    exitTimestamp: string | null;
    loggedBy: string;
    createdAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// POST handler — Log visitor
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/visitors — Log a new visitor entry.
 *
 * AuthorizationContext is guaranteed to have security:manage permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with created visitor log or error
 */
const handleLogVisitor: AuthorizedRouteHandler<VisitorLogResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<VisitorLogResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = logVisitorSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Validation failed', fields: formatZodErrors(validation.error), correlationId },
      { status: 400 },
    );
  }

  const useCase = container.resolve<LogVisitorUseCase>('logVisitorUseCase');
  const result = await useCase.execute({ authContext, data: validation.data });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
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
      },
    },
    { status: 201 },
  );
};

// ---------------------------------------------------------------------------
// GET handler — List visitor logs
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/visitors — List visitor logs for the tenant.
 *
 * AuthorizationContext is guaranteed to have security:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with visitor logs list or error
 */
const handleListVisitors: AuthorizedRouteHandler<VisitorListResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<VisitorListResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const visitorRepository = container.resolve<VisitorRepository>('visitorRepository');
  const result = await visitorRepository.findByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.map((v) => ({
        id: v.id,
        visitorName: v.visitorName,
        purpose: v.purpose,
        destinationHouseholdId: v.destinationHouseholdId,
        entryTimestamp: v.entryTimestamp.toISOString(),
        exitTimestamp: v.exitTimestamp?.toISOString() ?? null,
        loggedBy: v.loggedBy,
        createdAt: v.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * POST /api/visitors — Log a new visitor entry.
 *
 * Permission: security:manage (write access to visitor logs)
 *
 * @see Permission Mapping: /api/visitors POST → security:manage
 */
export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleLogVisitor,
);

/**
 * GET /api/visitors — List visitor logs for the tenant.
 *
 * Permission: security:read (read access to visitor logs)
 *
 * @see Permission Mapping: /api/visitors GET → security:read
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleListVisitors,
);
