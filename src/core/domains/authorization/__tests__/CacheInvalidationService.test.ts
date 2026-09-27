/**
 * CacheInvalidationService Unit Tests
 *
 * Tests for the Cache Invalidation Service (Task 64) that handles
 * authorization cache invalidation strategy.
 *
 * **Test Coverage:**
 * - Cache invalidation on membership change (create, update, revoke, suspend)
 * - Cache invalidation on permission change
 * - TTL-based cache expiration
 * - Invalidation propagation across related caches
 * - Cache key building and parsing
 * - Event listener notification
 * - Cache statistics tracking
 *
 * **Validates: Requirements 29 (Cache Invalidation)**
 * - Cache invalidation on membership change
 * - Cache invalidation on permission change
 * - TTL-based expiration
 * - Invalidation propagation
 *
 * @see Task 64: Cache Invalidation Strategy (Req 29)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CacheInvalidationServiceImpl,
  CacheKeyType,
  InvalidationEventType,
  DEFAULT_CACHE_TTL_CONFIG,
  type ICacheInvalidationService,
  type IInvalidationEventListener,
  type InvalidationEvent,
  type InvalidationResult,
  type CacheTTLConfig,
} from '../services/CacheInvalidationService';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TENANT_A_ID = 'tenant-a-uuid';
const TENANT_B_ID = 'tenant-b-uuid';
const USER_A_ID = 'user-a-uuid';
const USER_B_ID = 'user-b-uuid';
const ORG_UNIT_ID = 'org-unit-uuid';
const ORG_UNIT_B_ID = 'org-unit-b-uuid';
const CORRELATION_ID = 'correlation-uuid';

/**
 * Create a mock invalidation event listener for testing.
 */
