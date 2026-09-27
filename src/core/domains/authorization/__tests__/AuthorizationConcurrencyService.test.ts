/**
 * AuthorizationConcurrencyService Unit Tests
 *
 * Tests for the Authorization Concurrency Service (Task 63) that handles
 * concurrent authorization operations safely with TOCTOU prevention.
 *
 * **Test Coverage:**
 * - Concurrent membership resolution with locking
 * - Race condition prevention via pessimistic locking
 * - Optimistic locking for resource updates
 * - TOCTOU prevention for sensitive operations
 * - Conflict detection and resolution strategies
 * - TOCTOU-sensitive operation registry
 * - Audit logging for TOCTOU incidents
 *
 * **Validates: Requirements 28 (AC 1-7)**
 * - AC 1: Database-level locking for critical membership operations
 * - AC 2: Optimistic concurrency control with version checks
 * - AC 3: Authorization validation immediately before executing mutating operations
 * - AC 4: Detect and reject concurrent conflicting operations
 * - AC 5: SELECT FOR UPDATE for operations that depend on current state
 * - AC 6: Document which operations are TOCTOU-sensitive
 * - AC 7: Log TOCTOU race incidents with full context for security review
 *
 * @see Task 63: Authorization Concurrency Handling (Req 28)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AuthorizationConcurrencyServiceImpl,
  ConflictResolutionStrategy,
  type IAuthorizationConcurrencyService,
  type IToctouAuditLogger,
  type ToctouAuditEntry,
  type ConcurrentMembershipResolutionParams,
  type OptimisticLockUpdateParams,
  type ToctouSafeOperationParams,
  type ConflictDetectionParams,
  type ConflictResolutionConfig,
} from '../services/AuthorizationConcurrencyService';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TENANT_A_ID = 'tenant-a-uuid';
const TENANT_B_ID = 'tenant-b-uuid';
const USER_A_ID = 'user-a-uuid';
const USER_B_ID = 'user-b-uuid';
const ORG_UNIT_ID = 'org-unit-uuid';
const MEMBERSHIP_ID = 'membership-uuid';

/**
 * Create a mock TOCTOU audit logger for testing.
 */
