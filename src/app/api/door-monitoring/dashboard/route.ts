/**
 * GET /api/door-monitoring/dashboard — Door-state markers for the security
 * dashboard: every configured household with coordinates, current door state,
 * monitoring status, and whether it is currently alerting (open in-window).
 *
 * Authorization: Security_Guard / Ketua_RT / Pengurus (enforced in use case).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetDoorStateDashboardUseCase } from '@core/domains/doorMonitoring/usecases';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const useCase = container.resolve<GetDoorStateDashboardUseCase>(
    'getDoorStateDashboardUseCase',
  );
  const result = await useCase.execute({ authContext });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
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
}
