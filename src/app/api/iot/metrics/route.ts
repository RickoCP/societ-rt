/**
 * GET /api/iot/metrics — Prometheus-compatible IoT metrics endpoint.
 *
 * Returns metrics in Prometheus text exposition format.
 * Requires authentication and iot:read permission.
 *
 * @see Requirements 44.6, 44.7, 44.8
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler Migration
 */

import { NextResponse } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { IoTMetricsEmitter } from '@infrastructure/iot/IoTMetricsEmitter';

// ---------------------------------------------------------------------------
// GET handler — Prometheus metrics
// ---------------------------------------------------------------------------

const handleGetMetrics: AuthorizedRouteHandler<unknown> = async (request) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve metrics emitter from DI
  const metricsEmitter = container.resolve<IoTMetricsEmitter>('iotMetricsEmitter');

  // 2. Return Prometheus text format
  const prometheusText = metricsEmitter.getPrometheusMetrics();

  return new NextResponse(prometheusText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'X-Correlation-Id': correlationId,
    },
  });
};

export const GET = withPermission(
  { permissions: ['iot:read'] },
  handleGetMetrics,
);
