/**
 * PATCH /api/notifications/[id]/read — Mark a notification as read.
 *
 * BFF pattern: withPermission → execute repository → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 17.3
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { NotificationRepository } from '@core/domains/notification/repositories/NotificationRepository';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface NotificationResponse {
  data: {
    id: string;
    type: string;
    title: string;
    body: string;
    channel: string;
    status: string;
    createdAt: string;
  };
}

interface NotificationErrorResponse {
  code: string;
  message: string;
  correlationId: string;
  fields?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// PATCH handler — Mark notification as read
// ---------------------------------------------------------------------------

/**
 * Handler for marking a notification as read.
 *
 * AuthorizationContext is guaranteed to have announcement:read permission
 * after withPermission validation.
 */
const handleMarkAsRead: AuthorizedRouteHandler<
  NotificationResponse | NotificationErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse<NotificationResponse | NotificationErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract notification ID from route params
  const { id: notificationId } = await routeContext!.params!;

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

  // 2. Execute via repository
  const notificationRepository =
    container.resolve<NotificationRepository>('notificationRepository');
  const result = await notificationRepository.markAsRead(
    authContext.tenantId,
    notificationId,
  );

  // 3. Map result to safe response
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
};

/**
 * PATCH handler wrapped with announcement:read permission requirement.
 *
 * Users with announcement:read permission can mark their own notifications as read.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: /api/notifications/[id]/read → announcement:read
 */
export const PATCH = withPermission(
  { permissions: ['announcement:read'] },
  handleMarkAsRead,
);
