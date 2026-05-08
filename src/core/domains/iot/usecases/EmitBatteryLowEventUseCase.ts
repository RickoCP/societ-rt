/**
 * EmitBatteryLowEventUseCase — When battery drops below 20%, emit a
 * `battery_low` event via the realtime bus and notify the Home_Owner.
 *
 * @see Requirements 44.2, 44.3
 */

import type { RealtimeBusProtocol, NotificationQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok } from '@core/utils';
import type { IoTRepository } from '../repositories/IoTRepository';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface EmitBatteryLowInput {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly batteryLevel: number;
  readonly ownerUserId: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface BatteryLowResult {
  readonly emitted: boolean;
  readonly batteryLevel: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EmitBatteryLowEventUseCase {
  execute(params: EmitBatteryLowInput): Promise<DomainResult<BatteryLowResult>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATTERY_LOW_THRESHOLD = 20;

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const EmitBatteryLowEventUseCaseImpl = ({
  iotRepository,
  realtimeBusProtocol,
  notificationQueueProtocol,
}: {
  iotRepository: IoTRepository;
  realtimeBusProtocol: RealtimeBusProtocol;
  notificationQueueProtocol: NotificationQueueProtocol;
}): EmitBatteryLowEventUseCase => ({
  execute: async ({ tenantId, deviceId, deviceName, batteryLevel, ownerUserId }) => {
    // Only emit if battery is below threshold
    if (batteryLevel >= BATTERY_LOW_THRESHOLD) {
      return ok({ emitted: false, batteryLevel });
    }

    // 1. Create a battery_low device event record
    await iotRepository.createDeviceEvent(tenantId, {
      deviceId,
      eventType: 'battery_low',
      payload: { batteryLevel, threshold: BATTERY_LOW_THRESHOLD },
      isSharedSecurity: false,
    });

    // 2. Emit battery_low event via realtime bus
    await realtimeBusProtocol.publish(`device_events:${tenantId}`, {
      id: crypto.randomUUID(),
      tenantId,
      channel: `device_events:${tenantId}`,
      eventType: 'battery_low',
      payload: {
        deviceId,
        deviceName,
        batteryLevel,
        threshold: BATTERY_LOW_THRESHOLD,
      },
      privacy: 'private' as const,
      timestamp: new Date(),
    });

    // 3. Notify the Home_Owner
    await notificationQueueProtocol.enqueueNotification({
      tenantId,
      userId: ownerUserId,
      type: 'battery_low',
      title: 'Baterai Perangkat Rendah',
      body: `Perangkat "${deviceName}" memiliki baterai rendah (${batteryLevel}%). Segera ganti baterai.`,
      channels: ['push', 'inbox'],
    });

    return ok({ emitted: true, batteryLevel });
  },
});
