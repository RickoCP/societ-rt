/**
 * POST /api/visitors — Log a new visitor entry.
 * GET  /api/visitors — List visitor logs for the tenant.
 *
 * BFF pattern: validate input → resolve auth context → execute use case / query → return safe response.
 *
 * @see Requirements 15.1, 15.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { LogVisitorUseCase } from '@core/domains/visitor/usecases';
import type { VisitorRepository } from '@core/domains/visitor/repositories/VisitorRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const logVisitorSchema = z.object({
  visitorName: z.string().min(1, 'Visitor name is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  destinationHouseholdId: z.string().uuid('destinationHouseholdId must be a valid UUID'),
});

// ---------------------------------------------------------------------------
// POST handler — Log visitor
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

  const validation = logVisitorSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', fields: formatZodErrors(validation.error), correlationId },
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
}

// ---------------------------------------------------------------------------
// GET handler — List visitor logs
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
}
