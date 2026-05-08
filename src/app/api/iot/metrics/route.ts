/**
 * GET /api/iot/metrics — Prometheus-compatible IoT metrics endpoint.
 *
 * Returns metrics in Prometheus text exposition format.
 * Requires authentication.
 *
 * @see Requirements 44.6, 44.7, 44.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { IoTMetricsEmitter } from '@infrastructure/iot/IoTMetricsEmitter';

// ---------------------------------------------------------------------------
// GET handler — Prometheus metrics
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  // 2. Resolve metrics emitter from DI
  const metricsEmitter = container.resolve<IoTMetricsEmitter>('iotMetricsEmitter');

  // 3. Return Prometheus text format
  const prometheusText = metricsEmitter.getPrometheusMetrics();

  return new NextResponse(prometheusText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'X-Correlation-Id': correlationId,
    },
  });
}
