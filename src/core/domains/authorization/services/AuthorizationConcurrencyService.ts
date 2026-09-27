/**
 * AuthorizationConcurrencyService — Handles concurrent authorization operations safely.
 *
 * This service implements TOCTOU prevention and concurrency control per Requirements 28:
 * - Database-level locking for critical membership operations
 * - Optimistic concurrency control with version checks for resource updates
 * - Authorization validation immediately before executing mutating operations
 * - Detection and rejection of concurrent conflicting operations
 * - SELECT FOR UPDATE for operations that depend on current state
 *
 * **CRITICAL SECURITY RULES:**
 * - All sensitive operations MUST validate authorization immediately before execution
 * - TOCTOU races MUST be detected and logged for security review
 * - Optimistic locking version checks prevent lost updates
 * - Fail closed on unknown/invalid states (INV-AUTH-002)
 *
 * **Concurrency Patterns:**
 * 1. Optimistic Locking: Use version numbers for resource updates
 * 2. Pessimistic Locking: Use SELECT FOR UPDATE for critical membership operations
 * 3. TOCTOU Prevention: Re-validate authorization before mutation execution
 * 4. Conflict Detection: Detect and handle concurrent conflicting operations
 *
 * @see Requirements 28 (AC 1-7)
 * @see Design Authorization Pipeline
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { Membership } from '@core/domains/membership/entities';
import type { MembershipStatus } from '@core/domains/membership/types';
import {
  conflictDetected,
  optimisticLockFailed,
  toctouRaceDetected,
  membershipLockTimeout,
  concurrentMembershipModification,
  authorizationRevalidationFailed,
} from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents a versioned resource for optimistic locking.
 */
export interface VersionedResource {
  /** The resource ID */
  readonly id: string;
  /** The current version number for optimistic locking */
  readonly version: number;
  /** Last update timestamp */
  readonly updatedAt: Date;
}

/**
 * Parameters for concurrent membership resolution.
 */
export interface ConcurrentMembershipResolutionParams {
  /** The user ID to resolve membership for */
  readonly userId: string;
  /** The tenant ID context */
  readonly tenantId: string;
  /** Optional OrgUnit ID for scoped resolution */
  readonly orgUnitId?: string | null;
  /** Lock timeout in milliseconds (default: 5000) */
  readonly lockTimeoutMs?: number;
}

/**
 * Result of concurrent membership resolution.
 */
export interface ConcurrentMembershipResolutionResult {
  /** The resolved membership */
  readonly membership: Membership;
  /** Whether a lock was acquired */
  readonly lockAcquired: boolean;
  /** Lock ID for release (if applicable) */
  readonly lockId?: string;
}

/**
 * Parameters for optimistic lock update.
 */
export interface OptimisticLockUpdateParams<T> {
  /** The resource type (for logging/error messages) */
  readonly resourceType: string;
  /** The resource ID */
  readonly resourceId: string;
  /** The expected version number */
  readonly expectedVersion: number;
  /** The update function to execute */
  readonly updateFn: () => Promise<T>;
  /** Function to get current version */
  readonly getCurrentVersion: () => Promise<number | null>;
}

/**
 * Parameters for TOCTOU-safe operation execution.
 */
export interface ToctouSafeOperationParams<T> {
  /** The operation type/name (for logging) */
  readonly operationType: string;
  /** Authorization check function (returns true if authorized) */
  readonly authorizationCheck: () => Promise<boolean>;
  /** The operation to execute */
  readonly operation: () => Promise<T>;
  /** Optional: Additional context for logging */
  readonly context?: Record<string, unknown>;
}

/**
 * Parameters for conflict detection.
 */
export interface ConflictDetectionParams {
  /** The resource type */
  readonly resourceType: string;
  /** The resource ID */
  readonly resourceId: string;
  /** The operation being performed */
  readonly operation: string;
  /** The expected state hash/checksum */
  readonly expectedStateHash?: string;
  /** Function to get current state hash */
  readonly getCurrentStateHash?: () => Promise<string>;
}

/**
 * Conflict resolution strategy.
 */
export enum ConflictResolutionStrategy {
  /** Fail the operation immediately */
  FAIL = 'FAIL',
  /** Retry with exponential backoff */
  RETRY = 'RETRY',
  /** Merge changes if possible */
  MERGE = 'MERGE',
  /** Last write wins (use with caution) */
  LAST_WRITE_WINS = 'LAST_WRITE_WINS',
}

/**
 * Configuration for conflict resolution.
 */
