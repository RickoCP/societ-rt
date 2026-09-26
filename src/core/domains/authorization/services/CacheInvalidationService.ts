/**
 * CacheInvalidationService — Handles authorization cache invalidation.
 *
 * This service implements cache invalidation strategy per Requirements 29 and O3:
 * - Cache invalidation on membership change (create, update, revoke, suspend)
 * - Cache invalidation on permission change
 * - TTL-based cache expiration
 * - Invalidation propagation across related caches
 *
 * **CRITICAL DESIGN DECISIONS:**
 * - Cache invalidation MUST be triggered within 1 second of state change (Req 1.5)
 * - Authorization context cache uses user+tenant+orgUnit as composite key
 * - TTL-based expiration provides defense-in-depth against stale cache
 * - Invalidation propagation ensures related caches are cleared together
 *
 * **Cache Key Strategy:**
 * - Membership cache: `membership:{userId}:{tenantId}:{orgUnitId}`
 * - Permission cache: `permission:{role}`
 * - Authorization context cache: `auth-context:{userId}:{tenantId}:{orgUnitId}`
 * - User cache: `user:{userId}`
 *
 * **Invalidation Triggers:**
 * - Membership created → invalidate user cache + auth context
 * - Membership updated → invalidate membership + auth context + user cache
 * - Membership revoked → invalidate all user caches for tenant
 * - Membership suspended → invalidate membership + auth context
 * - Permission changed → invalidate all permission caches + affected auth contexts
 * - Token version changed → invalidate all user auth contexts
 *
 * **NOTE:** This implementation provides the interface and in-memory implementation.
 * Production use should integrate with Redis or other distributed cache (O3 pending).
 *
 * @see Requirements 29, O3 (Authorization Cache TTL and Invalidation)
 * @see Requirement 1.5 — Cache invalidation within 1 second
 * @see Design Components and Interfaces > Authorization Pipeline
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import {
  cacheInvalidationFailed,
  cachePropagationFailed,
  invalidCacheKey,
  cacheOperationTimeout,
} from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Cache key types for authorization-related caches.
 */
export enum CacheKeyType {
  /** Membership data cache: `membership:{userId}:{tenantId}:{orgUnitId}` */
  MEMBERSHIP = 'membership',
  /** Permission registry cache: `permission:{role}` */
  PERMISSION = 'permission',
  /** Authorization context cache: `auth-context:{userId}:{tenantId}:{orgUnitId}` */
  AUTH_CONTEXT = 'auth-context',
  /** User data cache: `user:{userId}` */
  USER = 'user',
  /** Tenant-level cache: `tenant:{tenantId}` */
  TENANT = 'tenant',
  /** OrgUnit hierarchy cache: `orgunit:{tenantId}:{orgUnitId}` */
  ORGUNIT = 'orgunit',
}

/**
 * Parsed cache key structure.
 */
export interface CacheKey {
  /** The type of cache key */
  readonly type: CacheKeyType;
  /** The raw key string */
  readonly key: string;
  /** User ID component (if applicable) */
  readonly userId?: string;
  /** Tenant ID component (if applicable) */
  readonly tenantId?: string;
  /** OrgUnit ID component (if applicable) */
  readonly orgUnitId?: string | null;
  /** Role component (if applicable) */
  readonly role?: MembershipRole;
}

/**
 * Cache invalidation event types.
 */
export enum InvalidationEventType {
  /** Membership was created */
  MEMBERSHIP_CREATED = 'MEMBERSHIP_CREATED',
  /** Membership status was updated */
  MEMBERSHIP_STATUS_CHANGED = 'MEMBERSHIP_STATUS_CHANGED',
  /** Membership role was updated */
  MEMBERSHIP_ROLE_CHANGED = 'MEMBERSHIP_ROLE_CHANGED',
  /** Membership was revoked */
  MEMBERSHIP_REVOKED = 'MEMBERSHIP_REVOKED',
  /** Membership was suspended */
  MEMBERSHIP_SUSPENDED = 'MEMBERSHIP_SUSPENDED',
  /** Membership was reactivated */
  MEMBERSHIP_REACTIVATED = 'MEMBERSHIP_REACTIVATED',
  /** Permission registry was updated */
  PERMISSION_CHANGED = 'PERMISSION_CHANGED',
  /** User token version was changed (force logout) */
  TOKEN_VERSION_CHANGED = 'TOKEN_VERSION_CHANGED',
  /** Tenant-wide cache clear */
  TENANT_CACHE_CLEAR = 'TENANT_CACHE_CLEAR',
  /** User-specific cache clear */
  USER_CACHE_CLEAR = 'USER_CACHE_CLEAR',
  /** OrgUnit hierarchy changed */
  ORGUNIT_CHANGED = 'ORGUNIT_CHANGED',
  /** TTL-based expiration */
  TTL_EXPIRED = 'TTL_EXPIRED',
}

/**
 * Cache invalidation event payload.
 */
