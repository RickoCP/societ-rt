/**
 * GET /api/security/dashboard — Get security center dashboard metrics.
 *
 * Role-restricted to Ketua_RT, Pengurus, Security_Guard.
 * BFF pattern: resolve auth → execute use case → return safe response.
 *
 * @see Requirements 31.1, 31.9
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetSecurityDashboardUseCase } from '@core/domains/securityCenter/usecases';

// ---------------------------------------------------------------------------
// GET handler — Security dashboard metrics
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

  // 2. Execute use case via DI (role check is inside the use case)
  try {
    const useCase = container.resolve<GetSecurityDashboardUseCase>(
      'getSecurityDashboardUseCase',
    );
    const result = await useCase.execute({ authContext });

    // 3. Map result to safe response
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
}
