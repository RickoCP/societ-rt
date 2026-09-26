/**
 * POST /api/security/alerts/broadcast — Broadcast a neighborhood security alert.
 *
 * Permission: security:manage
 * BFF pattern: withPermission wrapper → validate input → execute use case → return safe response.
 *
 * @see Requirements 31.4, 31.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { BroadcastNeighborhoodAlertUseCase } from '@core/domains/securityCenter/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const broadcastAlertSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  message: z.string().min(1, 'Message is required').max(1000),
});

// ---------------------------------------------------------------------------
// POST handler — Broadcast neighborhood alert
// ---------------------------------------------------------------------------

async function handleBroadcastAlert(
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse> {
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

  const validation = broadcastAlertSchema.safeParse(body);
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
  try {
    const useCase = container.resolve<BroadcastNeighborhoodAlertUseCase>(
      'broadcastNeighborhoodAlertUseCase',
    );
    const result = await useCase.execute({
      authContext,
      input: validation.data,
    });

    // 3. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const alert = result.data;

    return NextResponse.json(
      {
        data: {
          id: alert.id,
          tenantId: alert.tenantId,
          severity: alert.severity,
          message: alert.message,
          createdBy: alert.createdBy,
          createdAt: alert.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Internal server error',
        correlationId,
      },
      { status: 500 },
    );
  }
}

export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleBroadcastAlert,
);
