/**
 * PATCH /api/notifications/[id]/read — Mark a notification as read.
 *
 * BFF pattern: resolve auth → execute repository → return safe response.
 *
 * @see Requirements 17.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { NotificationRepository } from '@core/domains/notification/repositories/NotificationRepository';

// ---------------------------------------------------------------------------
// PATCH handler — Mark notification as read
// ---------------------------------------------------------------------------

export async function PATCH(
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

  if (!notificationId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Notification ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 3. Execute via repository
  const notificationRepository =
    container.resolve<NotificationRepository>('notificationRepository');
  const result = await notificationRepository.markAsRead(
    authContext.tenantId,
    notificationId,
  );

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const notification = result.data;

  return NextResponse.json(
    {
      data: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        channel: notification.channel,
        status: notification.status,
        createdAt: notification.createdAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