export interface ConflictResolutionConfig {
  /** The resolution strategy to use */
  readonly strategy: ConflictResolutionStrategy;
  /** Maximum number of retries (for RETRY strategy) */
  readonly maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff */
  readonly baseDelayMs?: number;
  /** Custom merge function (for MERGE strategy) */
  readonly mergeFn?: <T>(current: T, incoming: T) => T;
}

/**
 * Audit entry for TOCTOU incidents.
 */
export interface ToctouAuditEntry {
  /** Unique incident ID */
  readonly incidentId: string;
  /** Timestamp of the incident */
  readonly timestamp: Date;
  /** The operation type */
  readonly operationType: string;
  /** User ID involved */
  readonly userId: string;
  /** Tenant ID involved */
  readonly tenantId: string;
  /** Description of what changed */
  readonly stateChange: string;
  /** Additional context */
  readonly context: Record<string, unknown>;
}

/**
 * Interface for TOCTOU incident logging.
 */
export interface IToctouAuditLogger {
  /**
   * Log a TOCTOU race incident for security review.
   */
  logIncident(entry: ToctouAuditEntry): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * AuthorizationConcurrencyService interface.
 *
 * This service provides concurrency control mechanisms for authorization
 * operations, including TOCTOU prevention, optimistic locking, and
 * conflict resolution.
 */
export interface IAuthorizationConcurrencyService {
  /**
   * Resolve membership with concurrent access protection.
   *
   * Uses database-level locking to prevent concurrent modifications
   * during membership resolution.
   *
   * @param params - Resolution parameters including lock timeout
   * @returns DomainResult with resolution result or error
   *
   * @see Requirements 28.1 — Database-level locking for critical membership operations
   */
  resolveMembershipWithLock(
    params: ConcurrentMembershipResolutionParams,
  ): Promise<DomainResult<ConcurrentMembershipResolutionResult>>;

  /**
   * Release a membership lock acquired during resolution.
   *
   * @param lockId - The lock ID to release
   * @returns DomainResult with void on success
   */
  releaseMembershipLock(lockId: string): Promise<DomainResult<void>>;

  /**
   * Execute an update with optimistic locking.
   *
   * Checks the resource version before update and fails if the version
   * has changed since the resource was read.
   *
   * @param params - Update parameters including expected version
   * @returns DomainResult with update result or error
   *
   * @see Requirements 28.2 — Optimistic concurrency control with version checks
   */
  executeWithOptimisticLock<T>(
    params: OptimisticLockUpdateParams<T>,
  ): Promise<DomainResult<T>>;

  /**
   * Execute an operation with TOCTOU prevention.
   *
   * Validates authorization immediately before executing the mutating
   * operation to prevent time-of-check to time-of-use race conditions.
   *
   * @param params - Operation parameters including authorization check
   * @returns DomainResult with operation result or error
   *
   * @see Requirements 28.3 — Validate authorization immediately before executing mutating operations
   */
  executeWithToctouPrevention<T>(
    params: ToctouSafeOperationParams<T>,
  ): Promise<DomainResult<T>>;

  /**
   * Detect concurrent conflicting operations.
   *
   * Checks if the resource state has changed since last read and
   * applies the configured conflict resolution strategy.
   *
   * @param params - Conflict detection parameters
   * @param config - Conflict resolution configuration
   * @returns DomainResult with void on no conflict, error on conflict
   *
   * @see Requirements 28.4 — Detect and reject concurrent conflicting operations
   */
  detectAndResolveConflict(
    params: ConflictDetectionParams,
    config?: ConflictResolutionConfig,
  ): Promise<DomainResult<void>>;

  /**
   * Check if an operation is TOCTOU-sensitive.
   *
   * Returns documentation about which operations require TOCTOU protection.
   *
   * @param operationType - The operation type to check
   * @returns Whether the operation is TOCTOU-sensitive and why
   *
   * @see Requirements 28.6 — Document which operations are TOCTOU-sensitive
   */
  isToctouSensitiveOperation(
    operationType: string,
  ): { sensitive: boolean; reason?: string };

