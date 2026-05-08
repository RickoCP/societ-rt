/**
 * SyncDeviceStatusUseCase — Synchronizes device status from Tuya Cloud.
 *
 * Logic:
 * 1. Fetch current device status from IoT Gateway (Tuya Cloud)
 * 2. Update device status in local repository
 * 3. Detect offline devices (lastSeen > 120s ago and was online)
 * 4. Emit `device_offline` event to Realtime Bus for newly offline devices
 * 5. Return ok(updatedDevice)
 *
 * @see Requirements 37.10, 38.1, 38.9
 */

import type {
  IoTGatewayProtocol,
  RealtimeBusProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { IoTRepository } from '../repositories/IoTRepository';
import type { IoTDevice } from '../entities';
import {
  classifyEventRouting,
  type RealtimeEvent,
} from '@core/domains/realtimeBus/entities/RealtimeEvent';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold in milliseconds for considering a device offline (120 seconds). */
const OFFLINE_THRESHOLD_MS = 120_000;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface SyncDeviceStatusInput {
  readonly tenantId: string;
  readonly deviceId: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SyncDeviceStatusUseCase {
  execute(params: {
    data: SyncDeviceStatusInput;
  }): Promise<DomainResult<IoTDevice>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const SyncDeviceStatusUseCaseImpl = ({
  iotGatewayProtocol,
  iotRepository,
  realtimeBusProtocol,
}: {
  iotGatewayProtocol: IoTGatewayProtocol;
  iotRepository: IoTRepository;
  realtimeBusProtocol: RealtimeBusProtocol;
}): SyncDeviceStatusUseCase => ({
  execute: async ({ data }) => {
    // 1. Fetch current device status from Tuya Cloud
    const statusResult = await iotGatewayProtocol.syncDeviceStatus(
      data.deviceId,
    );

    if (!statusResult.success) {
      return fail(statusResult.error);
    }

    const status = statusResult.data;

    // 2. Detect offline: if lastSeen > 120s ago, mark as offline
    const now = new Date();
    const timeSinceLastSeen = now.getTime() - status.lastSeen.getTime();
    const isOffline = timeSinceLastSeen > OFFLINE_THRESHOLD_MS;
    const effectiveStatus = isOffline ? 'offline' : status.onlineStatus;

    // 3. Update device status in local repository
    const updateResult = await iotRepository.updateStatus(
      data.tenantId,
      data.deviceId,
      effectiveStatus,
      status.batteryLevel,
      status.lastSeen,
    );

    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    const updatedDevice = updateResult.data;

    // 4. If device just went offline (was online, now offline), emit event
    if (isOffline && status.onlineStatus === 'online') {
      const routing = classifyEventRouting(
        'device_offline',
        updatedDevice.householdId,
      );

      const offlineEvent: RealtimeEvent = {
        id: `offline-${data.deviceId}-${now.getTime()}`,
        tenantId: data.tenantId,
        channel: routing.channels[0] ?? 'device_events',
        eventType: 'device_offline',
        payload: {
          deviceId: data.deviceId,
          deviceType: updatedDevice.deviceType,
          deviceName: updatedDevice.name,
          lastSeen: status.lastSeen.toISOString(),
        },
        privacy: routing.privacy,
        targetHouseholdId: routing.targetHouseholdId,
        timestamp: now,
      };

      // Publish to all configured channels (fire-and-forget)
      for (const channel of routing.channels) {
        const namespacedChannel = `${channel}:${data.tenantId}`;
        realtimeBusProtocol
          .publish(namespacedChannel, { ...offlineEvent, channel })
          .catch(() => {
            /* realtime delivery must not block sync */
          });
      }
    }

    // 5. Return updated device
    return ok(updatedDevice);
  },
});
