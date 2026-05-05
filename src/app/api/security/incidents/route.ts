/**
 * POST /api/security/incidents — Create a new incident report.
 * GET  /api/security/incidents — List incident reports for the tenant.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 12.3, 12.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { CreateIncidentReportUseCase } from '@core/domains/security/usecases';
import type { SecurityRepository } from '@core/domains/security/repositories/SecurityRepository';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const createIncidentSchema = z.object({
  title: z.string().min(1).optional(),
  date: z.string().datetime(),
  time: z.string().min(1),
  description: z.string().min(1),
  location: z.string().min(1),
  severityLevel: z.enum(['low', 'medium', 'high', 'critical']),
});

// ---------------------------------------------------------------------------
// POST handler — Create incident report
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

  const validation = createIncidentSchema.safeParse(body);
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
  const useCase = container.resolve<CreateIncidentReportUseCase>(
    'createIncidentReportUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: {
      date: new Date(validation.data.date),
      time: validation.data.time,
      description: validation.data.description,
      location: validation.data.location,
      severityLevel: validation.data.severityLevel,
    },
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const report = result.data;

  return NextResponse.json(
    {
      data: {
        id: report.id,
        date: report.date.toISOString(),
        time: report.time,
        description: report.description,
        location: report.location,
        severityLevel: report.severityLevel,
        reportedBy: report.reportedBy,
        createdAt: report.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET handler — List incident reports
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

  // 2. Query repository for incidents
  const securityRepository =
    container.resolve<SecurityRepository>('securityRepository');
  const result = await securityRepository.findIncidentsByTenant(
    authContext.tenantId,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.map((report) => ({
        id: report.id,
        date: report.date.toISOString(),
        time: report.time,
        description: report.description,
        location: report.location,
        severityLevel: report.severityLevel,
        reportedBy: report.reportedBy,
        createdAt: report.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
}
