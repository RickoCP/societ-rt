/**
 * GET /api/notifications — List inbox notifications for the authenticated user.
 *
 * BFF pattern: resolve auth → query repository → return safe paginated response.
 * Only returns inbox-channel notifications for the current user.
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
// GET handler — List notifications
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

  // 2. Extract query params
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as 'unread' | 'read' | null;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

  // 3. Query repository
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
}
