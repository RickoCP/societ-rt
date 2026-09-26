/**
 * GET /api/audit — List audit logs for the tenant (paginated, filterable).
 *
 * BFF pattern: resolve auth → query repository → return safe paginated response.
 * Filterable by actionType, startDate, endDate.
 * Audit entries are append-only — no update or delete via API.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 18.2, 18.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { AuditRepository } from '@core/domains/audit/repositories/AuditRepository';

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: string;
  actorUserId: string;
  actionType: string;
  resourceType: string;
  resourceId: string;
  details: unknown;
  ipAddress: string | null;
  impersonatorId: string | null;
  timestamp: string;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
  };
}

// ---------------------------------------------------------------------------
// GET handler — List audit logs
// ---------------------------------------------------------------------------

const handleGetAuditLogs: AuthorizedRouteHandler<AuditLogResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<AuditLogResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Extract query params
  const { searchParams } = new URL(request.url);
  const actionType = searchParams.get('actionType') ?? undefined;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

  // Parse dates safely
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (startDateStr) {
    const parsed = new Date(startDateStr);
    if (!isNaN(parsed.getTime())) {
      startDate = parsed;
    }
  }

  if (endDateStr) {
    const parsed = new Date(endDateStr);
    if (!isNaN(parsed.getTime())) {
      endDate = parsed;
    }
  }

  // Query repository
  const auditRepository =
    container.resolve<AuditRepository>('auditRepository');
  const result = await auditRepository.findByTenant(authContext.tenantId, {
    actionType,
    startDate,
    endDate,
    page: isNaN(page) || page < 1 ? 1 : page,
    pageSize: isNaN(pageSize) || pageSize < 1 ? 20 : pageSize,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<AuditLogResponse>;
  }

  const paginated = result.data;

  return NextResponse.json(
    {
      data: paginated.data.map((a) => ({
        id: a.id,
        actorUserId: a.actorUserId,
        actionType: a.actionType,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        details: a.details,
        ipAddress: a.ipAddress,
        impersonatorId: a.impersonatorId,
        timestamp: a.timestamp.toISOString(),
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

// Export wrapped handler with required audit:read permission
export const GET = withPermission(
  { permissions: ['audit:read'] },
  handleGetAuditLogs,
);
