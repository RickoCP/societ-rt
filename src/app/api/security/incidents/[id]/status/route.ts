/**
 * PATCH /api/security/incidents/:id/status — Update incident status.
 *
 * Validates the status transition against the allowed transitions map
 * and delegates to UpdateIncidentStatusUseCase.
 *
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 32.2, 32.4, 32.8
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { UpdateIncidentStatusUseCase } from '@core/domains/incident/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const updateStatusSchema = z.object({
  status: z.enum([
    'open',
    'acknowledged',
    'in_progress',
    'escalated',
    'resolved',
    'closed',
  ]),
  notes: z.string().max(1000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// PATCH handler — Update incident status
// ---------------------------------------------------------------------------

const handleUpdateStatus: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract incident ID from route params
  const { id } = await routeContext?.params ?? { id: '' };

  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Incident ID is required',
        correlationId,
      },
      { status: 400 },
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

  const validation = updateStatusSchema.safeParse(body);
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
  const useCase = container.resolve<UpdateIncidentStatusUseCase>(
    'updateIncidentStatusUseCase',
  );
  const result = await useCase.execute({
    authContext,
    incidentId: id,
    newStatus: validation.data.status,
    notes: validation.data.notes ?? null,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const incident = result.data;

  return NextResponse.json(
    {
      data: {
        id: incident.id,
        title: incident.title,
        status: incident.status,
        severity: incident.severity,
        escalatedAt: incident.escalatedAt?.toISOString() ?? null,
        resolvedAt: incident.resolvedAt?.toISOString() ?? null,
        updatedAt: incident.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
};

export const PATCH = withPermission(
  { permissions: ['security:write'] },
  handleUpdateStatus,
);
