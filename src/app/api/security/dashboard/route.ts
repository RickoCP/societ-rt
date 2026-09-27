/**
 * GET /api/security/dashboard — Get security center dashboard metrics.
 *
 * BFF pattern: withPermission → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 31.1, 31.9
 */

import { NextResponse } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse, type ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { GetSecurityDashboardUseCase } from '@core/domains/securityCenter/usecases';
import type {
  GateStatusSummary,
  CctvStatusSummary,
  PatrolStatusSummary,
} from '@core/domains/securityCenter/entities';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface SecurityDashboardResponse {
  data: {
    activeIncidents: number;
    emergencyAlerts: number;
    gateStatus: GateStatusSummary;
    cctvStatus: CctvStatusSummary;
    patrolStatus: PatrolStatusSummary;
    recentEvents: Array<{
      id: string;
      type: string;
      title: string;
      severity: string | null;
      category: string | null;
      timestamp: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// GET handler — Security dashboard metrics
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/security/dashboard — Get security center dashboard metrics.
 *
 * AuthorizationContext is guaranteed to have security:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with dashboard metrics or error
 */
const handleGetDashboard: AuthorizedRouteHandler<SecurityDashboardResponse | ErrorResponseBody> = async (
  request,
  authContext,
): Promise<NextResponse<SecurityDashboardResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  try {
    const useCase = container.resolve<GetSecurityDashboardUseCase>(
      'getSecurityDashboardUseCase',
    );
    const result = await useCase.execute({ authContext });

    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const metrics = result.data;

    return NextResponse.json(
      {
        data: {
          activeIncidents: metrics.activeIncidents,
          emergencyAlerts: metrics.emergencyAlerts,
          gateStatus: metrics.gateStatus,
          cctvStatus: metrics.cctvStatus,
          patrolStatus: metrics.patrolStatus,
          recentEvents: metrics.recentEvents.map(e => ({
            id: e.id,
            type: e.type,
            title: e.title,
            severity: e.severity,
            category: e.category,
            timestamp: e.timestamp.toISOString(),
          })),
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

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/security/dashboard — Get security center dashboard metrics.
 *
 * Permission: security:read (view security dashboard)
 *
 * @see Permission Mapping: /api/security/dashboard GET → security:read
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetDashboard,
);