export interface InvalidationEvent {
  /** Event type */
  readonly type: InvalidationEventType;
  /** Timestamp of the event */
  readonly timestamp: Date;
  /** User ID affected (if applicable) */
  readonly userId?: string;
  /** Tenant ID affected (if applicable) */
  readonly tenantId?: string;
  /** OrgUnit ID affected (if applicable) */
  readonly orgUnitId?: string | null;
  /** Role affected (for permission changes) */
  readonly role?: MembershipRole;
  /** Old status (for status changes) */
  readonly oldStatus?: MembershipStatus;
  /** New status (for status changes) */
  readonly newStatus?: MembershipStatus;
  /** Old role (for role changes) */
  readonly oldRole?: MembershipRole;
  /** New role (for role changes) */
  readonly newRole?: MembershipRole;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Cache invalidation result.
 */
export interface InvalidationResult {
  /** Number of cache entries invalidated */
  readonly invalidatedCount: number;
  /** Cache keys that were invalidated */
  readonly invalidatedKeys: readonly string[];
  /** Time taken for invalidation (ms) */
  readonly durationMs: number;
  /** Whether propagation was successful */
  readonly propagationSuccessful: boolean;
  /** Any propagation errors (if partial failure) */
  readonly propagationErrors?: readonly string[];
}

/**
 * Cache entry with TTL metadata.
 */
export interface CacheEntry<T> {
  /** The cached value */
  readonly value: T;
  /** When the entry was created */
  readonly createdAt: Date;
  /** When the entry expires (TTL) */
  readonly expiresAt: Date;
  /** The cache key */
  readonly key: string;
  /** Cache key type */
  readonly type: CacheKeyType;
}

/**
 * Cache TTL configuration.
 */
export interface CacheTTLConfig {
  /** TTL for membership cache (default: 5 minutes) */
  readonly membershipTTLMs: number;
  /** TTL for permission cache (default: 10 minutes) */
  readonly permissionTTLMs: number;
  /** TTL for authorization context cache (default: 1 minute) */
  readonly authContextTTLMs: number;
  /** TTL for user cache (default: 5 minutes) */
  readonly userTTLMs: number;
  /** TTL for tenant cache (default: 10 minutes) */
  readonly tenantTTLMs: number;
  /** TTL for OrgUnit cache (default: 10 minutes) */
  readonly orgUnitTTLMs: number;
}

/**
 * Default TTL configuration.
 */
export const DEFAULT_CACHE_TTL_CONFIG: CacheTTLConfig = {
  membershipTTLMs: 5 * 60 * 1000,      // 5 minutes
  permissionTTLMs: 10 * 60 * 1000,     // 10 minutes
  authContextTTLMs: 1 * 60 * 1000,     // 1 minute (shorter for security)
  userTTLMs: 5 * 60 * 1000,            // 5 minutes
  tenantTTLMs: 10 * 60 * 1000,         // 10 minutes
  orgUnitTTLMs: 10 * 60 * 1000,        // 10 minutes
};

/**
 * Interface for invalidation event listeners.
 */
export interface IInvalidationEventListener {
  /**
   * Called when an invalidation event occurs.
   * @param event - The invalidation event
   * @param result - The invalidation result
   */
  onInvalidation(event: InvalidationEvent, result: InvalidationResult): Promise<void>;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Total entries in cache */
  readonly totalEntries: number;
  /** Number of hits */
  readonly hits: number;
  /** Number of misses */
  readonly misses: number;
  /** Number of invalidations */
  readonly invalidations: number;
  /** Number of TTL expirations */
  readonly ttlExpirations: number;
  /** Hit rate (hits / (hits + misses)) */
  readonly hitRate: number;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * ICacheInvalidationService — Service interface for cache invalidation.
 *
 * This service provides methods for invalidating authorization-related caches
 * when membership, permission, or other authorization state changes.
 */
export interface ICacheInvalidationService {
  // -------------------------------------------------------------------------
  // Membership Invalidation
  // -------------------------------------------------------------------------

