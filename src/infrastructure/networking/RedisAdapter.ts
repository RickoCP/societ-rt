/**
 * RedisAdapter — Infrastructure implementation of CacheProtocol using ioredis.
 *
 * Factory function pattern for Awilix DI compatibility.
 * Reads REDIS_URL from environment.
 *
 * @see Requirements 23.1, 26.1
 */

import Redis from 'ioredis';
import type { CacheProtocol } from '@core/protocols';

let redisInstance: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisInstance) {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    redisInstance = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      // Bound reconnection attempts so an unreachable host (bad DNS, deleted
      // instance) does not retry forever and flood the logs. After the cap,
      // ioredis stops reconnecting and surfaces errors on each command.
      retryStrategy: (times: number): number | null => {
        if (times > 10) {
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    // ioredis emits 'error' on every failed connection attempt. Without a
    // listener, Node treats these as *unhandled* error events (the flood of
    // "[ioredis] Unhandled error event" lines). Attach a handler so the
    // failure is logged once per occurrence and never crashes the process.
    // The cache is non-critical: callers degrade gracefully (see get/set
    // error handling below), so we log rather than throw here.
    redisInstance.on('error', (err: Error & { code?: string }) => {
      // Keep internal detail out of any user-facing path; this is dev/ops log
      // context only, per the Error Handling Guideline (internal != user msg).
      // eslint-disable-next-line no-console
      console.error(
        `[RedisAdapter] connection error (code=${err.code ?? 'UNKNOWN'}): ${err.message}`,
      );
    });
  }
  return redisInstance;
}

export const RedisAdapter = (): CacheProtocol => {
  const client = getRedisClient();

  // The cache is a non-critical optimization. If Redis is unreachable we fail
  // securely: reads behave as cache misses and writes/deletes become no-ops,
  // so the application continues to work (serving from source of truth) rather
  // than throwing and breaking request handlers.
  const logFailure = (op: string, err: unknown): void => {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[RedisAdapter] ${op} failed, degrading gracefully: ${message}`);
  };

  return {
    get: async <T>(key: string): Promise<T | null> => {
      try {
        const raw = await client.get(key);
        if (raw === null) {
          return null;
        }
        return JSON.parse(raw) as T;
      } catch (err) {
        logFailure('get', err);
        return null;
      }
    },

    set: async <T>(
      key: string,
      value: T,
      ttlSeconds?: number,
    ): Promise<void> => {
      try {
        const serialized = JSON.stringify(value);
        if (ttlSeconds !== undefined && ttlSeconds > 0) {
          await client.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await client.set(key, serialized);
        }
      } catch (err) {
        logFailure('set', err);
      }
    },

    delete: async (key: string): Promise<void> => {
      try {
        await client.del(key);
      } catch (err) {
        logFailure('delete', err);
      }
    },

    invalidatePattern: async (pattern: string): Promise<void> => {
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await client.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100,
          );
          cursor = nextCursor;
          if (keys.length > 0) {
            await client.del(...keys);
          }
        } while (cursor !== '0');
      } catch (err) {
        logFailure('invalidatePattern', err);
      }
    },
  };
};