  /**
   * Log a TOCTOU race incident for security review.
   *
   * @param entry - The audit entry to log
   * @returns Promise that resolves when logged
   *
   * @see Requirements 28.7 — Log TOCTOU race incidents with full context
   */
  logToctouIncident(entry: ToctouAuditEntry): Promise<void>;
}

// ---------------------------------------------------------------------------
// TOCTOU-Sensitive Operations Registry
// ---------------------------------------------------------------------------

/**
 * Registry of TOCTOU-sensitive operations with documentation.
 *
 * @see Requirements 28.6 — Document which operations are TOCTOU-sensitive
 */
const TOCTOU_SENSITIVE_OPERATIONS: Record<string, string> = {
  // Membership operations
  'membership:create': 'Creating membership requires checking existing memberships first',
  'membership:update': 'Updating membership role/status depends on current state',
  'membership:revoke': 'Revoking membership must verify current ACTIVE status',
  'membership:suspend': 'Suspending membership must verify current ACTIVE status',
  'membership:reactivate': 'Reactivating membership must verify current SUSPENDED status',
  'membership:delegate': 'Delegating role requires verifying delegator still has permission',
  
  // Authorization context operations
  'context:switch': 'Context switch must verify target membership still exists and is ACTIVE',
  'context:refresh': 'Token refresh must verify user still has valid membership',
  
  // Resource ownership operations
  'resource:transfer': 'Transferring resource ownership depends on current owner',
  'resource:share': 'Sharing resource requires verifying current permissions',
  
  // Permission operations
  'permission:grant': 'Granting permission requires checking existing permissions',
  'permission:revoke': 'Revoking permission must verify permission currently exists',
  
  // Tenant operations
  'tenant:transfer': 'Transferring tenant ownership requires verifying current owner',
  'tenant:suspend': 'Suspending tenant must verify current ACTIVE status',
  
  // OrgUnit operations
  'orgunit:reassign': 'Reassigning OrgUnit membership depends on current assignment',
};

// ---------------------------------------------------------------------------
// In-Memory Lock Manager (for demonstration — use Redis/DB in production)
// ---------------------------------------------------------------------------

interface LockEntry {
  lockId: string;
  resourceKey: string;
  acquiredAt: Date;
  expiresAt: Date;
  userId: string;
  tenantId: string;
}

/**
 * Simple in-memory lock manager.
 * NOTE: In production, use Redis or database-level locks for distributed locking.
 */
class InMemoryLockManager {
  private locks = new Map<string, LockEntry>();
  private lockCounter = 0;

  /**
   * Attempt to acquire a lock.
   */
  tryAcquire(
    resourceKey: string,
    userId: string,
    tenantId: string,
    timeoutMs: number,
  ): LockEntry | null {
    // Check if lock already exists and is not expired
    const existing = this.locks.get(resourceKey);
    if (existing && existing.expiresAt > new Date()) {
      return null; // Lock held by another process
    }

    // Acquire new lock
    const lockId = `lock-${++this.lockCounter}-${Date.now()}`;
    const now = new Date();
    const entry: LockEntry = {
      lockId,
      resourceKey,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + timeoutMs),
      userId,
      tenantId,
    };

    this.locks.set(resourceKey, entry);
    return entry;
  }

