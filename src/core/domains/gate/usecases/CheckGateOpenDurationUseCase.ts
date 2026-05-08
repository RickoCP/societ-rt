/**
 * CheckGateOpenDurationUseCase — Checks if a gate has been open beyond
 * a configurable threshold and triggers notifications.
 *
 * Logic:
 * 1. Compare open duration against threshold (default: 2 minutes / 120 seconds)
 * 2. If exceeded, trigger `gate_open_too_long` event via Realtime Bus
 * 3. Notify Security_Guard via NotificationQueueProtocol
 *
 * @see Requirements 33.3, 33.4
 */

import type {
  NotificationQueueProtocol,
  RealtimeBusProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok } from '@core/utils';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default open duration threshold in seconds (2 minutes). */
const DEFAULT_OPEN_THRESHOLD_SECONDS = 120;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CheckGateOpenDurationInput {
  readonly tenantId: string;
  readonly gateId: string;
  readonly gateName: string;
  readonly openDurationSeconds: number;
  readonly thresholdSeconds?: number;
}

export interface CheckGateOpenDurationResult {
  readonly exceeded: boolean;
  readonly openDurationSeconds: number;
  readonly thresholdSeconds: number;
}

export interface CheckGateOpenDurationUseCase {
  execute(
    params: CheckGateOpenDurationInput,
  ): Promise<DomainResult<CheckGateOpenDurationResult>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CheckGateOpenDurationUseCaseImpl = ({
  notificationQueueProtocol,
  realtimeBusProtocol,
}: {
  notificationQueueProtocol: NotificationQueueProtocol;
  realtimeBusProtocol: RealtimeBusProtocol;
}): CheckGateOpenDurationUseCase => ({
  execute: async ({
    tenantId,
    gateId,
    gateName,
    openDurationSeconds,
    thresholdSeconds,
  }) => {
    const threshold = thresholdSeconds ?? DEFAULT_OPEN_THRESHOLD_SECONDS;
    const exceeded = openDurationSeconds > threshold;

    if (exceeded) {
      // Publish gate_open_too_long event to Realtime Bus (fire-and-forget)
      const channel = `${EVENT_CHANNELS.GATE_EVENTS}:${tenantId}`;
      realtimeBusProtocol
        .publish(channel, {
          id: `gate_open_too_long_${gateId}_${Date.now()}`,
          tenantId,
          channel: EVENT_CHANNELS.GATE_EVENTS,
          eventType: 'gate_open_too_long',
          payload: {
            gateId,
            gateName,
            openDurationSeconds,
            thresholdSeconds: threshold,
          },
          privacy: 'shared',
          timestamp: new Date(),
        })
        .catch(() => {
          /* realtime delivery must not block the response */
        });

      // Notify Security_Guard via notification queue (fire-and-forget)
      notificationQueueProtocol
        .enqueueNotification({
          tenantId,
          userId: '', // broadcast to Security_Guard role
          type: 'gate_open_too_long',
          title: 'Gerbang Terbuka Terlalu Lama',
          body: `Gerbang "${gateName}" telah terbuka selama ${Math.round(openDurationSeconds / 60)} menit, melebihi batas ${Math.round(threshold / 60)} menit.`,
          channels: ['push', 'inbox'],
        })
        .catch(() => {
          /* notification must not block the response */
        });
    }

    return ok({
      exceeded,
      openDurationSeconds,
      thresholdSeconds: threshold,
    });
  },
});
