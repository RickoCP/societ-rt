/**
 * GET /api/notifications — List inbox notifications for the authenticated user.
 *
 * BFF pattern: withPermission → query repository → return safe paginated response.
 * Only returns inbox-channel notifications for the current user.
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

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  createdAt: string;
}

interface NotificationListResponse {
  data: NotificationItem[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
  };
}

interface NotificationErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// GET handler — List notifications
// ---------------------------------------------------------------------------

/**
 * Handler for listing user notifications.
 *
 * AuthorizationContext is guaranteed to have announcement:read permission
 * after withPermission validation.
 *
 * Only returns inbox-channel notifications for the current user.
 */
const handleGetNotifications: AuthorizedRouteHandler<
  NotificationListResponse | NotificationErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<NotificationListResponse | NotificationErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract query params
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as 'unread' | 'read' | null;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

  // 2. Query repository
  const notificationRepository =
    container.resolve<NotificationRepository>('notificationRepository');
  const result = await notificationRepository.findByUser(
    authContext.tenantId,
    authContext.userId,
    {
      status: status ?? undefined,
      page: isNaN(page) || page < 1 ? 1 : page,
      pageSize: isNaN(pageSize) || pageSize < 1 ? 20 : pageSize,
    },
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const paginated = result.data;

  return NextResponse.json(
    {
      data: paginated.data.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        channel: n.channel,
        status: n.status,
        createdAt: n.createdAt.toISOString(),
      })),
      pagination: {
        total: paginated.total,
        page: paginated.page,
        pageSize: paginated.pageSize,
      },
    },
    { status: 200 },
  );
};

/**
 * GET handler wrapped with announcement:read permission requirement.
 *
 * Users with announcement:read permission can list their own notifications.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: /api/notifications → announcement:read
 */
export const GET = withPermission(
  { permissions: ['announcement:read'] },
  handleGetNotifications,
);
