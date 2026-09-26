/**
 * POST /api/notifications/[id]/acknowledge — Acknowledge a notification
 * and stop further escalation for the associated event.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 43.3, 43.4
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { AcknowledgeNotificationUseCase } from '@core/domains/notification/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const acknowledgeSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface AcknowledgeResponse {
  data: {
    eventId: string;
    acknowledgedBy: string;
    acknowledgedAt: string;
    escalationCancelled: boolean;
  };
}

interface AcknowledgeErrorResponse {
  code: string;
  message: string;
  correlationId: string;
  fields?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// POST handler — Acknowledge notification
// ---------------------------------------------------------------------------

/**
 * Handler for acknowledging a notification and stopping escalation.
 *
 * AuthorizationContext is guaranteed to have announcement:read permission
 * after withPermission validation.
 */
const handleAcknowledgeNotification: AuthorizedRouteHandler<
  AcknowledgeResponse | AcknowledgeErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse<AcknowledgeResponse | AcknowledgeErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract notification ID from route params
  const { id: notificationId } = await routeContext!.params!;

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

  // 3. Execute use case via DI
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

    // 4. Map result to safe response
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
};

/**
 * POST handler wrapped with announcement:read permission requirement.
 *
 * Users with announcement:read permission can acknowledge notifications.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: /api/notifications/[id]/acknowledge → announcement:read
 */
export const POST = withPermission(
  { permissions: ['announcement:read'] },
  handleAcknowledgeNotification,
);
