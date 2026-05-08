/**
 * POST /api/notifications/[id]/acknowledge — Acknowledge a notification
 * and stop further escalation for the associated event.
 *
 * BFF pattern: resolve auth → validate input → execute use case → return safe response.
 *
 * @see Requirements 43.3, 43.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { AcknowledgeNotificationUseCase } from '@core/domains/notification/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const acknowledgeSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
});

// ---------------------------------------------------------------------------
// POST handler — Acknowledge notification
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  // 2. Extract notification ID from route params
  const { id: notificationId } = await params;

  // 3. Parse and validate input
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

  const validation = acknowledgeSchema.safeParse(body);
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

  // 4. Execute use case via DI
  try {
    const useCase = container.resolve<AcknowledgeNotificationUseCase>(
      'acknowledgeNotificationUseCase',
    );
    const result = await useCase.execute({
      authContext,
      data: {
        eventId: validation.data.eventId,
        notificationId,
      },
    });

    // 5. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    return NextResponse.json(
      {
        data: {
          eventId: result.data.eventId,
          acknowledgedBy: result.data.acknowledgedBy,
          acknowledgedAt: result.data.acknowledgedAt.toISOString(),
          escalationCancelled: result.data.escalationCancelled,
        },
      },
      { status: 200 },
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