  /**
   * Invalidate cache on membership creation.
   *
   * Clears:
   * - User cache for the affected user
   * - Authorization context cache for user+tenant+orgUnit
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param orgUnitId - The OrgUnit ID (null for tenant-level)
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateOnMembershipCreated(
    userId: string,
    tenantId: string,
    orgUnitId: string | null,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  /**
   * Invalidate cache on membership status change.
   *
   * Clears:
   * - Membership cache for the affected membership
   * - Authorization context cache for user+tenant+orgUnit
   * - User cache for the affected user
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param orgUnitId - The OrgUnit ID (null for tenant-level)
   * @param oldStatus - The previous status
   * @param newStatus - The new status
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateOnMembershipStatusChanged(
    userId: string,
    tenantId: string,
    orgUnitId: string | null,
    oldStatus: MembershipStatus,
    newStatus: MembershipStatus,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  /**
   * Invalidate cache on membership role change.
   *
   * Clears:
   * - Membership cache for the affected membership
   * - Authorization context cache for user+tenant+orgUnit
   * - User cache for the affected user
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param orgUnitId - The OrgUnit ID (null for tenant-level)
   * @param oldRole - The previous role
   * @param newRole - The new role
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateOnMembershipRoleChanged(
    userId: string,
    tenantId: string,
    orgUnitId: string | null,
    oldRole: MembershipRole,
    newRole: MembershipRole,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  /**
   * Invalidate cache on membership revocation.
   *
   * Clears ALL caches for the user in the tenant:
   * - All membership caches for the user in the tenant
   * - All authorization context caches for the user in the tenant
   * - User cache for the affected user
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateOnMembershipRevoked(
    userId: string,
    tenantId: string,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  /**
   * Invalidate cache on membership suspension.
   *
   * Clears:
   * - Membership cache for the affected membership
   * - Authorization context cache for user+tenant+orgUnit
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param orgUnitId - The OrgUnit ID (null for tenant-level)
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateOnMembershipSuspended(
    userId: string,
    tenantId: string,
    orgUnitId: string | null,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  // -------------------------------------------------------------------------
  // Permission Invalidation
  // -------------------------------------------------------------------------

  /**
   * Invalidate cache on permission change.
   *
   * Clears:
   * - Permission cache for the affected role
   * - All authorization context caches for users with the affected role
   *
   * @param role - The role whose permissions changed
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateOnPermissionChanged(
    role: MembershipRole,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  /**
   * Invalidate all permission caches.
   *
   * Used when the permission registry is reloaded or bulk updated.
   *
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateAllPermissions(
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  // -------------------------------------------------------------------------
  // Token/Session Invalidation
  // -------------------------------------------------------------------------

  /**
   * Invalidate cache on token version change (force logout).
   *
   * Clears ALL authorization context caches for the user across all tenants.
   *
   * @param userId - The user ID
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateOnTokenVersionChanged(
    userId: string,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  /**
   * Invalidate all caches for a user in a tenant (tenant logout).
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateUserTenantCaches(
    userId: string,
    tenantId: string,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  // -------------------------------------------------------------------------
  // Tenant/OrgUnit Invalidation
  // -------------------------------------------------------------------------

  /**
   * Invalidate all caches for a tenant.
   *
   * Used for tenant-wide events like subscription suspension.
   *
   * @param tenantId - The tenant ID
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateTenantCaches(
    tenantId: string,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  /**
   * Invalidate cache on OrgUnit hierarchy change.
   *
   * Clears:
   * - OrgUnit cache for the affected OrgUnit and descendants
   * - Authorization context caches for users scoped to affected OrgUnits
   *
   * @param tenantId - The tenant ID
   * @param orgUnitId - The OrgUnit ID that changed
   * @param correlationId - Optional correlation ID for tracing
   * @returns DomainResult with invalidation result
   */
  invalidateOnOrgUnitChanged(
    tenantId: string,
    orgUnitId: string,
    correlationId?: string,
  ): Promise<DomainResult<InvalidationResult>>;

  // -------------------------------------------------------------------------
  // TTL Management
  // -------------------------------------------------------------------------

  /**
   * Check and expire TTL-based cache entries.
   *
   * This should be called periodically (e.g., every minute) to clean up
   * expired entries.
   *
   * @returns DomainResult with number of expired entries
   */
  expireTTLEntries(): Promise<DomainResult<InvalidationResult>>;

  /**
   * Get the current TTL configuration.
   */
  getTTLConfig(): CacheTTLConfig;

  /**
   * Update the TTL configuration.
   *
   * @param config - Partial config to merge
   */
  updateTTLConfig(config: Partial<CacheTTLConfig>): void;

  // -------------------------------------------------------------------------
  // Cache Key Utilities
  // -------------------------------------------------------------------------

  /**
   * Build a cache key from components.
   *
   * @param type - The cache key type
   * @param components - Key components based on type
   * @returns The constructed cache key
   */
  buildCacheKey(
    type: CacheKeyType,
    components: {
      userId?: string;
      tenantId?: string;
      orgUnitId?: string | null;
      role?: MembershipRole;
    },
  ): string;

  /**
   * Parse a cache key into its components.
   *
   * @param key - The cache key string
   * @returns DomainResult with parsed cache key or error
   */
  parseCacheKey(key: string): DomainResult<CacheKey>;

  /**
   * Build a pattern for matching cache keys.
   *
   * @param type - The cache key type
   * @param pattern - Wildcard pattern components (* for any)
   * @returns The pattern string
   */
  buildCacheKeyPattern(
    type: CacheKeyType,
    pattern: {
      userId?: string;
      tenantId?: string;
      orgUnitId?: string | null | '*';
      role?: MembershipRole | '*';
    },
  ): string;

  // -------------------------------------------------------------------------
  // Propagation Management
  // -------------------------------------------------------------------------

  /**
   * Propagate invalidation to related caches.
   *
   * Called internally after primary invalidation to clear related caches.
   *
   * @param event - The invalidation event
   * @param primaryKeys - Keys that were already invalidated
   * @returns DomainResult with additional invalidation result
   */
  propagateInvalidation(
    event: InvalidationEvent,
    primaryKeys: readonly string[],
  ): Promise<DomainResult<InvalidationResult>>;

  // -------------------------------------------------------------------------
  // Event Listeners
  // -------------------------------------------------------------------------

  /**
   * Register an event listener for invalidation events.
   *
   * @param listener - The listener to register
   */
  addInvalidationListener(listener: IInvalidationEventListener): void;

  /**
   * Remove an event listener.
   *
   * @param listener - The listener to remove
   */
  removeInvalidationListener(listener: IInvalidationEventListener): void;

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats;

  /**
   * Reset cache statistics.
   */
  resetStats(): void;
}

// ---------------------------------------------------------------------------
// In-Memory Cache Storage (Development/Testing)
// ---------------------------------------------------------------------------

interface InMemoryCacheEntry {
  value: unknown;
  createdAt: Date;
  expiresAt: Date;
  key: string;
  type: CacheKeyType;
}

/**
 * Simple in-memory cache storage for development and testing.
 * NOTE: In production, use Redis or other distributed cache (O3).
 */
class InMemoryCacheStorage {
  private cache = new Map<string, InMemoryCacheEntry>();
  private stats = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    ttlExpirations: 0,
  };

