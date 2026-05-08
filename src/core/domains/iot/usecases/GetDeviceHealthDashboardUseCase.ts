/**
 * GetDeviceHealthDashboardUseCase — Returns a health dashboard summary
 * for all IoT devices within a tenant.
 *
 * Includes: total devices, online/offline ratio, low battery devices,
 * high error rate devices, and last sync timestamp.
 *
 * @see Requirements 44.1, 44.4, 44.5
 */

import type { AuthContext } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { IoTRepository } from '../repositories/IoTRepository';
import type { IoTDevice } from '../entities';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface DeviceHealthDashboard {
  readonly tenantId: string;
  readonly totalDevices: number;
  readonly onlineCount: number;
  readonly offlineCount: number;
  readonly onlineRatio: number;
  readonly lowBatteryDevices: ReadonlyArray<{
    deviceId: string;
    name: string;
    batteryLevel: number;
  }>;
  readonly highErrorRateDevices: ReadonlyArray<{
    deviceId: string;
    name: string;
    errorCount: number;
  }>;
  readonly lastSyncTimestamp: Date | null;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetDeviceHealthDashboardUseCase {
  execute(params: {
    authContext: AuthContext;
    householdId?: string;
  }): Promise<DomainResult<DeviceHealthDashboard>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOW_BATTERY_THRESHOLD = 20;
const HIGH_ERROR_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetDeviceHealthDashboardUseCaseImpl = ({
  iotRepository,
}: {
  iotRepository: IoTRepository;
}): GetDeviceHealthDashboardUseCase => ({
  execute: async ({ authContext, householdId }) => {
    // If householdId is not provided, return empty dashboard
    if (!householdId) {
      return ok({
        tenantId: authContext.tenantId,
        totalDevices: 0,
        onlineCount: 0,
        offlineCount: 0,
        onlineRatio: 0,
        lowBatteryDevices: [],
        highErrorRateDevices: [],
        lastSyncTimestamp: null,
      });
    }

    const devicesResult = await iotRepository.findByHousehold(
      authContext.tenantId,
      householdId,
    );

    if (!devicesResult.success) {
      return fail(devicesResult.error);
    }

    const devices: IoTDevice[] = devicesResult.data;
    const totalDevices = devices.length;
    const onlineCount = devices.filter(d => d.onlineStatus === 'online').length;
    const offlineCount = totalDevices - onlineCount;
    const onlineRatio = totalDevices > 0 ? onlineCount / totalDevices : 0;

    // Low battery devices (below threshold)
    const lowBatteryDevices = devices
      .filter(
        d => d.batteryLevel !== null && d.batteryLevel < LOW_BATTERY_THRESHOLD,
      )
      .map(d => ({
        deviceId: d.id,
        name: d.name,
        batteryLevel: d.batteryLevel as number,
      }));

    // High error rate devices - check events for each device
    const highErrorRateDevices: Array<{
      deviceId: string;
      name: string;
      errorCount: number;
    }> = [];

    for (const device of devices) {
      const eventsResult = await iotRepository.findEventsByDevice(
        authContext.tenantId,
        device.id,
        50,
      );

      if (eventsResult.success) {
        const errorCount = eventsResult.data.filter(
          e =>
            e.eventType === 'device_offline' ||
            e.eventType === 'battery_low' ||
            e.eventType === 'alarm_triggered',
        ).length;

        if (errorCount >= HIGH_ERROR_THRESHOLD) {
          highErrorRateDevices.push({
            deviceId: device.id,
            name: device.name,
            errorCount,
          });
        }
      }
    }

    // Last sync timestamp is the most recent lastSeen across all devices
    const lastSyncTimestamp =
      devices.length > 0
        ? devices.reduce(
            (latest, d) => (d.lastSeen > latest ? d.lastSeen : latest),
            devices[0].lastSeen,
          )
        : null;

    return ok({
      tenantId: authContext.tenantId,
      totalDevices,
      onlineCount,
      offlineCount,
      onlineRatio,
      lowBatteryDevices,
      highErrorRateDevices,
      lastSyncTimestamp,
    });
  },
});
