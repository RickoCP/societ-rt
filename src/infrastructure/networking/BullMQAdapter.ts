/**
 * BullMQAdapter — Infrastructure implementation of QueueProtocol using BullMQ.
 *
 * Factory function pattern for Awilix DI compatibility.
 * Creates/reuses Queue instances per jobType.
 * Reads REDIS_URL from environment for BullMQ connection.
 *
 * @see Requirements 23.1, 26.1
 */

import { Queue } from 'bullmq';
import type { QueueProtocol, JobOptions } from '@core/protocols';

function parseRedisConnection(): { host: string; port: number } {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
  };
}

export const BullMQAdapter = (): QueueProtocol => {
  const queues = new Map<string, Queue>();
  const connection = parseRedisConnection();

  function getQueue(jobType: string): Queue {
    let queue = queues.get(jobType);
    if (!queue) {
      queue = new Queue(jobType, { connection });
      queues.set(jobType, queue);
    }
    return queue;
  }

  return {
    enqueue: async <T>(
      jobType: string,
      payload: T,
      options?: JobOptions,
    ): Promise<string> => {
      const queue = getQueue(jobType);
      const job = await queue.add(jobType, payload, {
        delay: options?.delay,
        attempts: options?.attempts,
        backoff: options?.backoff
          ? { type: options.backoff.type, delay: options.backoff.delay }
          : undefined,
        jobId: options?.jobId,
        priority: options?.priority,
      });
      return job.id ?? '';
    },
  };
};