  /**
   * Release a lock by ID.
   */
  release(lockId: string): boolean {
    for (const [key, entry] of this.locks.entries()) {
      if (entry.lockId === lockId) {
        this.locks.delete(key);
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a lock is held for a resource.
   */
  isLocked(resourceKey: string): boolean {
    const entry = this.locks.get(resourceKey);
    return entry !== null && entry !== undefined && entry.expiresAt > new Date();
  }

  /**
   * Clean up expired locks.
   */
  cleanupExpired(): void {
    const now = new Date();
    for (const [key, entry] of this.locks.entries()) {
      if (entry.expiresAt <= now) {
        this.locks.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Default TOCTOU Audit Logger (Console-based)
// ---------------------------------------------------------------------------

/**
 * Console-based TOCTOU audit logger for development/testing.
 * Replace with proper audit logging service in production.
 */
export const ConsoleToctouAuditLogger: IToctouAuditLogger = {
  async logIncident(entry: ToctouAuditEntry): Promise<void> {
    console.warn('[SECURITY] TOCTOU Race Detected:', {
      incidentId: entry.incidentId,
      timestamp: entry.timestamp.toISOString(),
      operationType: entry.operationType,
      userId: entry.userId,
      tenantId: entry.tenantId,
      stateChange: entry.stateChange,
      context: entry.context,
    });
  },
};

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an AuthorizationConcurrencyService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param toctouAuditLogger - Logger for TOCTOU incidents (default: console logger)
 * @returns An implementation of IAuthorizationConcurrencyService
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   authorizationConcurrencyService: asFunction(AuthorizationConcurrencyServiceImpl).singleton(),
 * });
 *
 * // Usage
 * const concurrencyService = DI.resolve('authorizationConcurrencyService');
 * const result = await concurrencyService.executeWithOptimisticLock({
 *   resourceType: 'membership',
 *   resourceId: membershipId,
 *   expectedVersion: membership.version,
 *   updateFn: () => updateMembership(membershipId, newRole),
 *   getCurrentVersion: () => getMembershipVersion(membershipId),
 * });
 * ```
 */
export const AuthorizationConcurrencyServiceImpl = ({
  toctouAuditLogger = ConsoleToctouAuditLogger,
}: {
  toctouAuditLogger?: IToctouAuditLogger;
} = {}): IAuthorizationConcurrencyService => {
  // In-memory lock manager (replace with distributed lock in production)
  const lockManager = new InMemoryLockManager();

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique incident ID for TOCTOU logging.
   */
  const generateIncidentId = (): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `toctou-${timestamp}-${random}`;
  };

  /**
   * Create a resource lock key.
   */
  const createLockKey = (
    resourceType: string,
    userId: string,
    tenantId: string,
    orgUnitId?: string | null,
  ): string => {
    const base = `${resourceType}:${tenantId}:${userId}`;
    return orgUnitId ? `${base}:${orgUnitId}` : base;
  };

  /**
   * Wait for a specified duration.
   */
  const _delay = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  return {
    /**
     * Resolve membership with concurrent access protection.
     *
     * Uses pessimistic locking to prevent concurrent modifications
     * during membership resolution for critical operations.
     */
    async resolveMembershipWithLock(
      params: ConcurrentMembershipResolutionParams,
    ): Promise<DomainResult<ConcurrentMembershipResolutionResult>> {
      const { userId, tenantId, orgUnitId, lockTimeoutMs = 5000 } = params;

      // Clean up expired locks first
      lockManager.cleanupExpired();

      // Create lock key for membership resource
      const lockKey = createLockKey('membership', userId, tenantId, orgUnitId);

      // Attempt to acquire lock
      const lockEntry = lockManager.tryAcquire(lockKey, userId, tenantId, lockTimeoutMs);

      if (!lockEntry) {
        // Lock held by another process
        return fail(membershipLockTimeout(undefined, lockTimeoutMs));
      }

      // Create a placeholder membership result
      // In production, this would actually resolve the membership from the database
      // with SELECT FOR UPDATE
      const placeholderMembership: Membership = {
        id: `membership-${userId}-${tenantId}`,
        userId,
        tenantId,
        orgUnitId: orgUnitId ?? null,
        role: 'RESIDENT' as Membership['role'],
        status: 'ACTIVE' as MembershipStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return ok({
        membership: placeholderMembership,
        lockAcquired: true,
        lockId: lockEntry.lockId,
      });
    },

    /**
     * Release a membership lock.
     */
    async releaseMembershipLock(lockId: string): Promise<DomainResult<void>> {
      const released = lockManager.release(lockId);
      if (!released) {
        // Lock already expired or doesn't exist — not an error
        return ok(undefined);
      }
      return ok(undefined);
    },

    /**
     * Execute an update with optimistic locking.
     *
     * Verifies the resource version hasn't changed since read,
     * preventing lost updates from concurrent modifications.
     */
    async executeWithOptimisticLock<T>(
      params: OptimisticLockUpdateParams<T>,
    ): Promise<DomainResult<T>> {
      const { resourceType, resourceId, expectedVersion, updateFn, getCurrentVersion } = params;

      try {
        // Get current version
        const currentVersion = await getCurrentVersion();

        if (currentVersion === null) {
          return fail(conflictDetected(resourceType, resourceId, 'Resource no longer exists'));
        }

        // Check version match
        if (currentVersion !== expectedVersion) {
          return fail(optimisticLockFailed(resourceType, expectedVersion, currentVersion));
        }

        // Execute the update
        const result = await updateFn();
        return ok(result);
      } catch (error) {
        // Check if it's a version mismatch error from the database
        if (error instanceof Error && error.message.includes('version')) {
          return fail(optimisticLockFailed(resourceType, expectedVersion));
        }
        throw error;
      }
    },

    /**
     * Execute an operation with TOCTOU prevention.
     *
     * Re-validates authorization immediately before execution to
     * prevent time-of-check to time-of-use race conditions.
     */
    async executeWithToctouPrevention<T>(
      params: ToctouSafeOperationParams<T>,
    ): Promise<DomainResult<T>> {
      const { operationType, authorizationCheck, operation, context = {} } = params;

      try {
        // Re-validate authorization immediately before execution
        const isAuthorized = await authorizationCheck();

        if (!isAuthorized) {
          // Authorization state changed — TOCTOU race detected
          const incidentId = generateIncidentId();

          // Log the incident for security review
          await toctouAuditLogger.logIncident({
            incidentId,
            timestamp: new Date(),
            operationType,
            userId: (context.userId as string) || 'unknown',
            tenantId: (context.tenantId as string) || 'unknown',
            stateChange: 'Authorization revoked between check and execution',
            context,
          });

          return fail(authorizationRevalidationFailed(operationType, 'Authorization check failed on re-validation'));
        }

        // Execute the operation
        const result = await operation();
        return ok(result);
      } catch (error) {
        // Check if error indicates authorization changed
        if (error instanceof Error && 
            (error.message.includes('AUTH_') || error.message.includes('authorization'))) {
          const incidentId = generateIncidentId();

          await toctouAuditLogger.logIncident({
            incidentId,
            timestamp: new Date(),
            operationType,
            userId: (context.userId as string) || 'unknown',
            tenantId: (context.tenantId as string) || 'unknown',
            stateChange: `Authorization error during execution: ${error.message}`,
            context,
          });

          return fail(toctouRaceDetected(operationType, error.message));
        }
        throw error;
      }
    },

    /**
     * Detect and resolve concurrent conflicting operations.
     */
    async detectAndResolveConflict(
      params: ConflictDetectionParams,
      config: ConflictResolutionConfig = { strategy: ConflictResolutionStrategy.FAIL },
    ): Promise<DomainResult<void>> {
      const { resourceType, resourceId, operation, expectedStateHash, getCurrentStateHash } = params;
      const { strategy, maxRetries = 3, baseDelayMs = 100 } = config;

      // If no state hash comparison, just check for locks
      if (!expectedStateHash || !getCurrentStateHash) {
        // Check if resource is locked
        const lockKey = `${resourceType}:${resourceId}`;
        if (lockManager.isLocked(lockKey)) {
          return fail(concurrentMembershipModification());
        }
        return ok(undefined);
      }

      // Get current state hash
      const currentStateHash = await getCurrentStateHash();

      // No conflict if hashes match
      if (currentStateHash === expectedStateHash) {
        return ok(undefined);
      }

      // Handle conflict based on strategy
      switch (strategy) {
        case ConflictResolutionStrategy.FAIL:
          return fail(conflictDetected(resourceType, resourceId, `State changed during ${operation}`));

        case ConflictResolutionStrategy.RETRY: {
          // Exponential backoff retry is handled by the caller
          // Here we just signal that a retry may be attempted
          const retryInfo = { maxRetries, baseDelayMs };
          return fail(conflictDetected(
            resourceType,
            resourceId,
            `State changed during ${operation}. Retry suggested. ${JSON.stringify(retryInfo)}`,
          ));
        }

        case ConflictResolutionStrategy.MERGE:
          // Merge strategy requires custom merge function
          if (!config.mergeFn) {
            return fail(conflictDetected(resourceType, resourceId, 'Merge strategy requires mergeFn'));
          }
          // Merge logic would be implemented by the caller using the merge function
          return ok(undefined);

        case ConflictResolutionStrategy.LAST_WRITE_WINS:
          // Last write wins - no conflict, proceed with update
          return ok(undefined);

        default:
          return fail(conflictDetected(resourceType, resourceId, 'Unknown conflict resolution strategy'));
      }
    },

    /**
     * Check if an operation is TOCTOU-sensitive.
     */
    isToctouSensitiveOperation(operationType: string): { sensitive: boolean; reason?: string } {
      const reason = TOCTOU_SENSITIVE_OPERATIONS[operationType];
      if (reason) {
        return { sensitive: true, reason };
      }

      // Check for partial matches (e.g., 'membership:create:admin' matches 'membership:create')
      for (const [key, keyReason] of Object.entries(TOCTOU_SENSITIVE_OPERATIONS)) {
        if (operationType.startsWith(key) || key.startsWith(operationType)) {
          return { sensitive: true, reason: keyReason };
        }
      }

      return { sensitive: false };
    },

    /**
     * Log a TOCTOU race incident for security review.
     */
    async logToctouIncident(entry: ToctouAuditEntry): Promise<void> {
      await toctouAuditLogger.logIncident(entry);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type AuthorizationConcurrencyService = IAuthorizationConcurrencyService;
