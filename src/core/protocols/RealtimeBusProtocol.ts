/**
 * RealtimeBusProtocol — Core abstraction for the realtime event bus
 * (Redis pub/sub).
 *
 * Infrastructure layer provides the concrete implementation using ioredis
 * pub/sub channels for cross-instance event distribution.
 *
 * @see Requirements 40.2, 40.3
 */

import type { RealtimeEvent } from '@core/domains/realtimeBus/entities';

export interface RealtimeBusProtocol {
  /** Publish an event to a channel. */
  publish(channel: string, event: RealtimeEvent): Promise<void>;

  /** Subscribe to a channel with a handler invoked on each incoming event. */
  subscribe(
    channel: string,
    handler: (event: RealtimeEvent) => void,
  ): Promise<void>;

  /** Unsubscribe from a channel. */
  unsubscribe(channel: string): Promise<void>;

  /** Get the number of subscribers currently listening on a channel. */
  getChannelSubscriberCount(channel: string): Promise<number>;
}