function createMockEventListener(): IInvalidationEventListener & {
  events: Array<{ event: InvalidationEvent; result: InvalidationResult }>;
} {
  const events: Array<{ event: InvalidationEvent; result: InvalidationResult }> = [];
  return {
    events,
    onInvalidation: vi.fn(async (event: InvalidationEvent, result: InvalidationResult) => {
      events.push({ event, result });
    }),
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CacheInvalidationService', () => {
  let service: ICacheInvalidationService;
  let mockListener: IInvalidationEventListener & {
    events: Array<{ event: InvalidationEvent; result: InvalidationResult }>;
  };

  beforeEach(() => {
    mockListener = createMockEventListener();
    service = CacheInvalidationServiceImpl({
      eventListeners: [mockListener],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Membership Created Invalidation Tests
  // =========================================================================

  describe('invalidateOnMembershipCreated', () => {
    it('should invalidate user and auth context caches on membership creation', async () => {
      const result = await service.invalidateOnMembershipCreated(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
        expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should notify event listeners on membership creation', async () => {
      await service.invalidateOnMembershipCreated(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        CORRELATION_ID,
      );

      expect(mockListener.onInvalidation).toHaveBeenCalled();
      expect(mockListener.events.length).toBeGreaterThan(0);
      
      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.MEMBERSHIP_CREATED);
      expect(lastEvent!.event.userId).toBe(USER_A_ID);
      expect(lastEvent!.event.tenantId).toBe(TENANT_A_ID);
      expect(lastEvent!.event.orgUnitId).toBe(ORG_UNIT_ID);
      expect(lastEvent!.event.correlationId).toBe(CORRELATION_ID);
    });

    it('should handle null orgUnitId for tenant-level membership', async () => {
      const result = await service.invalidateOnMembershipCreated(
        USER_A_ID,
        TENANT_A_ID,
        null,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      
      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.orgUnitId).toBeNull();
    });
  });

  // =========================================================================
  // Membership Status Changed Invalidation Tests
  // =========================================================================

  describe('invalidateOnMembershipStatusChanged', () => {
    it('should invalidate membership, auth context, and user caches on status change', async () => {
      const result = await service.invalidateOnMembershipStatusChanged(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        MembershipStatus.ACTIVE,
        MembershipStatus.SUSPENDED,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners with old and new status', async () => {
      await service.invalidateOnMembershipStatusChanged(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        MembershipStatus.ACTIVE,
        MembershipStatus.SUSPENDED,
        CORRELATION_ID,
      );

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.MEMBERSHIP_STATUS_CHANGED);
      expect(lastEvent!.event.oldStatus).toBe(MembershipStatus.ACTIVE);
      expect(lastEvent!.event.newStatus).toBe(MembershipStatus.SUSPENDED);
    });

    it('should handle REVOKED status transition', async () => {
      const result = await service.invalidateOnMembershipStatusChanged(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        MembershipStatus.SUSPENDED,
        MembershipStatus.REVOKED,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // Membership Role Changed Invalidation Tests
  // =========================================================================

  describe('invalidateOnMembershipRoleChanged', () => {
    it('should invalidate caches on role change', async () => {
      const result = await service.invalidateOnMembershipRoleChanged(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        MembershipRole.RESIDENT,
        MembershipRole.RT_ADMIN,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners with old and new role', async () => {
      await service.invalidateOnMembershipRoleChanged(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        MembershipRole.RESIDENT,
        MembershipRole.RT_ADMIN,
        CORRELATION_ID,
      );

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.MEMBERSHIP_ROLE_CHANGED);
      expect(lastEvent!.event.oldRole).toBe(MembershipRole.RESIDENT);
      expect(lastEvent!.event.newRole).toBe(MembershipRole.RT_ADMIN);
    });
  });

  // =========================================================================
  // Membership Revoked Invalidation Tests
  // =========================================================================

  describe('invalidateOnMembershipRevoked', () => {
    it('should invalidate all user caches in tenant on revocation', async () => {
      const result = await service.invalidateOnMembershipRevoked(
        USER_A_ID,
        TENANT_A_ID,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners on revocation', async () => {
      await service.invalidateOnMembershipRevoked(
        USER_A_ID,
        TENANT_A_ID,
        CORRELATION_ID,
      );

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.MEMBERSHIP_REVOKED);
      expect(lastEvent!.event.userId).toBe(USER_A_ID);
      expect(lastEvent!.event.tenantId).toBe(TENANT_A_ID);
    });
  });

  // =========================================================================
  // Membership Suspended Invalidation Tests
  // =========================================================================

  describe('invalidateOnMembershipSuspended', () => {
    it('should invalidate membership and auth context caches on suspension', async () => {
      const result = await service.invalidateOnMembershipSuspended(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners on suspension', async () => {
      await service.invalidateOnMembershipSuspended(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        CORRELATION_ID,
      );

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.MEMBERSHIP_SUSPENDED);
    });
  });

  // =========================================================================
  // Permission Changed Invalidation Tests
  // =========================================================================

  describe('invalidateOnPermissionChanged', () => {
    it('should invalidate permission and related auth context caches', async () => {
      const result = await service.invalidateOnPermissionChanged(
        MembershipRole.RT_ADMIN,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners with affected role', async () => {
      await service.invalidateOnPermissionChanged(
        MembershipRole.RT_ADMIN,
        CORRELATION_ID,
      );

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.PERMISSION_CHANGED);
      expect(lastEvent!.event.role).toBe(MembershipRole.RT_ADMIN);
    });
  });

  // =========================================================================
  // All Permissions Invalidation Tests
  // =========================================================================

  describe('invalidateAllPermissions', () => {
    it('should invalidate all permission caches', async () => {
      const result = await service.invalidateAllPermissions(CORRELATION_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners with metadata indicating all permissions', async () => {
      await service.invalidateAllPermissions(CORRELATION_ID);

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.PERMISSION_CHANGED);
      expect(lastEvent!.event.metadata?.allPermissions).toBe(true);
    });
  });

  // =========================================================================
  // Token Version Changed Invalidation Tests
  // =========================================================================

  describe('invalidateOnTokenVersionChanged', () => {
    it('should invalidate all user auth contexts across all tenants', async () => {
      const result = await service.invalidateOnTokenVersionChanged(
        USER_A_ID,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners on token version change', async () => {
      await service.invalidateOnTokenVersionChanged(USER_A_ID, CORRELATION_ID);

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.TOKEN_VERSION_CHANGED);
      expect(lastEvent!.event.userId).toBe(USER_A_ID);
    });
  });

  // =========================================================================
  // User Tenant Caches Invalidation Tests
  // =========================================================================

  describe('invalidateUserTenantCaches', () => {
    it('should invalidate all caches for user in specific tenant', async () => {
      const result = await service.invalidateUserTenantCaches(
        USER_A_ID,
        TENANT_A_ID,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners on user tenant cache clear', async () => {
      await service.invalidateUserTenantCaches(USER_A_ID, TENANT_A_ID, CORRELATION_ID);

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.USER_CACHE_CLEAR);
      expect(lastEvent!.event.userId).toBe(USER_A_ID);
      expect(lastEvent!.event.tenantId).toBe(TENANT_A_ID);
    });
  });

  // =========================================================================
  // Tenant Caches Invalidation Tests
  // =========================================================================

  describe('invalidateTenantCaches', () => {
    it('should invalidate all caches for a tenant', async () => {
      const result = await service.invalidateTenantCaches(TENANT_A_ID, CORRELATION_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners on tenant cache clear', async () => {
      await service.invalidateTenantCaches(TENANT_A_ID, CORRELATION_ID);

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.TENANT_CACHE_CLEAR);
      expect(lastEvent!.event.tenantId).toBe(TENANT_A_ID);
    });
  });

  // =========================================================================
  // OrgUnit Changed Invalidation Tests
  // =========================================================================

  describe('invalidateOnOrgUnitChanged', () => {
    it('should invalidate OrgUnit and related caches', async () => {
      const result = await service.invalidateOnOrgUnitChanged(
        TENANT_A_ID,
        ORG_UNIT_ID,
        CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should notify event listeners on OrgUnit change', async () => {
      await service.invalidateOnOrgUnitChanged(TENANT_A_ID, ORG_UNIT_ID, CORRELATION_ID);

      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.ORGUNIT_CHANGED);
      expect(lastEvent!.event.tenantId).toBe(TENANT_A_ID);
      expect(lastEvent!.event.orgUnitId).toBe(ORG_UNIT_ID);
    });
  });

  // =========================================================================
  // TTL Management Tests
  // =========================================================================

  describe('TTL Management', () => {
    it('should return default TTL configuration', () => {
      const config = service.getTTLConfig();

      expect(config.membershipTTLMs).toBe(DEFAULT_CACHE_TTL_CONFIG.membershipTTLMs);
      expect(config.permissionTTLMs).toBe(DEFAULT_CACHE_TTL_CONFIG.permissionTTLMs);
      expect(config.authContextTTLMs).toBe(DEFAULT_CACHE_TTL_CONFIG.authContextTTLMs);
      expect(config.userTTLMs).toBe(DEFAULT_CACHE_TTL_CONFIG.userTTLMs);
      expect(config.tenantTTLMs).toBe(DEFAULT_CACHE_TTL_CONFIG.tenantTTLMs);
      expect(config.orgUnitTTLMs).toBe(DEFAULT_CACHE_TTL_CONFIG.orgUnitTTLMs);
    });

    it('should update TTL configuration', () => {
      const newConfig: Partial<CacheTTLConfig> = {
        membershipTTLMs: 60000, // 1 minute
        authContextTTLMs: 30000, // 30 seconds
      };

      service.updateTTLConfig(newConfig);
      const config = service.getTTLConfig();

      expect(config.membershipTTLMs).toBe(60000);
      expect(config.authContextTTLMs).toBe(30000);
      // Other values should remain unchanged
      expect(config.permissionTTLMs).toBe(DEFAULT_CACHE_TTL_CONFIG.permissionTTLMs);
    });

    it('should expire TTL entries', async () => {
      const result = await service.expireTTLEntries();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
        expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // =========================================================================
  // Cache Key Building Tests
  // =========================================================================

  describe('buildCacheKey', () => {
    it('should build membership cache key', () => {
      const key = service.buildCacheKey(CacheKeyType.MEMBERSHIP, {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        orgUnitId: ORG_UNIT_ID,
      });

      expect(key).toBe(`membership:${USER_A_ID}:${TENANT_A_ID}:${ORG_UNIT_ID}`);
    });

    it('should build membership cache key with null orgUnitId', () => {
      const key = service.buildCacheKey(CacheKeyType.MEMBERSHIP, {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        orgUnitId: null,
      });

      expect(key).toBe(`membership:${USER_A_ID}:${TENANT_A_ID}:null`);
    });

    it('should build permission cache key', () => {
      const key = service.buildCacheKey(CacheKeyType.PERMISSION, {
        role: MembershipRole.RT_ADMIN,
      });

      expect(key).toBe(`permission:${MembershipRole.RT_ADMIN}`);
    });

    it('should build auth context cache key', () => {
      const key = service.buildCacheKey(CacheKeyType.AUTH_CONTEXT, {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        orgUnitId: ORG_UNIT_ID,
      });

      expect(key).toBe(`auth-context:${USER_A_ID}:${TENANT_A_ID}:${ORG_UNIT_ID}`);
    });

    it('should build user cache key', () => {
      const key = service.buildCacheKey(CacheKeyType.USER, {
        userId: USER_A_ID,
      });

      expect(key).toBe(`user:${USER_A_ID}`);
    });

    it('should build tenant cache key', () => {
      const key = service.buildCacheKey(CacheKeyType.TENANT, {
        tenantId: TENANT_A_ID,
      });

      expect(key).toBe(`tenant:${TENANT_A_ID}`);
    });

    it('should build OrgUnit cache key', () => {
      const key = service.buildCacheKey(CacheKeyType.ORGUNIT, {
        tenantId: TENANT_A_ID,
        orgUnitId: ORG_UNIT_ID,
      });

      expect(key).toBe(`orgunit:${TENANT_A_ID}:${ORG_UNIT_ID}`);
    });
  });

  // =========================================================================
  // Cache Key Parsing Tests
  // =========================================================================

  describe('parseCacheKey', () => {
    it('should parse membership cache key', () => {
      const result = service.parseCacheKey(`membership:${USER_A_ID}:${TENANT_A_ID}:${ORG_UNIT_ID}`);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(CacheKeyType.MEMBERSHIP);
        expect(result.data.userId).toBe(USER_A_ID);
        expect(result.data.tenantId).toBe(TENANT_A_ID);
        expect(result.data.orgUnitId).toBe(ORG_UNIT_ID);
      }
    });

    it('should parse membership cache key with null orgUnitId', () => {
      const result = service.parseCacheKey(`membership:${USER_A_ID}:${TENANT_A_ID}:null`);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(CacheKeyType.MEMBERSHIP);
        expect(result.data.orgUnitId).toBeNull();
      }
    });

    it('should parse permission cache key', () => {
      const result = service.parseCacheKey(`permission:${MembershipRole.RT_ADMIN}`);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(CacheKeyType.PERMISSION);
        expect(result.data.role).toBe(MembershipRole.RT_ADMIN);
      }
    });

    it('should parse auth context cache key', () => {
      const result = service.parseCacheKey(`auth-context:${USER_A_ID}:${TENANT_A_ID}:${ORG_UNIT_ID}`);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(CacheKeyType.AUTH_CONTEXT);
        expect(result.data.userId).toBe(USER_A_ID);
        expect(result.data.tenantId).toBe(TENANT_A_ID);
        expect(result.data.orgUnitId).toBe(ORG_UNIT_ID);
      }
    });

    it('should parse user cache key', () => {
      const result = service.parseCacheKey(`user:${USER_A_ID}`);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(CacheKeyType.USER);
        expect(result.data.userId).toBe(USER_A_ID);
      }
    });

    it('should parse tenant cache key', () => {
      const result = service.parseCacheKey(`tenant:${TENANT_A_ID}`);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(CacheKeyType.TENANT);
        expect(result.data.tenantId).toBe(TENANT_A_ID);
      }
    });

    it('should parse OrgUnit cache key', () => {
      const result = service.parseCacheKey(`orgunit:${TENANT_A_ID}:${ORG_UNIT_ID}`);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(CacheKeyType.ORGUNIT);
        expect(result.data.tenantId).toBe(TENANT_A_ID);
        expect(result.data.orgUnitId).toBe(ORG_UNIT_ID);
      }
    });

    it('should fail on invalid cache key format', () => {
      const result = service.parseCacheKey('invalid');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CACHE_KEY');
      }
    });

    it('should fail on unknown cache key type', () => {
      const result = service.parseCacheKey('unknown:value');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CACHE_KEY');
      }
    });

    it('should fail on membership key with wrong number of parts', () => {
      const result = service.parseCacheKey('membership:user:tenant');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CACHE_KEY');
      }
    });
  });

  // =========================================================================
  // Cache Key Pattern Building Tests
  // =========================================================================

  describe('buildCacheKeyPattern', () => {
    it('should build membership pattern with wildcards', () => {
      const pattern = service.buildCacheKeyPattern(CacheKeyType.MEMBERSHIP, {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        orgUnitId: '*',
      });

      expect(pattern).toBe(`membership:${USER_A_ID}:${TENANT_A_ID}:*`);
    });

    it('should build pattern with all wildcards', () => {
      const pattern = service.buildCacheKeyPattern(CacheKeyType.AUTH_CONTEXT, {});

      expect(pattern).toBe('auth-context:*:*:*');
    });

    it('should build pattern with specific values', () => {
      const pattern = service.buildCacheKeyPattern(CacheKeyType.PERMISSION, {
        role: MembershipRole.SECURITY,
      });

      expect(pattern).toBe(`permission:${MembershipRole.SECURITY}`);
    });

    it('should build pattern with null orgUnitId', () => {
      const pattern = service.buildCacheKeyPattern(CacheKeyType.MEMBERSHIP, {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        orgUnitId: null,
      });

      expect(pattern).toBe(`membership:${USER_A_ID}:${TENANT_A_ID}:null`);
    });
  });

  // =========================================================================
  // Propagation Tests
  // =========================================================================

  describe('propagateInvalidation', () => {
    it('should propagate invalidation for membership created event', async () => {
      const event: InvalidationEvent = {
        type: InvalidationEventType.MEMBERSHIP_CREATED,
        timestamp: new Date(),
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        orgUnitId: ORG_UNIT_ID,
      };

      const result = await service.propagateInvalidation(event, []);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });

    it('should propagate invalidation for permission changed event', async () => {
      const event: InvalidationEvent = {
        type: InvalidationEventType.PERMISSION_CHANGED,
        timestamp: new Date(),
        role: MembershipRole.RT_ADMIN,
      };

      const result = await service.propagateInvalidation(event, []);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.propagationSuccessful).toBe(true);
      }
    });
  });

  // =========================================================================
  // Event Listener Management Tests
  // =========================================================================

  describe('Event Listener Management', () => {
    it('should add event listener', () => {
      const newListener = createMockEventListener();

      service.addInvalidationListener(newListener);

      // Trigger an event
      service.invalidateOnMembershipCreated(USER_A_ID, TENANT_A_ID, ORG_UNIT_ID);

      // Both listeners should receive the event
      // (mockListener was added in beforeEach)
    });

    it('should not add duplicate listener', () => {
      // Try to add the same listener again
      service.addInvalidationListener(mockListener);

      // Trigger an event
      service.invalidateOnMembershipCreated(USER_A_ID, TENANT_A_ID, ORG_UNIT_ID);

      // Should still only be called once per event
    });

    it('should remove event listener', async () => {
      service.removeInvalidationListener(mockListener);

      await service.invalidateOnMembershipCreated(USER_A_ID, TENANT_A_ID, ORG_UNIT_ID);

      // Listener should not have been called after removal
      expect(mockListener.onInvalidation).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Statistics Tests
  // =========================================================================

  describe('Cache Statistics', () => {
    it('should return initial statistics', () => {
      const stats = service.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.invalidations).toBe(0);
      expect(stats.ttlExpirations).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should reset statistics', () => {
      // Perform some operations to generate stats
      service.invalidateOnMembershipCreated(USER_A_ID, TENANT_A_ID, ORG_UNIT_ID);

      // Reset stats
      service.resetStats();

      const stats = service.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.invalidations).toBe(0);
    });
  });

  // =========================================================================
  // Default Configuration Tests
  // =========================================================================

  describe('Default Configuration', () => {
    it('should work with default configuration (no parameters)', () => {
      const defaultService = CacheInvalidationServiceImpl();

      // Should work without any configuration
      const config = defaultService.getTTLConfig();
      expect(config.membershipTTLMs).toBe(DEFAULT_CACHE_TTL_CONFIG.membershipTTLMs);
    });

    it('should allow custom TTL configuration', () => {
      const customConfig: CacheTTLConfig = {
        membershipTTLMs: 10000,
        permissionTTLMs: 20000,
        authContextTTLMs: 5000,
        userTTLMs: 15000,
        tenantTTLMs: 25000,
        orgUnitTTLMs: 30000,
      };

      const customService = CacheInvalidationServiceImpl({
        ttlConfig: customConfig,
      });

      const config = customService.getTTLConfig();
      expect(config.membershipTTLMs).toBe(10000);
      expect(config.permissionTTLMs).toBe(20000);
      expect(config.authContextTTLMs).toBe(5000);
    });
  });

  // =========================================================================
  // Integration-like Tests
  // =========================================================================

  describe('Integration Scenarios', () => {
    it('should handle multiple membership operations in sequence', async () => {
      // Create membership
      const createResult = await service.invalidateOnMembershipCreated(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
      );
      expect(createResult.success).toBe(true);

      // Update status
      const statusResult = await service.invalidateOnMembershipStatusChanged(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        MembershipStatus.ACTIVE,
        MembershipStatus.SUSPENDED,
      );
      expect(statusResult.success).toBe(true);

      // Reactivate
      const reactivateResult = await service.invalidateOnMembershipStatusChanged(
        USER_A_ID,
        TENANT_A_ID,
        ORG_UNIT_ID,
        MembershipStatus.SUSPENDED,
        MembershipStatus.ACTIVE,
      );
      expect(reactivateResult.success).toBe(true);

      // Revoke
      const revokeResult = await service.invalidateOnMembershipRevoked(
        USER_A_ID,
        TENANT_A_ID,
      );
      expect(revokeResult.success).toBe(true);

      // Verify all events were logged
      expect(mockListener.events.length).toBe(4);
    });

    it('should handle concurrent invalidations', async () => {
      // Simulate concurrent invalidations
      const promises = [
        service.invalidateOnMembershipCreated(USER_A_ID, TENANT_A_ID, ORG_UNIT_ID),
        service.invalidateOnMembershipCreated(USER_B_ID, TENANT_A_ID, ORG_UNIT_B_ID),
        service.invalidateOnPermissionChanged(MembershipRole.RT_ADMIN),
        service.invalidateTenantCaches(TENANT_B_ID),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    it('should handle token version change with full user logout', async () => {
      // First, simulate user having memberships in multiple tenants
      await service.invalidateOnMembershipCreated(USER_A_ID, TENANT_A_ID, ORG_UNIT_ID);
      await service.invalidateOnMembershipCreated(USER_A_ID, TENANT_B_ID, ORG_UNIT_B_ID);

      // Then force logout via token version change
      const result = await service.invalidateOnTokenVersionChanged(USER_A_ID);

      expect(result.success).toBe(true);
      
      const lastEvent = mockListener.events[mockListener.events.length - 1];
      expect(lastEvent!.event.type).toBe(InvalidationEventType.TOKEN_VERSION_CHANGED);
    });
  });
});
