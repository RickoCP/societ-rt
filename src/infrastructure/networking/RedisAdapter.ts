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
    redisInstance = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }
  return redisInstance;
}

export const RedisAdapter = (): CacheProtocol => {
  const client = getRedisClient();

  return {
    get: async <T>(key: string): Promise<T | null> => {
      const raw = await client.get(key);
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as T;
    },

    set: async <T>(
      key: string,
      value: T,
      ttlSeconds?: number,
    ): Promise<void> => {
      const serialized = JSON.stringify(value);
      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        await client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await client.set(key, serialized);
      }
    },

    delete: async (key: string): Promise<void> => {
      await client.del(key);
    },

    invalidatePattern: async (pattern: string): Promise<void> => {
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
    },
  };
};
