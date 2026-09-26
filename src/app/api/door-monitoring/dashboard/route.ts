/**
 * GET /api/door-monitoring/dashboard — Door-state markers for the security
 * dashboard: every configured household with coordinates, current door state,
 * monitoring status, and whether it is currently alerting (open in-window).
 *
 * Authorization: Requires `security:read` permission.
 * Roles with access: Security_Guard, Ketua_RT, Pengurus, Platform_Admin
 *
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler Migration Pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GetDoorStateDashboardUseCase } from '@core/domains/doorMonitoring/usecases';

/**
 * Response shape for door monitoring dashboard data.
 */
interface DoorMonitoringDashboardResponse {
  data: Array<{
    householdId: string;
    householdNumber: string;
    address: string;
    block: string;
    latitude: number;
    longitude: number;
    currentState: string;
    monitoringEnabled: boolean;
    withinWindow: boolean;
    monitorStart: string | null;
    monitorEnd: string | null;
    sirenZone: string | null;
    alerting: boolean;
    lastStateChange: string | null;
  }>;
}

/**
 * Handles GET request for door monitoring dashboard.
 *
 * Returns door-state markers for all configured households including:
 * - Location coordinates
 * - Current door state (open/closed)
 * - Monitoring configuration
 * - Alert status
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext with security:read permission
 * @returns Door monitoring dashboard data for the tenant
 */
const handleGetDoorMonitoringDashboard: AuthorizedRouteHandler<DoorMonitoringDashboardResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<DoorMonitoringDashboardResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const useCase = container.resolve<GetDoorStateDashboardUseCase>(
    'getDoorStateDashboardUseCase',
  );
  const result = await useCase.execute({ authContext });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<DoorMonitoringDashboardResponse>;
  }

  return NextResponse.json(
    {
      data: result.data.map(m => ({
        householdId: m.householdId,
        householdNumber: m.householdNumber,
        address: m.address,
        block: m.block,
        latitude: m.latitude,
        longitude: m.longitude,
        currentState: m.currentState,
        monitoringEnabled: m.monitoringEnabled,
        withinWindow: m.withinWindow,
        monitorStart: m.monitorStart,
        monitorEnd: m.monitorEnd,
        sirenZone: m.sirenZone,
        alerting: m.alerting,
        lastStateChange: m.lastStateChange?.toISOString() ?? null,
      })),
    },
    { status: 200 },
  );
};

/**
 * GET /api/door-monitoring/dashboard
 *
 * Permission: security:read
 * Access: Security guards and administrators can view door monitoring dashboard
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetDoorMonitoringDashboard,
);
