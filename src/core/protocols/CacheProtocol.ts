/**
 * CacheProtocol — Core abstraction for key-value caching.
 *
 * Infrastructure layer provides the concrete implementation (e.g. Redis).
 */

export interface CacheProtocol {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
}
