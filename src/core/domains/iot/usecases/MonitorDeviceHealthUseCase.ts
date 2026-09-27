/**
 * MonitorDeviceHealthUseCase — Tracks online/offline status, last heartbeat,
 * battery level, signal strength, error count per device.
 *
 * Returns a health snapshot for a specific device within a tenant.
 *
 * @see Requirements 44.1, 44.2, 44.3
 */

import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId } from '@core/domains/authorization/types/AuthContextCompat';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import { notFoundError } from '@core/utils';
import type { IoTRepository } from '../repositories/IoTRepository';
import type { IoTDeviceOnlineStatus } from '../entities';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface DeviceHealthSnapshot {
  readonly deviceId: string;
  readonly tenantId: string;
  readonly onlineStatus: IoTDeviceOnlineStatus;
  readonly lastHeartbeat: Date;
  readonly batteryLevel: number | null;
  readonly signalStrength: number | null;
  readonly errorCount: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface MonitorDeviceHealthUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    deviceId: string;
  }): Promise<DomainResult<DeviceHealthSnapshot>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const MonitorDeviceHealthUseCaseImpl = ({
  iotRepository,
}: {
  iotRepository: IoTRepository;
}): MonitorDeviceHealthUseCase => ({
  execute: async ({ authContext, deviceId }) => {
    const tenantId = getTenantId(authContext);

    // 1. Find device events to compute error count
    const eventsResult = await iotRepository.findEventsByDevice(
      tenantId,
      deviceId,
      100,
    );

    if (!eventsResult.success) {
      return fail(eventsResult.error);
    }

    const events = eventsResult.data;

    // 2. Compute error count from recent events
    const errorEvents = events.filter(
      e =>
        e.eventType === 'device_offline' ||
        e.eventType === 'battery_low' ||
        e.eventType === 'alarm_triggered',
    );

    // 3. Derive health info from most recent event
    const lastEvent = events[0];
    if (!lastEvent) {
      return fail(
        notFoundError(
          'IOT_DEVICE_NOT_FOUND',
          `No health data found for device ${deviceId}`,
          {
            userMessage: 'Data kesehatan perangkat tidak ditemukan.',
          },
        ),
      );
    }

    // Extract signal strength from event payload if available
    const signalStrength =
      (lastEvent.payload?.signalStrength as number) ?? null;

    // Determine online status from most recent event
    const onlineStatus: IoTDeviceOnlineStatus =
      lastEvent.eventType === 'device_offline' ? 'offline' : 'online';

    // Extract battery level from payload if available
    const batteryLevel =
      (lastEvent.payload?.batteryLevel as number) ?? null;

    const snapshot: DeviceHealthSnapshot = {
      deviceId,
      tenantId,
      onlineStatus,
      lastHeartbeat: lastEvent.createdAt,
      batteryLevel,
      signalStrength,
      errorCount: errorEvents.length,
    };

    return ok(snapshot);
  },
});