  /**
   * Get a value from the cache.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    if (entry.expiresAt < new Date()) {
      this.cache.delete(key);
      this.stats.ttlExpirations++;
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Set a value in the cache with TTL.
   */
  set<T>(key: string, value: T, type: CacheKeyType, ttlMs: number): void {
    const now = new Date();
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      key,
      type,
    });
  }

  /**
   * Delete a specific key.
   */
  delete(key: string): boolean {
    const existed = this.cache.has(key);
    if (existed) {
      this.cache.delete(key);
      this.stats.invalidations++;
    }
    return existed;
  }

  /**
   * Delete keys matching a pattern (simple wildcard support).
   */
  deletePattern(pattern: string): string[] {
    const deletedKeys: string[] = [];
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedKeys.push(key);
        this.stats.invalidations++;
      }
    }

    return deletedKeys;
  }

  /**
   * Clear all entries.
   */
  clear(): number {
    const count = this.cache.size;
    this.cache.clear();
    this.stats.invalidations += count;
    return count;
  }

  /**
   * Expire TTL entries.
   */
  expireTTL(): string[] {
    const expiredKeys: string[] = [];
    const now = new Date();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        expiredKeys.push(key);
        this.stats.ttlExpirations++;
      }
    }

    return expiredKeys;
  }

  /**
   * Get cache size.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get statistics.
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      totalEntries: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      invalidations: this.stats.invalidations,
      ttlExpirations: this.stats.ttlExpirations,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      ttlExpirations: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Console Invalidation Event Logger
// ---------------------------------------------------------------------------

/**
 * Console-based invalidation event listener for development/testing.
 */
