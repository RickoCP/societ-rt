/**
 * CheckIoTHealthUseCase — Returns the health status of the IoT subsystem.
 *
 * Checks:
 * - Tuya Cloud API connectivity (via IoTGatewayProtocol)
 * - Redis connectivity (via CacheProtocol)
 * - WebSocket server status (via RealtimeBusProtocol)
 * - Device synchronization lag
 *
 * @see Requirements 44.1, 44.5
 */

import type { CacheProtocol, RealtimeBusProtocol, IoTGatewayProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok } from '@core/utils';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type ServiceHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface IoTHealthStatus {
  readonly overall: ServiceHealthStatus;
  readonly tuyaCloudApi: {
    readonly status: ServiceHealthStatus;
    readonly latencyMs: number | null;
  };
  readonly redis: {
    readonly status: ServiceHealthStatus;
    readonly latencyMs: number | null;
  };
  readonly webSocket: {
    readonly status: ServiceHealthStatus;
    readonly activeSubscribers: number;
  };
  readonly deviceSyncLag: {
    readonly status: ServiceHealthStatus;
    readonly lagMs: number | null;
  };
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CheckIoTHealthUseCase {
  execute(): Promise<DomainResult<IoTHealthStatus>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALTH_CHECK_CACHE_KEY = 'iot:health:ping';
const SYNC_LAG_CACHE_KEY = 'iot:sync:last_timestamp';
const MAX_ACCEPTABLE_LAG_MS = 60_000; // 1 minute

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CheckIoTHealthUseCaseImpl = ({
  cacheProtocol,
  iotGatewayProtocol,
  realtimeBusProtocol,
}: {
  cacheProtocol: CacheProtocol;
  iotGatewayProtocol: IoTGatewayProtocol;
  realtimeBusProtocol: RealtimeBusProtocol;
}): CheckIoTHealthUseCase => ({
  execute: async () => {
    const timestamp = new Date();

    // 1. Check Tuya Cloud API connectivity
    const tuyaCloudApi = await checkTuyaCloud(iotGatewayProtocol);

    // 2. Check Redis connectivity
    const redis = await checkRedis(cacheProtocol);

    // 3. Check WebSocket server status
    const webSocket = await checkWebSocket(realtimeBusProtocol);

    // 4. Check device synchronization lag
    const deviceSyncLag = await checkSyncLag(cacheProtocol);

    // Determine overall status
    const statuses = [
      tuyaCloudApi.status,
      redis.status,
      webSocket.status,
      deviceSyncLag.status,
    ];

    let overall: ServiceHealthStatus = 'healthy';
    if (statuses.includes('unhealthy')) {
      overall = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overall = 'degraded';
    }

    return ok({
      overall,
      tuyaCloudApi,
      redis,
      webSocket,
      deviceSyncLag,
      timestamp,
    });
  },
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

async function checkTuyaCloud(
  gateway: IoTGatewayProtocol,
): Promise<{ status: ServiceHealthStatus; latencyMs: number | null }> {
  try {
    const start = Date.now();
    const result = await gateway.refreshToken();
    const latencyMs = Date.now() - start;

    if (result.success) {
      return { status: 'healthy', latencyMs };
    }
    return { status: 'degraded', latencyMs };
  } catch {
    return { status: 'unhealthy', latencyMs: null };
  }
}

async function checkRedis(
  cache: CacheProtocol,
): Promise<{ status: ServiceHealthStatus; latencyMs: number | null }> {
  try {
    const start = Date.now();
    await cache.set(HEALTH_CHECK_CACHE_KEY, 'pong', 10);
    const value = await cache.get<string>(HEALTH_CHECK_CACHE_KEY);
    const latencyMs = Date.now() - start;

    if (value === 'pong') {
      return { status: 'healthy', latencyMs };
    }
    return { status: 'degraded', latencyMs };
  } catch {
    return { status: 'unhealthy', latencyMs: null };
  }
}

async function checkWebSocket(
  bus: RealtimeBusProtocol,
): Promise<{ status: ServiceHealthStatus; activeSubscribers: number }> {
  try {
    const subscriberCount = await bus.getChannelSubscriberCount('iot_events:*');
    return {
      status: 'healthy',
      activeSubscribers: subscriberCount,
    };
  } catch {
    return { status: 'unhealthy', activeSubscribers: 0 };
  }
}

async function checkSyncLag(
  cache: CacheProtocol,
): Promise<{ status: ServiceHealthStatus; lagMs: number | null }> {
  try {
    const lastSync = await cache.get<string>(SYNC_LAG_CACHE_KEY);
    if (!lastSync) {
      return { status: 'degraded', lagMs: null };
    }

    const lagMs = Date.now() - new Date(lastSync).getTime();
    if (lagMs > MAX_ACCEPTABLE_LAG_MS) {
      return { status: 'degraded', lagMs };
    }
    return { status: 'healthy', lagMs };
  } catch {
    return { status: 'unhealthy', lagMs: null };
  }
}