function createMockAuditLogger(): IToctouAuditLogger & { entries: ToctouAuditEntry[] } {
  const entries: ToctouAuditEntry[] = [];
  return {
    entries,
    logIncident: vi.fn(async (entry: ToctouAuditEntry) => {
      entries.push(entry);
    }),
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('AuthorizationConcurrencyService', () => {
  let service: IAuthorizationConcurrencyService;
  let mockAuditLogger: IToctouAuditLogger & { entries: ToctouAuditEntry[] };

  beforeEach(() => {
    mockAuditLogger = createMockAuditLogger();
    service = AuthorizationConcurrencyServiceImpl({
      toctouAuditLogger: mockAuditLogger,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // resolveMembershipWithLock Tests (Req 28.1, 28.5)
  // =========================================================================

  describe('resolveMembershipWithLock', () => {
    it('should acquire lock and resolve membership successfully', async () => {
      const params: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        orgUnitId: ORG_UNIT_ID,
        lockTimeoutMs: 5000,
      };

      const result = await service.resolveMembershipWithLock(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lockAcquired).toBe(true);
        expect(result.data.lockId).toBeDefined();
        expect(result.data.membership.userId).toBe(USER_A_ID);
        expect(result.data.membership.tenantId).toBe(TENANT_A_ID);
      }
    });

    it('should fail when lock is already held', async () => {
      const params: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        lockTimeoutMs: 100, // Short timeout for testing
      };

      // First call acquires lock
      const result1 = await service.resolveMembershipWithLock(params);
      expect(result1.success).toBe(true);

      // Second call should fail (lock held)
      const result2 = await service.resolveMembershipWithLock(params);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.code).toBe('MEMBERSHIP_LOCK_TIMEOUT');
      }
    });

    it('should allow lock after release', async () => {
      const params: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        lockTimeoutMs: 1000,
      };

      // Acquire lock
      const result1 = await service.resolveMembershipWithLock(params);
      expect(result1.success).toBe(true);
      if (!result1.success) return;

      // Release lock
      const releaseResult = await service.releaseMembershipLock(result1.data.lockId!);
      expect(releaseResult.success).toBe(true);

      // Second call should succeed (lock released)
      const result2 = await service.resolveMembershipWithLock(params);
      expect(result2.success).toBe(true);
    });

    it('should use different lock keys for different users', async () => {
      const paramsUserA: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
      };

      const paramsUserB: ConcurrentMembershipResolutionParams = {
        userId: USER_B_ID,
        tenantId: TENANT_A_ID,
      };

      // Both should succeed (different lock keys)
      const result1 = await service.resolveMembershipWithLock(paramsUserA);
      const result2 = await service.resolveMembershipWithLock(paramsUserB);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should use different lock keys for different tenants', async () => {
      const paramsTenantA: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
      };

      const paramsTenantB: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_B_ID,
      };

      // Both should succeed (different lock keys)
      const result1 = await service.resolveMembershipWithLock(paramsTenantA);
      const result2 = await service.resolveMembershipWithLock(paramsTenantB);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  // =========================================================================
  // releaseMembershipLock Tests
  // =========================================================================

  describe('releaseMembershipLock', () => {
    it('should release an existing lock successfully', async () => {
      const params: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
      };

      const acquireResult = await service.resolveMembershipWithLock(params);
      expect(acquireResult.success).toBe(true);
      if (!acquireResult.success) return;

      const releaseResult = await service.releaseMembershipLock(acquireResult.data.lockId!);
      expect(releaseResult.success).toBe(true);
    });

    it('should succeed even if lock does not exist (idempotent)', async () => {
      const releaseResult = await service.releaseMembershipLock('non-existent-lock-id');
      expect(releaseResult.success).toBe(true);
    });
  });

  // =========================================================================
  // executeWithOptimisticLock Tests (Req 28.2)
  // =========================================================================

  describe('executeWithOptimisticLock', () => {
    it('should execute update when version matches', async () => {
      let currentVersion = 1;
      const updateFn = vi.fn(async () => ({ updated: true }));
      const getCurrentVersion = vi.fn(async () => currentVersion);

      const params: OptimisticLockUpdateParams<{ updated: boolean }> = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        expectedVersion: 1,
        updateFn,
        getCurrentVersion,
      };

      const result = await service.executeWithOptimisticLock(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.updated).toBe(true);
      }
      expect(updateFn).toHaveBeenCalled();
    });

    it('should fail when version does not match', async () => {
      const currentVersion = 2; // Version has changed
      const updateFn = vi.fn(async () => ({ updated: true }));
      const getCurrentVersion = vi.fn(async () => currentVersion);

      const params: OptimisticLockUpdateParams<{ updated: boolean }> = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        expectedVersion: 1, // Expected version 1, but current is 2
        updateFn,
        getCurrentVersion,
      };

      const result = await service.executeWithOptimisticLock(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('OPTIMISTIC_LOCK_FAILED');
      }
      expect(updateFn).not.toHaveBeenCalled();
    });

    it('should fail when resource no longer exists', async () => {
      const updateFn = vi.fn(async () => ({ updated: true }));
      const getCurrentVersion = vi.fn(async () => null); // Resource deleted

      const params: OptimisticLockUpdateParams<{ updated: boolean }> = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        expectedVersion: 1,
        updateFn,
        getCurrentVersion,
      };

      const result = await service.executeWithOptimisticLock(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT_DETECTED');
        expect(result.error.message).toContain('no longer exists');
      }
      expect(updateFn).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // executeWithToctouPrevention Tests (Req 28.3, 28.7)
  // =========================================================================

  describe('executeWithToctouPrevention', () => {
    it('should execute operation when authorization check passes', async () => {
      const operation = vi.fn(async () => ({ result: 'success' }));
      const authorizationCheck = vi.fn(async () => true);

      const params: ToctouSafeOperationParams<{ result: string }> = {
        operationType: 'membership:update',
        authorizationCheck,
        operation,
        context: { userId: USER_A_ID, tenantId: TENANT_A_ID },
      };

      const result = await service.executeWithToctouPrevention(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.result).toBe('success');
      }
      expect(authorizationCheck).toHaveBeenCalled();
      expect(operation).toHaveBeenCalled();
    });

    it('should fail and log incident when authorization check fails', async () => {
      const operation = vi.fn(async () => ({ result: 'success' }));
      const authorizationCheck = vi.fn(async () => false); // Auth revoked

      const params: ToctouSafeOperationParams<{ result: string }> = {
        operationType: 'membership:update',
        authorizationCheck,
        operation,
        context: { userId: USER_A_ID, tenantId: TENANT_A_ID },
      };

      const result = await service.executeWithToctouPrevention(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_REVALIDATION_FAILED');
      }
      expect(operation).not.toHaveBeenCalled();

      // Verify audit log entry
      expect(mockAuditLogger.entries.length).toBe(1);
      expect(mockAuditLogger.entries[0]!.operationType).toBe('membership:update');
      expect(mockAuditLogger.entries[0]!.userId).toBe(USER_A_ID);
      expect(mockAuditLogger.entries[0]!.tenantId).toBe(TENANT_A_ID);
    });

    it('should call authorization check before operation execution', async () => {
      const callOrder: string[] = [];
      const operation = vi.fn(async () => {
        callOrder.push('operation');
        return { result: 'success' };
      });
      const authorizationCheck = vi.fn(async () => {
        callOrder.push('authCheck');
        return true;
      });

      const params: ToctouSafeOperationParams<{ result: string }> = {
        operationType: 'membership:update',
        authorizationCheck,
        operation,
      };

      await service.executeWithToctouPrevention(params);

      // Auth check must be called before operation
      expect(callOrder).toEqual(['authCheck', 'operation']);
    });
  });

  // =========================================================================
  // detectAndResolveConflict Tests (Req 28.4)
  // =========================================================================

  describe('detectAndResolveConflict', () => {
    it('should detect no conflict when state hashes match', async () => {
      const params: ConflictDetectionParams = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        operation: 'update',
        expectedStateHash: 'hash-123',
        getCurrentStateHash: vi.fn(async () => 'hash-123'),
      };

      const result = await service.detectAndResolveConflict(params);

      expect(result.success).toBe(true);
    });

    it('should detect conflict when state hashes differ', async () => {
      const params: ConflictDetectionParams = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        operation: 'update',
        expectedStateHash: 'hash-123',
        getCurrentStateHash: vi.fn(async () => 'hash-456'), // Different hash
      };

      const result = await service.detectAndResolveConflict(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT_DETECTED');
      }
    });

    it('should use FAIL strategy by default', async () => {
      const params: ConflictDetectionParams = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        operation: 'update',
        expectedStateHash: 'hash-123',
        getCurrentStateHash: vi.fn(async () => 'hash-456'),
      };

      const result = await service.detectAndResolveConflict(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT_DETECTED');
      }
    });

    it('should suggest retry when using RETRY strategy', async () => {
      const params: ConflictDetectionParams = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        operation: 'update',
        expectedStateHash: 'hash-123',
        getCurrentStateHash: vi.fn(async () => 'hash-456'),
      };

      const config: ConflictResolutionConfig = {
        strategy: ConflictResolutionStrategy.RETRY,
        maxRetries: 3,
        baseDelayMs: 100,
      };

      const result = await service.detectAndResolveConflict(params, config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT_DETECTED');
        expect(result.error.message).toContain('Retry suggested');
      }
    });

    it('should pass through with LAST_WRITE_WINS strategy', async () => {
      const params: ConflictDetectionParams = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        operation: 'update',
        expectedStateHash: 'hash-123',
        getCurrentStateHash: vi.fn(async () => 'hash-456'),
      };

      const config: ConflictResolutionConfig = {
        strategy: ConflictResolutionStrategy.LAST_WRITE_WINS,
      };

      const result = await service.detectAndResolveConflict(params, config);

      expect(result.success).toBe(true);
    });

    it('should require mergeFn for MERGE strategy', async () => {
      const params: ConflictDetectionParams = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        operation: 'update',
        expectedStateHash: 'hash-123',
        getCurrentStateHash: vi.fn(async () => 'hash-456'),
      };

      const config: ConflictResolutionConfig = {
        strategy: ConflictResolutionStrategy.MERGE,
        // No mergeFn provided
      };

      const result = await service.detectAndResolveConflict(params, config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFLICT_DETECTED');
        expect(result.error.message).toContain('requires mergeFn');
      }
    });

    it('should pass with MERGE strategy when mergeFn is provided', async () => {
      const params: ConflictDetectionParams = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        operation: 'update',
        expectedStateHash: 'hash-123',
        getCurrentStateHash: vi.fn(async () => 'hash-456'),
      };

      const config: ConflictResolutionConfig = {
        strategy: ConflictResolutionStrategy.MERGE,
        mergeFn: (current, incoming) => ({ ...current, ...incoming }),
      };

      const result = await service.detectAndResolveConflict(params, config);

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // isToctouSensitiveOperation Tests (Req 28.6)
  // =========================================================================

  describe('isToctouSensitiveOperation', () => {
    it('should identify membership:create as sensitive', () => {
      const result = service.isToctouSensitiveOperation('membership:create');
      expect(result.sensitive).toBe(true);
      expect(result.reason).toContain('membership');
    });

    it('should identify membership:update as sensitive', () => {
      const result = service.isToctouSensitiveOperation('membership:update');
      expect(result.sensitive).toBe(true);
    });

    it('should identify membership:revoke as sensitive', () => {
      const result = service.isToctouSensitiveOperation('membership:revoke');
      expect(result.sensitive).toBe(true);
    });

    it('should identify membership:delegate as sensitive', () => {
      const result = service.isToctouSensitiveOperation('membership:delegate');
      expect(result.sensitive).toBe(true);
    });

    it('should identify context:switch as sensitive', () => {
      const result = service.isToctouSensitiveOperation('context:switch');
      expect(result.sensitive).toBe(true);
    });

    it('should identify tenant:transfer as sensitive', () => {
      const result = service.isToctouSensitiveOperation('tenant:transfer');
      expect(result.sensitive).toBe(true);
    });

    it('should identify permission:grant as sensitive', () => {
      const result = service.isToctouSensitiveOperation('permission:grant');
      expect(result.sensitive).toBe(true);
    });

    it('should return not sensitive for unknown operations', () => {
      const result = service.isToctouSensitiveOperation('unknown:operation');
      expect(result.sensitive).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('should match partial operation names (prefix)', () => {
      const result = service.isToctouSensitiveOperation('membership');
      expect(result.sensitive).toBe(true);
    });
  });

  // =========================================================================
  // logToctouIncident Tests (Req 28.7)
  // =========================================================================

  describe('logToctouIncident', () => {
    it('should log TOCTOU incident with full context', async () => {
      const entry: ToctouAuditEntry = {
        incidentId: 'test-incident-123',
        timestamp: new Date(),
        operationType: 'membership:update',
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        stateChange: 'Membership role changed from RESIDENT to ORG_ADMIN',
        context: {
          oldRole: 'RESIDENT',
          newRole: 'ORG_ADMIN',
          membershipId: MEMBERSHIP_ID,
        },
      };

      await service.logToctouIncident(entry);

      expect(mockAuditLogger.logIncident).toHaveBeenCalledWith(entry);
      expect(mockAuditLogger.entries.length).toBe(1);
      expect(mockAuditLogger.entries[0]!.incidentId).toBe('test-incident-123');
      expect(mockAuditLogger.entries[0]!.operationType).toBe('membership:update');
    });
  });

  // =========================================================================
  // Concurrent Operation Tests (Integration-style)
  // =========================================================================

  describe('Concurrent Operations', () => {
    it('should handle parallel membership modifications (Req 28.4)', async () => {
      const params: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        lockTimeoutMs: 100,
      };

      // Simulate concurrent operations
      const [result1, result2] = await Promise.all([
        service.resolveMembershipWithLock(params),
        service.resolveMembershipWithLock(params),
      ]);

      // One should succeed, one should fail
      const successes = [result1, result2].filter(r => r.success);
      const failures = [result1, result2].filter(r => !r.success);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      // The failure should be MEMBERSHIP_LOCK_TIMEOUT
      if (!failures[0]!.success) {
        expect(failures[0]!.error.code).toBe('MEMBERSHIP_LOCK_TIMEOUT');
      }
    });

    it('should check authorization after state change detection (Req 28.3)', async () => {
      let authorizationState = true;
      const authorizationCheck = vi.fn(async () => {
        // Simulate state change detection - auth becomes invalid
        authorizationState = false;
        return authorizationState;
      });

      // Simulate an operation that triggers state change
      const operation = vi.fn(async () => ({ result: 'should not execute' }));

      const params: ToctouSafeOperationParams<{ result: string }> = {
        operationType: 'membership:update',
        authorizationCheck,
        operation,
        context: { userId: USER_A_ID, tenantId: TENANT_A_ID },
      };

      const result = await service.executeWithToctouPrevention(params);

      expect(result.success).toBe(false);
      expect(operation).not.toHaveBeenCalled();
      expect(authorizationCheck).toHaveBeenCalled();
    });

    it('should reject update when version mismatch occurs', async () => {
      let currentVersion = 1;
      const updateFn = vi.fn(async () => {
        // Simulate concurrent update that increments version
        currentVersion = 2;
        return { updated: true };
      });
      
      // First read returns version 1
      const initialVersion = currentVersion;
      
      // By the time we check again, version changed
      const getCurrentVersion = vi.fn(async () => 2);

      const params: OptimisticLockUpdateParams<{ updated: boolean }> = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        expectedVersion: initialVersion, // 1
        updateFn,
        getCurrentVersion,
      };

      const result = await service.executeWithOptimisticLock(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('OPTIMISTIC_LOCK_FAILED');
      }
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    it('should have retryable flag on conflict errors', async () => {
      const params: ConflictDetectionParams = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        operation: 'update',
        expectedStateHash: 'hash-123',
        getCurrentStateHash: vi.fn(async () => 'hash-456'),
      };

      const result = await service.detectAndResolveConflict(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should have retryable flag on optimistic lock errors', async () => {
      const params: OptimisticLockUpdateParams<unknown> = {
        resourceType: 'membership',
        resourceId: MEMBERSHIP_ID,
        expectedVersion: 1,
        updateFn: async () => ({}),
        getCurrentVersion: async () => 2,
      };

      const result = await service.executeWithOptimisticLock(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should have retryable flag on lock timeout errors', async () => {
      const params: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        lockTimeoutMs: 100,
      };

      // Acquire lock first
      await service.resolveMembershipWithLock(params);

      // Second attempt should fail with timeout
      const result = await service.resolveMembershipWithLock(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  // =========================================================================
  // Default Service Configuration Tests
  // =========================================================================

  describe('Default Configuration', () => {
    it('should work with default audit logger when none provided', async () => {
      // Create service with no audit logger (uses default console logger)
      const defaultService = AuthorizationConcurrencyServiceImpl({});

      const operation = vi.fn(async () => ({ result: 'success' }));
      const authorizationCheck = vi.fn(async () => false); // Will trigger audit

      const params: ToctouSafeOperationParams<{ result: string }> = {
        operationType: 'membership:update',
        authorizationCheck,
        operation,
        context: { userId: USER_A_ID, tenantId: TENANT_A_ID },
      };

      // Should not throw even though it logs to console
      const result = await defaultService.executeWithToctouPrevention(params);
      expect(result.success).toBe(false);
    });

    it('should use default lock timeout of 5000ms', async () => {
      const params: ConcurrentMembershipResolutionParams = {
        userId: USER_A_ID,
        tenantId: TENANT_A_ID,
        // No lockTimeoutMs specified - should use default
      };

      const result = await service.resolveMembershipWithLock(params);
      expect(result.success).toBe(true);
    });
  });
});
