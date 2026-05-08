/**
 * ProcessWebhookEventUseCase — Processes incoming Tuya webhook events.
 *
 * Logic:
 * 1. Validate webhook signature via IoTGatewayProtocol
 * 2. Parse event payload and resolve tenant + device
 * 3. Classify event as shared (security) or private (home)
 * 4. Persist device event in repository
 * 5. Publish event to Realtime Bus with correct routing
 * 6. Return ok(deviceEvent)
 *
 * @see Requirements 38.4, 38.5, 38.9, 38.11, 41.1, 41.4, 41.5
 */

import type {
  IoTGatewayProtocol,
  RealtimeBusProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import { notFoundError } from '@core/utils';
import type { IoTRepository } from '../repositories/IoTRepository';
import type { DeviceEvent, DeviceEventType } from '../entities';
import { iotWebhookSignatureInvalid } from '../errors/iotErrors';
import {
  classifyEventRouting,
  type RealtimeEvent,
} from '@core/domains/realtimeBus/entities/RealtimeEvent';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ProcessWebhookEventInput {
  readonly payload: string;
  readonly signature: string;
  readonly timestamp: string;
  readonly eventType: DeviceEventType;
  readonly tuyaDeviceId: string;
  readonly eventData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ProcessWebhookEventUseCase {
  execute(params: {
    data: ProcessWebhookEventInput;
  }): Promise<DomainResult<DeviceEvent>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ProcessWebhookEventUseCaseImpl = ({
  iotGatewayProtocol,
  iotRepository,
  realtimeBusProtocol,
}: {
  iotGatewayProtocol: IoTGatewayProtocol;
  iotRepository: IoTRepository;
  realtimeBusProtocol: RealtimeBusProtocol;
}): ProcessWebhookEventUseCase => ({
  execute: async ({ data }) => {
    // 1. Validate webhook signature
    const isValid = iotGatewayProtocol.validateWebhookSignature(
      data.payload,
      data.signature,
      data.timestamp,
    );

    if (!isValid) {
      return fail(iotWebhookSignatureInvalid());
    }

    // 2. Resolve tenant + device from tuyaDeviceId
    const deviceResult = await iotRepository.findByTuyaId(data.tuyaDeviceId);

    if (!deviceResult.success) {
      return fail(deviceResult.error);
    }

    const device = deviceResult.data;

    if (!device) {
      return fail(
        notFoundError(
          'IOT_DEVICE_NOT_FOUND',
          `Device with Tuya ID ${data.tuyaDeviceId} not found in registry`,
        ),
      );
    }

    // 3. Classify event as shared (security) or private (home)
    const routing = classifyEventRouting(data.eventType, device.householdId);

    // 4. Persist device event in repository
    const eventResult = await iotRepository.createDeviceEvent(
      device.tenantId,
      {
        deviceId: device.id,
        eventType: data.eventType,
        payload: data.eventData,
        isSharedSecurity: routing.privacy === 'shared',
      },
    );

    if (!eventResult.success) {
      return fail(eventResult.error);
    }

    const deviceEvent = eventResult.data;

    // 5. Publish event to Realtime Bus with correct routing
    const realtimeEvent: RealtimeEvent = {
      id: deviceEvent.id,
      tenantId: device.tenantId,
      channel: routing.channels[0] ?? 'device_events',
      eventType: data.eventType,
      payload: {
        ...data.eventData,
        deviceId: device.id,
        deviceType: device.deviceType,
        deviceName: device.name,
      },
      privacy: routing.privacy,
      targetHouseholdId: routing.targetHouseholdId,
      timestamp: new Date(),
    };

    // Publish to all configured channels (fire-and-forget)
    for (const channel of routing.channels) {
      const namespacedChannel = `${channel}:${device.tenantId}`;
      realtimeBusProtocol
        .publish(namespacedChannel, { ...realtimeEvent, channel })
        .catch(() => {
          /* realtime delivery must not block webhook processing */
        });
    }

    // 6. Return success
    return ok(deviceEvent);
  },
});