export const ConsoleInvalidationEventListener: IInvalidationEventListener = {
  async onInvalidation(event: InvalidationEvent, result: InvalidationResult): Promise<void> {
    console.log('[CACHE] Invalidation event:', {
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      userId: event.userId,
      tenantId: event.tenantId,
      orgUnitId: event.orgUnitId,
      correlationId: event.correlationId,
      invalidatedCount: result.invalidatedCount,
      durationMs: result.durationMs,
      propagationSuccessful: result.propagationSuccessful,
    });
  },
};

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a CacheInvalidationService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param ttlConfig - Optional TTL configuration
 * @param eventListeners - Optional event listeners for invalidation events
 * @returns An implementation of ICacheInvalidationService
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   cacheInvalidationService: asFunction(CacheInvalidationServiceImpl).singleton(),
 * });
 *
 * // Usage
 * const cacheService = DI.resolve('cacheInvalidationService');
 * await cacheService.invalidateOnMembershipCreated(userId, tenantId, orgUnitId);
 * ```
 */
export const CacheInvalidationServiceImpl = ({
  ttlConfig = DEFAULT_CACHE_TTL_CONFIG,
  eventListeners = [],
}: {
  ttlConfig?: CacheTTLConfig;
  eventListeners?: IInvalidationEventListener[];
} = {}): ICacheInvalidationService => {
  // In-memory cache storage (replace with Redis in production)
  const cacheStorage = new InMemoryCacheStorage();

  // Mutable config
  let currentTTLConfig = { ...ttlConfig };

  // Event listeners
  const listeners: IInvalidationEventListener[] = [...eventListeners];

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Notify all listeners of an invalidation event.
   */
  const notifyListeners = async (
    event: InvalidationEvent,
    result: InvalidationResult,
  ): Promise<void> => {
    for (const listener of listeners) {
      try {
        await listener.onInvalidation(event, result);
      } catch (error) {
        console.error('[CACHE] Listener error:', error);
      }
    }
  };

  /**
   * Create an invalidation result.
   */
  const createResult = (
    invalidatedKeys: string[],
    startTime: number,
    propagationSuccessful: boolean,
    propagationErrors?: string[],
  ): InvalidationResult => ({
    invalidatedCount: invalidatedKeys.length,
    invalidatedKeys,
    durationMs: Date.now() - startTime,
    propagationSuccessful,
    propagationErrors,
  });

  /**
   * Get TTL for a cache type.
   */
  const getTTLForType = (type: CacheKeyType): number => {
    switch (type) {
      case CacheKeyType.MEMBERSHIP:
        return currentTTLConfig.membershipTTLMs;
      case CacheKeyType.PERMISSION:
        return currentTTLConfig.permissionTTLMs;
      case CacheKeyType.AUTH_CONTEXT:
        return currentTTLConfig.authContextTTLMs;
      case CacheKeyType.USER:
        return currentTTLConfig.userTTLMs;
      case CacheKeyType.TENANT:
        return currentTTLConfig.tenantTTLMs;
      case CacheKeyType.ORGUNIT:
        return currentTTLConfig.orgUnitTTLMs;
      default:
        return currentTTLConfig.authContextTTLMs; // Default fallback
    }
  };

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  return {
    // -------------------------------------------------------------------------
    // Membership Invalidation
    // -------------------------------------------------------------------------

    async invalidateOnMembershipCreated(
      userId: string,
      tenantId: string,
      orgUnitId: string | null,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate user cache
        const userKey = `user:${userId}`;
        if (cacheStorage.delete(userKey)) {
          invalidatedKeys.push(userKey);
        }

        // Invalidate auth context cache
        const authContextKey = `auth-context:${userId}:${tenantId}:${orgUnitId ?? 'null'}`;
        if (cacheStorage.delete(authContextKey)) {
          invalidatedKeys.push(authContextKey);
        }

        const event: InvalidationEvent = {
          type: InvalidationEventType.MEMBERSHIP_CREATED,
          timestamp: new Date(),
          userId,
          tenantId,
          orgUnitId,
          correlationId,
        };

        // Propagate to related caches
        const propagationResult = await this.propagateInvalidation(event, invalidatedKeys);
        if (!propagationResult.success) {
          const result = createResult(invalidatedKeys, startTime, false, [propagationResult.error.message]);
          await notifyListeners(event, result);
          return ok(result);
        }

        const allInvalidatedKeys = [
          ...invalidatedKeys,
          ...propagationResult.data.invalidatedKeys,
        ];
        const result = createResult(allInvalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('membership_created', error));
      }
    },

    async invalidateOnMembershipStatusChanged(
      userId: string,
      tenantId: string,
      orgUnitId: string | null,
      oldStatus: MembershipStatus,
      newStatus: MembershipStatus,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate membership cache
        const membershipKey = `membership:${userId}:${tenantId}:${orgUnitId ?? 'null'}`;
        if (cacheStorage.delete(membershipKey)) {
          invalidatedKeys.push(membershipKey);
        }

        // Invalidate auth context cache
        const authContextKey = `auth-context:${userId}:${tenantId}:${orgUnitId ?? 'null'}`;
        if (cacheStorage.delete(authContextKey)) {
          invalidatedKeys.push(authContextKey);
        }

        // Invalidate user cache
        const userKey = `user:${userId}`;
        if (cacheStorage.delete(userKey)) {
          invalidatedKeys.push(userKey);
        }

        const event: InvalidationEvent = {
          type: InvalidationEventType.MEMBERSHIP_STATUS_CHANGED,
          timestamp: new Date(),
          userId,
          tenantId,
          orgUnitId,
          oldStatus,
          newStatus,
          correlationId,
        };

        // Propagate to related caches
        const propagationResult = await this.propagateInvalidation(event, invalidatedKeys);
        if (!propagationResult.success) {
          const result = createResult(invalidatedKeys, startTime, false, [propagationResult.error.message]);
          await notifyListeners(event, result);
          return ok(result);
        }

        const allInvalidatedKeys = [
          ...invalidatedKeys,
          ...propagationResult.data.invalidatedKeys,
        ];
        const result = createResult(allInvalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('membership_status_changed', error));
      }
    },

    async invalidateOnMembershipRoleChanged(
      userId: string,
      tenantId: string,
      orgUnitId: string | null,
      oldRole: MembershipRole,
      newRole: MembershipRole,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate membership cache
        const membershipKey = `membership:${userId}:${tenantId}:${orgUnitId ?? 'null'}`;
        if (cacheStorage.delete(membershipKey)) {
          invalidatedKeys.push(membershipKey);
        }

        // Invalidate auth context cache
        const authContextKey = `auth-context:${userId}:${tenantId}:${orgUnitId ?? 'null'}`;
        if (cacheStorage.delete(authContextKey)) {
          invalidatedKeys.push(authContextKey);
        }

        // Invalidate user cache
        const userKey = `user:${userId}`;
        if (cacheStorage.delete(userKey)) {
          invalidatedKeys.push(userKey);
        }

        const event: InvalidationEvent = {
          type: InvalidationEventType.MEMBERSHIP_ROLE_CHANGED,
          timestamp: new Date(),
          userId,
          tenantId,
          orgUnitId,
          oldRole,
          newRole,
          correlationId,
        };

        // Propagate to related caches
        const propagationResult = await this.propagateInvalidation(event, invalidatedKeys);
        if (!propagationResult.success) {
          const result = createResult(invalidatedKeys, startTime, false, [propagationResult.error.message]);
          await notifyListeners(event, result);
          return ok(result);
        }

        const allInvalidatedKeys = [
          ...invalidatedKeys,
          ...propagationResult.data.invalidatedKeys,
        ];
        const result = createResult(allInvalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('membership_role_changed', error));
      }
    },

    async invalidateOnMembershipRevoked(
      userId: string,
      tenantId: string,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate ALL membership caches for user in tenant (wildcard)
        const membershipPattern = `membership:${userId}:${tenantId}:*`;
        const membershipKeys = cacheStorage.deletePattern(membershipPattern);
        invalidatedKeys.push(...membershipKeys);

        // Invalidate ALL auth context caches for user in tenant (wildcard)
        const authContextPattern = `auth-context:${userId}:${tenantId}:*`;
        const authContextKeys = cacheStorage.deletePattern(authContextPattern);
        invalidatedKeys.push(...authContextKeys);

        // Invalidate user cache
        const userKey = `user:${userId}`;
        if (cacheStorage.delete(userKey)) {
          invalidatedKeys.push(userKey);
        }

        const event: InvalidationEvent = {
          type: InvalidationEventType.MEMBERSHIP_REVOKED,
          timestamp: new Date(),
          userId,
          tenantId,
          correlationId,
        };

        // Propagate to related caches
        const propagationResult = await this.propagateInvalidation(event, invalidatedKeys);
        if (!propagationResult.success) {
          const result = createResult(invalidatedKeys, startTime, false, [propagationResult.error.message]);
          await notifyListeners(event, result);
          return ok(result);
        }

        const allInvalidatedKeys = [
          ...invalidatedKeys,
          ...propagationResult.data.invalidatedKeys,
        ];
        const result = createResult(allInvalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('membership_revoked', error));
      }
    },

    async invalidateOnMembershipSuspended(
      userId: string,
      tenantId: string,
      orgUnitId: string | null,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate membership cache
        const membershipKey = `membership:${userId}:${tenantId}:${orgUnitId ?? 'null'}`;
        if (cacheStorage.delete(membershipKey)) {
          invalidatedKeys.push(membershipKey);
        }

        // Invalidate auth context cache
        const authContextKey = `auth-context:${userId}:${tenantId}:${orgUnitId ?? 'null'}`;
        if (cacheStorage.delete(authContextKey)) {
          invalidatedKeys.push(authContextKey);
        }

        const event: InvalidationEvent = {
          type: InvalidationEventType.MEMBERSHIP_SUSPENDED,
          timestamp: new Date(),
          userId,
          tenantId,
          orgUnitId,
          correlationId,
        };

        // Propagate to related caches
        const propagationResult = await this.propagateInvalidation(event, invalidatedKeys);
        if (!propagationResult.success) {
          const result = createResult(invalidatedKeys, startTime, false, [propagationResult.error.message]);
          await notifyListeners(event, result);
          return ok(result);
        }

        const allInvalidatedKeys = [
          ...invalidatedKeys,
          ...propagationResult.data.invalidatedKeys,
        ];
        const result = createResult(allInvalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('membership_suspended', error));
      }
    },

    // -------------------------------------------------------------------------
    // Permission Invalidation
    // -------------------------------------------------------------------------

    async invalidateOnPermissionChanged(
      role: MembershipRole,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate permission cache for the role
        const permissionKey = `permission:${role}`;
        if (cacheStorage.delete(permissionKey)) {
          invalidatedKeys.push(permissionKey);
        }

        // Note: In production, we would also need to invalidate auth context caches
        // for all users with this role. This requires querying the membership store.
        // For now, we invalidate all auth contexts as a safe fallback.
        const authContextPattern = `auth-context:*`;
        const authContextKeys = cacheStorage.deletePattern(authContextPattern);
        invalidatedKeys.push(...authContextKeys);

        const event: InvalidationEvent = {
          type: InvalidationEventType.PERMISSION_CHANGED,
          timestamp: new Date(),
          role,
          correlationId,
        };

        // Propagate to related caches
        const propagationResult = await this.propagateInvalidation(event, invalidatedKeys);
        if (!propagationResult.success) {
          const result = createResult(invalidatedKeys, startTime, false, [propagationResult.error.message]);
          await notifyListeners(event, result);
          return ok(result);
        }

        const allInvalidatedKeys = [
          ...invalidatedKeys,
          ...propagationResult.data.invalidatedKeys,
        ];
        const result = createResult(allInvalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('permission_changed', error));
      }
    },

    async invalidateAllPermissions(
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate ALL permission caches
        const permissionPattern = `permission:*`;
        const permissionKeys = cacheStorage.deletePattern(permissionPattern);
        invalidatedKeys.push(...permissionKeys);

        // Also invalidate all auth context caches
        const authContextPattern = `auth-context:*`;
        const authContextKeys = cacheStorage.deletePattern(authContextPattern);
        invalidatedKeys.push(...authContextKeys);

        const event: InvalidationEvent = {
          type: InvalidationEventType.PERMISSION_CHANGED,
          timestamp: new Date(),
          correlationId,
          metadata: { allPermissions: true },
        };

        const result = createResult(invalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('all_permissions', error));
      }
    },

    // -------------------------------------------------------------------------
    // Token/Session Invalidation
    // -------------------------------------------------------------------------

    async invalidateOnTokenVersionChanged(
      userId: string,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate ALL auth context caches for user across all tenants
        const authContextPattern = `auth-context:${userId}:*`;
        const authContextKeys = cacheStorage.deletePattern(authContextPattern);
        invalidatedKeys.push(...authContextKeys);

        // Invalidate ALL membership caches for user
        const membershipPattern = `membership:${userId}:*`;
        const membershipKeys = cacheStorage.deletePattern(membershipPattern);
        invalidatedKeys.push(...membershipKeys);

        // Invalidate user cache
        const userKey = `user:${userId}`;
        if (cacheStorage.delete(userKey)) {
          invalidatedKeys.push(userKey);
        }

        const event: InvalidationEvent = {
          type: InvalidationEventType.TOKEN_VERSION_CHANGED,
          timestamp: new Date(),
          userId,
          correlationId,
        };

        const result = createResult(invalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('token_version_changed', error));
      }
    },

    async invalidateUserTenantCaches(
      userId: string,
      tenantId: string,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate ALL caches for user in tenant
        const membershipPattern = `membership:${userId}:${tenantId}:*`;
        const membershipKeys = cacheStorage.deletePattern(membershipPattern);
        invalidatedKeys.push(...membershipKeys);

        const authContextPattern = `auth-context:${userId}:${tenantId}:*`;
        const authContextKeys = cacheStorage.deletePattern(authContextPattern);
        invalidatedKeys.push(...authContextKeys);

        const event: InvalidationEvent = {
          type: InvalidationEventType.USER_CACHE_CLEAR,
          timestamp: new Date(),
          userId,
          tenantId,
          correlationId,
        };

        const result = createResult(invalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('user_tenant_caches', error));
      }
    },

    // -------------------------------------------------------------------------
    // Tenant/OrgUnit Invalidation
    // -------------------------------------------------------------------------

    async invalidateTenantCaches(
      tenantId: string,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate ALL caches for the tenant
        const membershipPattern = `membership:*:${tenantId}:*`;
        const membershipKeys = cacheStorage.deletePattern(membershipPattern);
        invalidatedKeys.push(...membershipKeys);

        const authContextPattern = `auth-context:*:${tenantId}:*`;
        const authContextKeys = cacheStorage.deletePattern(authContextPattern);
        invalidatedKeys.push(...authContextKeys);

        const orgUnitPattern = `orgunit:${tenantId}:*`;
        const orgUnitKeys = cacheStorage.deletePattern(orgUnitPattern);
        invalidatedKeys.push(...orgUnitKeys);

        const tenantKey = `tenant:${tenantId}`;
        if (cacheStorage.delete(tenantKey)) {
          invalidatedKeys.push(tenantKey);
        }

        const event: InvalidationEvent = {
          type: InvalidationEventType.TENANT_CACHE_CLEAR,
          timestamp: new Date(),
          tenantId,
          correlationId,
        };

        const result = createResult(invalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('tenant_caches', error));
      }
    },

    async invalidateOnOrgUnitChanged(
      tenantId: string,
      orgUnitId: string,
      correlationId?: string,
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const invalidatedKeys: string[] = [];

        // Invalidate OrgUnit cache
        const orgUnitKey = `orgunit:${tenantId}:${orgUnitId}`;
        if (cacheStorage.delete(orgUnitKey)) {
          invalidatedKeys.push(orgUnitKey);
        }

        // Invalidate auth context caches for users scoped to this OrgUnit
        // Note: In production, this would need to be more precise
        const authContextPattern = `auth-context:*:${tenantId}:${orgUnitId}`;
        const authContextKeys = cacheStorage.deletePattern(authContextPattern);
        invalidatedKeys.push(...authContextKeys);

        // Invalidate membership caches for this OrgUnit
        const membershipPattern = `membership:*:${tenantId}:${orgUnitId}`;
        const membershipKeys = cacheStorage.deletePattern(membershipPattern);
        invalidatedKeys.push(...membershipKeys);

        const event: InvalidationEvent = {
          type: InvalidationEventType.ORGUNIT_CHANGED,
          timestamp: new Date(),
          tenantId,
          orgUnitId,
          correlationId,
        };

        const result = createResult(invalidatedKeys, startTime, true);
        await notifyListeners(event, result);
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('orgunit_changed', error));
      }
    },

    // -------------------------------------------------------------------------
    // TTL Management
    // -------------------------------------------------------------------------

    async expireTTLEntries(): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const expiredKeys = cacheStorage.expireTTL();

        const event: InvalidationEvent = {
          type: InvalidationEventType.TTL_EXPIRED,
          timestamp: new Date(),
          metadata: { expiredCount: expiredKeys.length },
        };

        const result = createResult(expiredKeys, startTime, true);
        if (expiredKeys.length > 0) {
          await notifyListeners(event, result);
        }
        return ok(result);
      } catch (error) {
        return fail(cacheInvalidationFailed('ttl_expiration', error));
      }
    },

    getTTLConfig(): CacheTTLConfig {
      return { ...currentTTLConfig };
    },

    updateTTLConfig(config: Partial<CacheTTLConfig>): void {
      currentTTLConfig = { ...currentTTLConfig, ...config };
    },

    // -------------------------------------------------------------------------
    // Cache Key Utilities
    // -------------------------------------------------------------------------

    buildCacheKey(
      type: CacheKeyType,
      components: {
        userId?: string;
        tenantId?: string;
        orgUnitId?: string | null;
        role?: MembershipRole;
      },
    ): string {
      switch (type) {
        case CacheKeyType.MEMBERSHIP:
          return `membership:${components.userId}:${components.tenantId}:${components.orgUnitId ?? 'null'}`;
        case CacheKeyType.PERMISSION:
          return `permission:${components.role}`;
        case CacheKeyType.AUTH_CONTEXT:
          return `auth-context:${components.userId}:${components.tenantId}:${components.orgUnitId ?? 'null'}`;
        case CacheKeyType.USER:
          return `user:${components.userId}`;
        case CacheKeyType.TENANT:
          return `tenant:${components.tenantId}`;
        case CacheKeyType.ORGUNIT:
          return `orgunit:${components.tenantId}:${components.orgUnitId}`;
        default:
          throw new Error(`Unknown cache key type: ${type}`);
      }
    },

    parseCacheKey(key: string): DomainResult<CacheKey> {
      const parts = key.split(':');
      if (parts.length < 2) {
        return fail(invalidCacheKey(key, 'Invalid cache key format'));
      }

      const typeStr = parts[0];
      let type: CacheKeyType;

      switch (typeStr) {
        case 'membership':
          type = CacheKeyType.MEMBERSHIP;
          if (parts.length !== 4) {
            return fail(invalidCacheKey(key, 'Membership key requires 4 parts'));
          }
          return ok({
            type,
            key,
            userId: parts[1],
            tenantId: parts[2],
            orgUnitId: parts[3] === 'null' ? null : parts[3],
          });

        case 'permission':
          type = CacheKeyType.PERMISSION;
          if (parts.length !== 2) {
            return fail(invalidCacheKey(key, 'Permission key requires 2 parts'));
          }
          return ok({
            type,
            key,
            role: parts[1] as MembershipRole,
          });

        case 'auth-context':
          type = CacheKeyType.AUTH_CONTEXT;
          if (parts.length !== 4) {
            return fail(invalidCacheKey(key, 'Auth context key requires 4 parts'));
          }
          return ok({
            type,
            key,
            userId: parts[1],
            tenantId: parts[2],
            orgUnitId: parts[3] === 'null' ? null : parts[3],
          });

        case 'user':
          type = CacheKeyType.USER;
          if (parts.length !== 2) {
            return fail(invalidCacheKey(key, 'User key requires 2 parts'));
          }
          return ok({
            type,
            key,
            userId: parts[1],
          });

        case 'tenant':
          type = CacheKeyType.TENANT;
          if (parts.length !== 2) {
            return fail(invalidCacheKey(key, 'Tenant key requires 2 parts'));
          }
          return ok({
            type,
            key,
            tenantId: parts[1],
          });

        case 'orgunit':
          type = CacheKeyType.ORGUNIT;
          if (parts.length !== 3) {
            return fail(invalidCacheKey(key, 'OrgUnit key requires 3 parts'));
          }
          return ok({
            type,
            key,
            tenantId: parts[1],
            orgUnitId: parts[2],
          });

        default:
          return fail(invalidCacheKey(key, `Unknown cache key type: ${typeStr}`));
      }
    },

    buildCacheKeyPattern(
      type: CacheKeyType,
      pattern: {
        userId?: string;
        tenantId?: string;
        orgUnitId?: string | null | '*';
        role?: MembershipRole | '*';
      },
    ): string {
      const userId = pattern.userId ?? '*';
      const tenantId = pattern.tenantId ?? '*';
      const orgUnitId = pattern.orgUnitId === null ? 'null' : (pattern.orgUnitId ?? '*');
      const role = pattern.role ?? '*';

      switch (type) {
        case CacheKeyType.MEMBERSHIP:
          return `membership:${userId}:${tenantId}:${orgUnitId}`;
        case CacheKeyType.PERMISSION:
          return `permission:${role}`;
        case CacheKeyType.AUTH_CONTEXT:
          return `auth-context:${userId}:${tenantId}:${orgUnitId}`;
        case CacheKeyType.USER:
          return `user:${userId}`;
        case CacheKeyType.TENANT:
          return `tenant:${tenantId}`;
        case CacheKeyType.ORGUNIT:
          return `orgunit:${tenantId}:${orgUnitId}`;
        default:
          return `${type}:*`;
      }
    },

    // -------------------------------------------------------------------------
    // Propagation Management
    // -------------------------------------------------------------------------

    async propagateInvalidation(
      event: InvalidationEvent,
      primaryKeys: readonly string[],
    ): Promise<DomainResult<InvalidationResult>> {
      const startTime = Date.now();

      try {
        const propagatedKeys: string[] = [];

        // Propagation logic based on event type
        switch (event.type) {
          case InvalidationEventType.MEMBERSHIP_CREATED:
          case InvalidationEventType.MEMBERSHIP_STATUS_CHANGED:
          case InvalidationEventType.MEMBERSHIP_ROLE_CHANGED:
          case InvalidationEventType.MEMBERSHIP_SUSPENDED:
            // For membership changes, also check if we need to invalidate
            // any parent/child OrgUnit caches (for inheritance scenarios)
            // This is a placeholder for more complex propagation logic
            break;

          case InvalidationEventType.MEMBERSHIP_REVOKED:
            // For revocation, ensure all session-related caches are cleared
            // This is handled in the main revocation method
            break;

          case InvalidationEventType.PERMISSION_CHANGED:
            // Permission changes may require propagation to all affected users
            // In production, this would query memberships with the affected role
            break;

          case InvalidationEventType.TOKEN_VERSION_CHANGED:
            // Token version changes are user-wide, no additional propagation needed
            break;

          case InvalidationEventType.TENANT_CACHE_CLEAR:
          case InvalidationEventType.ORGUNIT_CHANGED:
            // These are already comprehensive, no additional propagation
            break;

          default:
            // No additional propagation for other event types
            break;
        }

        return ok({
          invalidatedCount: propagatedKeys.length,
          invalidatedKeys: propagatedKeys,
          durationMs: Date.now() - startTime,
          propagationSuccessful: true,
        });
      } catch (error) {
        return fail(cachePropagationFailed(event.type, error));
      }
    },

    // -------------------------------------------------------------------------
    // Event Listeners
    // -------------------------------------------------------------------------

    addInvalidationListener(listener: IInvalidationEventListener): void {
      if (!listeners.includes(listener)) {
        listeners.push(listener);
      }
    },

    removeInvalidationListener(listener: IInvalidationEventListener): void {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    },

    // -------------------------------------------------------------------------
    // Statistics
    // -------------------------------------------------------------------------

    getStats(): CacheStats {
      return cacheStorage.getStats();
    },

    resetStats(): void {
      cacheStorage.resetStats();
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type CacheInvalidationService = ICacheInvalidationService;
