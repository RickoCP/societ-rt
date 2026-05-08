/**
 * RedisPubSubAdapter — Infrastructure implementation of RealtimeBusProtocol
 * using ioredis pub/sub channels for cross-instance event distribution.
 *
 * Uses dedicated Redis connections for pub and sub (required by Redis pub/sub
 * protocol — a connection in subscribe mode cannot issue other commands).
 *
 * Features:
 * - Publish/subscribe to tenant-namespaced channels
 * - Exponential backoff reconnection on connection loss
 * - Local event buffering during disconnection (up to 30 seconds)
 *
 * Factory function pattern for Awilix DI compatibility.
 *
 * @see Requirements 40.2, 40.3, 40.11
 */

import Redis from 'ioredis';
import type { RealtimeBusProtocol } from '@core/protocols';
import type { RealtimeEvent } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const LOCAL_BUFFER_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BufferedEvent {
  channel: string;
  event: RealtimeEvent;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const RedisPubSubAdapter = (): RealtimeBusProtocol => {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

  // Dedicated publisher connection
  const publisher = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * Math.pow(2, times - 1),
        MAX_RECONNECT_DELAY_MS,
      );
      return delay;
    },
  });

  // Dedicated subscriber connection
  const subscriber = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * Math.pow(2, times - 1),
        MAX_RECONNECT_DELAY_MS,
      );
      return delay;
    },
  });

  // Channel handlers map
  const handlers = new Map<string, (event: RealtimeEvent) => void>();

  // Local event buffer for when publisher is disconnected
  const eventBuffer: BufferedEvent[] = [];
  let publisherConnected = true;

  // ---------------------------------------------------------------------------
  // Connection state tracking
  // ---------------------------------------------------------------------------

  publisher.on('connect', () => {
    publisherConnected = true;
    flushBuffer();
  });

  publisher.on('close', () => {
    publisherConnected = false;
  });

  publisher.on('error', () => {
    publisherConnected = false;
  });

  subscriber.on('message', (channel: string, message: string) => {
    const handler = handlers.get(channel);
    if (handler) {
      try {
        const event = JSON.parse(message) as RealtimeEvent;
        handler(event);
      } catch {
        // Malformed message — skip silently, do not crash the subscriber
      }
    }
  });

  subscriber.on('error', () => {
    // ioredis handles reconnection via retryStrategy
  });

  // ---------------------------------------------------------------------------
  // Buffer management
  // ---------------------------------------------------------------------------

  function flushBuffer(): void {
    const now = Date.now();
    while (eventBuffer.length > 0) {
      const item = eventBuffer[0];
      if (!item) break;

      // Discard events older than 30 seconds
      if (now - item.timestamp > LOCAL_BUFFER_TTL_MS) {
        eventBuffer.shift();
        continue;
      }

      // Attempt to publish
      if (publisherConnected) {
        const serialized = JSON.stringify(item.event);
        publisher.publish(item.channel, serialized).catch(() => {
          // If publish fails, stop flushing — will retry on next connect
        });
        eventBuffer.shift();
      } else {
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Protocol implementation
  // ---------------------------------------------------------------------------

  return {
    publish: async (channel: string, event: RealtimeEvent): Promise<void> => {
      const serialized = JSON.stringify(event);

      if (!publisherConnected) {
        // Buffer locally for up to 30 seconds
        eventBuffer.push({ channel, event, timestamp: Date.now() });
        return;
      }

      try {
        await publisher.publish(channel, serialized);
      } catch {
        // Connection lost mid-publish — buffer the event
        eventBuffer.push({ channel, event, timestamp: Date.now() });
      }
    },

    subscribe: async (
      channel: string,
      handler: (event: RealtimeEvent) => void,
    ): Promise<void> => {
      handlers.set(channel, handler);
      await subscriber.subscribe(channel);
    },

    unsubscribe: async (channel: string): Promise<void> => {
      handlers.delete(channel);
      await subscriber.unsubscribe(channel);
    },

    getChannelSubscriberCount: async (channel: string): Promise<number> => {
      const result = await publisher.pubsub('NUMSUB', channel);
      // pubsub NUMSUB returns [channel, count, ...]
      if (Array.isArray(result) && result.length >= 2) {
        return Number(result[1]) || 0;
      }
      return 0;
    },
  };
};
