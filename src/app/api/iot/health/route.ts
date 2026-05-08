/**
 * GET /api/iot/health — IoT subsystem health check.
 *
 * This endpoint does NOT require authentication. It returns the health
 * status of the IoT subsystem including Tuya Cloud API connectivity,
 * Redis connectivity, WebSocket server status, and device sync lag.
 *
 * @see Requirements 44.1, 44.5
 */

import { NextResponse } from 'next/server';
import { container } from '@infrastructure/di/container';
import type { CheckIoTHealthUseCase } from '@core/domains/iot/usecases';

// ---------------------------------------------------------------------------
// GET handler — IoT health check (no auth required)
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  try {
    const useCase = container.resolve<CheckIoTHealthUseCase>('checkIoTHealthUseCase');
    const result = await useCase.execute();

    if (!result.success) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          subsystem: 'iot',
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    const health = result.data;
    const httpStatus = health.overall === 'unhealthy' ? 503 : 200;

    return NextResponse.json(
      {
        status: health.overall,
        subsystem: 'iot',
        checks: {
          tuyaCloudApi: {
            status: health.tuyaCloudApi.status,
            latencyMs: health.tuyaCloudApi.latencyMs,
          },
          redis: {
            status: health.redis.status,
            latencyMs: health.redis.latencyMs,
          },
          webSocket: {
            status: health.webSocket.status,
            activeSubscribers: health.webSocket.activeSubscribers,
          },
          deviceSyncLag: {
            status: health.deviceSyncLag.status,
            lagMs: health.deviceSyncLag.lagMs,
          },
        },
        timestamp: health.timestamp.toISOString(),
      },
      { status: httpStatus },
    );
  } catch {
    return NextResponse.json(
      {
        status: 'unhealthy',
        subsystem: 'iot',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
