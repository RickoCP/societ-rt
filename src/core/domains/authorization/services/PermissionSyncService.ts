/**
 * PermissionSyncService — Handles permission synchronization across system components.
 *
 * This service implements permission sync mechanism per Requirements 35:
 * - Permission registry synchronization (sync permissions from source of truth)
 * - Cross-service permission consistency checks
 * - Sync conflict resolution (handle conflicting permission definitions)
 * - Sync audit logging (log all sync operations)
 *
 * **CRITICAL DESIGN DECISIONS:**
 * - Permission registry is the single source of truth (PERMISSION_REGISTRY)
 * - Sync operations are atomic (all-or-nothing for consistency)
 * - Conflict resolution strategies: SOURCE_WINS, TARGET_WINS, MERGE, REJECT
 * - All sync operations are audited with full context
 * - Performance target: sync < 100ms for standard permission set
 *
 * **Sync Scenarios:**
 * 1. Initial Sync: Populate target from source registry
 * 2. Incremental Sync: Update target with changed permissions
 * 3. Validation Sync: Check consistency without changes
 * 4. Force Sync: Override target with source (destructive)
 *
 * **Cross-Service Consistency:**
 * - Ensures all service components use the same permission definitions
 * - Detects drift between cached permissions and registry
 * - Alerts on inconsistencies for operational review
 *
 * @see Requirements 35 (Permission Sync Mechanism)
 * @see Design Components and Interfaces > Permission Registry
 * @see Task 67 — FASE 1.20
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { MembershipRole } from '@core/domains/membership/types';
import {
  permissionSyncFailed,
  permissionSyncConflict,
  permissionSyncValidationFailed,
  permissionSyncTimeout as _permissionSyncTimeout,
  permissionSyncSourceUnavailable as _permissionSyncSourceUnavailable,
} from '../errors';
import {
  PERMISSION_REGISTRY as _PERMISSION_REGISTRY,
  getPermissionsForRole,
  validatePermissionRegistry,
} from '../permissions/PermissionRegistry';
import type { ICacheInvalidationService } from './CacheInvalidationService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Sync operation type.
 */
export enum SyncOperationType {
  /** Initial sync — populate target from source */
  INITIAL = 'INITIAL',
  /** Incremental sync — update target with changes */
  INCREMENTAL = 'INCREMENTAL',
  /** Validation sync — check consistency without changes */
  VALIDATION = 'VALIDATION',
  /** Force sync — override target with source (destructive) */
  FORCE = 'FORCE',
}

/**
 * Sync status for tracking operation state.
 */
export enum SyncStatus {
  /** Sync operation pending */
  PENDING = 'PENDING',
  /** Sync operation in progress */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Sync operation completed successfully */
  COMPLETED = 'COMPLETED',
  /** Sync operation failed */
  FAILED = 'FAILED',
  /** Sync operation detected conflicts */
  CONFLICT = 'CONFLICT',
  /** Sync operation skipped (no changes needed) */
  SKIPPED = 'SKIPPED',
}

/**
 * Conflict resolution strategy.
 */
export enum ConflictResolutionStrategy {
  /** Source value wins — override target */
  SOURCE_WINS = 'SOURCE_WINS',
  /** Target value wins — keep target */
  TARGET_WINS = 'TARGET_WINS',
  /** Merge values — combine permissions (union) */
  MERGE = 'MERGE',
  /** Reject sync — abort operation on conflict */
  REJECT = 'REJECT',
}

/**
 * Single permission sync item.
 */
export interface PermissionSyncItem {
  /** The permission code being synced */
  readonly permissionCode: string;
  /** Value in source (if exists) */
  readonly sourceValue?: boolean;
  /** Value in target (if exists) */
  readonly targetValue?: boolean;
  /** Sync status for this item */
  readonly status: SyncStatus;
  /** Conflict detected */
  readonly hasConflict: boolean;
  /** Resolution applied (if conflict) */
  readonly resolution?: ConflictResolutionStrategy;
}

/**
 * Role permission sync item.
 */
export interface RolePermissionSyncItem {
  /** The role being synced */
  readonly role: MembershipRole;
  /** Permissions in source */
  readonly sourcePermissions: readonly string[];
  /** Permissions in target */
  readonly targetPermissions: readonly string[];
  /** Permissions added (in source, not in target) */
  readonly added: readonly string[];
  /** Permissions removed (in target, not in source) */
  readonly removed: readonly string[];
  /** Permissions unchanged */
  readonly unchanged: readonly string[];
  /** Sync status for this role */
  readonly status: SyncStatus;
  /** Conflict detected */
  readonly hasConflict: boolean;
}

/**
 * Permission sync result.
 */
export interface PermissionSyncResult {
  /** Unique sync operation ID */
  readonly syncId: string;
  /** Operation type */
  readonly operationType: SyncOperationType;
  /** Overall sync status */
  readonly status: SyncStatus;
  /** Timestamp when sync started */
  readonly startedAt: Date;
  /** Timestamp when sync completed */
  readonly completedAt: Date;
  /** Total permissions processed */
  readonly totalPermissions: number;
  /** Permissions successfully synced */
  readonly syncedCount: number;
  /** Permissions with conflicts */
  readonly conflictCount: number;
  /** Permissions skipped */
  readonly skippedCount: number;
  /** Detailed results per role */
  readonly roleResults: readonly RolePermissionSyncItem[];
  /** Total processing time in milliseconds */
  readonly durationMs: number;
  /** Source version/hash for tracking */
  readonly sourceVersion: string;
  /** Conflict resolution strategy used */
  readonly conflictStrategy: ConflictResolutionStrategy;
  /** Whether cache was invalidated */
  readonly cacheInvalidated: boolean;
  /** Error message if failed */
  readonly errorMessage?: string;
}

/**
 * Permission consistency check result.
 */
export interface ConsistencyCheckResult {
  /** Whether permissions are consistent */
  readonly isConsistent: boolean;
  /** Timestamp of the check */
  readonly checkedAt: Date;
  /** Source version/hash */
  readonly sourceVersion: string;
  /** Target version/hash (if available) */
  readonly targetVersion?: string;
  /** Inconsistencies found */
  readonly inconsistencies: readonly ConsistencyIssue[];
  /** Total roles checked */
  readonly rolesChecked: number;
  /** Total permissions checked */
  readonly permissionsChecked: number;
  /** Check duration in milliseconds */
  readonly durationMs: number;
}

/**
 * Single consistency issue.
 */
export interface ConsistencyIssue {
  /** Type of issue */
  readonly type: 'MISSING_IN_SOURCE' | 'MISSING_IN_TARGET' | 'VALUE_MISMATCH' | 'INVALID_PERMISSION';
  /** Role affected */
  readonly role: MembershipRole;
  /** Permission code affected */
  readonly permissionCode: string;
  /** Value in source */
  readonly sourceValue?: boolean;
  /** Value in target */
  readonly targetValue?: boolean;
  /** Severity of the issue */
  readonly severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  /** Description of the issue */
  readonly description: string;
}

/**
 * Sync configuration.
 */
export interface PermissionSyncConfig {
  /** Default conflict resolution strategy (default: REJECT) */
  readonly defaultConflictStrategy: ConflictResolutionStrategy;
  /** Timeout for sync operations in milliseconds (default: 5000) */
  readonly syncTimeoutMs: number;
  /** Whether to invalidate caches after sync (default: true) */
  readonly invalidateCacheOnSync: boolean;
  /** Whether to require confirmation for force sync (default: true) */
  readonly requireForceSyncConfirmation: boolean;
  /** Maximum sync retries on failure (default: 3) */
  readonly maxRetries: number;
  /** Enable detailed sync logging (default: true) */
  readonly enableDetailedLogging: boolean;
}

/**
 * Default sync configuration.
 */
export const DEFAULT_PERMISSION_SYNC_CONFIG: PermissionSyncConfig = {
  defaultConflictStrategy: ConflictResolutionStrategy.REJECT,
  syncTimeoutMs: 5000,
  invalidateCacheOnSync: true,
  requireForceSyncConfirmation: true,
  maxRetries: 3,
  enableDetailedLogging: true,
};

/**
 * Sync parameters.
 */
export interface SyncPermissionsParams {
  /** Operation type */
  readonly operationType: SyncOperationType;
  /** Target identifier (e.g., service name, cache namespace) */
  readonly targetId: string;
  /** Conflict resolution strategy override */
  readonly conflictStrategy?: ConflictResolutionStrategy;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Whether to dry-run (no actual changes) */
  readonly dryRun?: boolean;
  /** Force sync confirmation (required if requireForceSyncConfirmation=true) */
  readonly forceSyncConfirmed?: boolean;
}

/**
 * Permission target state for syncing.
 */
export interface PermissionTargetState {
  /** Target identifier */
  readonly targetId: string;
  /** Role to permission mapping in target */
  readonly rolePermissions: Readonly<Record<MembershipRole, readonly string[]>>;
  /** Target version/hash for tracking */
  readonly version?: string;
  /** Last sync timestamp */
  readonly lastSyncAt?: Date;
}

// ---------------------------------------------------------------------------
// Audit Logger Interface
// ---------------------------------------------------------------------------

/**
 * Audit entry for permission sync operations.
 */
export interface PermissionSyncAuditEntry {
  /** Unique operation ID */
  readonly operationId: string;
  /** Operation type */
  readonly operationType: SyncOperationType;
  /** Timestamp */
  readonly timestamp: Date;
  /** Target identifier */
  readonly targetId: string;
  /** Sync status */
  readonly status: SyncStatus;
  /** Roles affected */
  readonly rolesAffected: readonly MembershipRole[];
  /** Permissions synced count */
  readonly permissionsSynced: number;
  /** Conflicts detected */
  readonly conflictsDetected: number;
  /** Conflict strategy used */
  readonly conflictStrategy: ConflictResolutionStrategy;
  /** Was dry run */
  readonly dryRun: boolean;
  /** Cache invalidated */
  readonly cacheInvalidated: boolean;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Source version */
  readonly sourceVersion: string;
  /** Correlation ID */
  readonly correlationId?: string;
  /** Error message if failed */
  readonly errorMessage?: string;
  /** Initiator (user/service) */
  readonly initiatedBy?: string;
}

/**
 * Interface for permission sync audit logging.
 */
export interface IPermissionSyncAuditLogger {
  /**
   * Log a sync operation for audit purposes.
   */
  logSyncOperation(entry: PermissionSyncAuditEntry): Promise<void>;

  /**
   * Log a consistency check for audit purposes.
   */
  logConsistencyCheck(
    targetId: string,
    result: ConsistencyCheckResult,
    correlationId?: string,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IPermissionSyncService — Service interface for permission synchronization.
 *
 * This service provides methods for synchronizing permissions across system
 * components and ensuring consistency.
 */
export interface IPermissionSyncService {
  // -------------------------------------------------------------------------
  // Sync Operations
  // -------------------------------------------------------------------------

  /**
   * Synchronize permissions to a target.
   *
   * Syncs the central permission registry to a target service/cache.
   *
   * @param params - Sync parameters
   * @param targetState - Current state of the target (for comparison)
   * @returns DomainResult with sync result
   *
   * @see Requirements 35 — Permission registry synchronization
   */
  syncPermissions(
    params: SyncPermissionsParams,
    targetState?: PermissionTargetState,
  ): Promise<DomainResult<PermissionSyncResult>>;

  /**
   * Perform a full sync (force) to a target.
   *
   * Overrides target with source registry values. Requires confirmation.
   *
   * @param targetId - Target identifier
   * @param targetState - Current state of the target
   * @param confirmationToken - Confirmation token if required
   * @param correlationId - Correlation ID for tracing
   * @returns DomainResult with sync result
   *
   * @see Requirements 35 — Permission registry synchronization
   */
  forceSyncPermissions(
    targetId: string,
    targetState: PermissionTargetState,
    confirmationToken?: string,
    correlationId?: string,
  ): Promise<DomainResult<PermissionSyncResult>>;

  // -------------------------------------------------------------------------
  // Consistency Checking
  // -------------------------------------------------------------------------

  /**
   * Check permission consistency between source and target.
   *
   * Validates that the target has the same permissions as the source registry.
   *
   * @param targetId - Target identifier
   * @param targetState - Current state of the target
   * @param correlationId - Correlation ID for tracing
   * @returns DomainResult with consistency check result
   *
   * @see Requirements 35 — Cross-service permission consistency
   */
  checkConsistency(
    targetId: string,
    targetState: PermissionTargetState,
    correlationId?: string,
  ): Promise<DomainResult<ConsistencyCheckResult>>;

  /**
   * Validate the source permission registry.
   *
   * Checks that the permission registry is valid and consistent.
   *
   * @returns DomainResult with validation errors (empty array if valid)
   */
  validateSourceRegistry(): DomainResult<readonly string[]>;

  // -------------------------------------------------------------------------
  // Conflict Resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve a permission conflict.
   *
   * Applies the specified conflict resolution strategy to a conflict.
   *
   * @param role - The role with the conflict
   * @param sourcePermissions - Permissions in source
   * @param targetPermissions - Permissions in target
   * @param strategy - Resolution strategy
   * @returns Resolved permission set
   */
  resolveConflict(
    role: MembershipRole,
    sourcePermissions: readonly string[],
    targetPermissions: readonly string[],
    strategy: ConflictResolutionStrategy,
  ): readonly string[];

  // -------------------------------------------------------------------------
  // Source Access
  // -------------------------------------------------------------------------

  /**
   * Get the current source registry state.
   *
   * Returns the permission registry as a target state for comparison.
   *
   * @returns Current source state
   */
  getSourceState(): PermissionTargetState;

  /**
   * Compute a version hash for the current source registry.
   *
   * Used for change detection and sync tracking.
   *
   * @returns Version hash string
   */
  computeSourceVersion(): string;

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Get the current sync configuration.
   */
  getConfig(): PermissionSyncConfig;

  /**
   * Update the sync configuration.
   *
   * @param config - Partial config to merge
   */
  updateConfig(config: Partial<PermissionSyncConfig>): void;

  // -------------------------------------------------------------------------
  // Sync Status
  // -------------------------------------------------------------------------

  /**
   * Get the last sync result for a target.
   *
   * @param targetId - Target identifier
   * @returns Last sync result or undefined if never synced
   */
  getLastSyncResult(targetId: string): PermissionSyncResult | undefined;

  /**
   * Check if a target needs sync.
   *
   * Compares target version with source version.
   *
   * @param targetState - Current state of the target
   * @returns true if sync is needed, false otherwise
   */
  needsSync(targetState: PermissionTargetState): boolean;
}

// ---------------------------------------------------------------------------
// Console Audit Logger (Development/Testing)
// ---------------------------------------------------------------------------

/**
 * Console-based permission sync audit logger for development/testing.
 * Replace with proper audit logging service in production.
 */
export const ConsolePermissionSyncAuditLogger: IPermissionSyncAuditLogger = {
  async logSyncOperation(entry: PermissionSyncAuditEntry): Promise<void> {
    console.log('[PERMISSION_SYNC] Operation completed:', {
      operationId: entry.operationId,
      operationType: entry.operationType,
      timestamp: entry.timestamp.toISOString(),
      targetId: entry.targetId,
      status: entry.status,
      rolesAffected: entry.rolesAffected,
      permissionsSynced: entry.permissionsSynced,
      conflictsDetected: entry.conflictsDetected,
      conflictStrategy: entry.conflictStrategy,
      dryRun: entry.dryRun,
      cacheInvalidated: entry.cacheInvalidated,
      durationMs: entry.durationMs,
      sourceVersion: entry.sourceVersion,
      correlationId: entry.correlationId,
      errorMessage: entry.errorMessage,
    });
  },

  async logConsistencyCheck(
    targetId: string,
    result: ConsistencyCheckResult,
    correlationId?: string,
  ): Promise<void> {
    console.log('[PERMISSION_SYNC] Consistency check:', {
      targetId,
      isConsistent: result.isConsistent,
      checkedAt: result.checkedAt.toISOString(),
      rolesChecked: result.rolesChecked,
      permissionsChecked: result.permissionsChecked,
      inconsistenciesCount: result.inconsistencies.length,
      durationMs: result.durationMs,
      correlationId,
    });
  },
};

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a PermissionSyncService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param config - Optional sync configuration
 * @param auditLogger - Optional audit logger for sync operations
 * @param cacheInvalidationService - Optional cache invalidation service
 * @returns An implementation of IPermissionSyncService
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   permissionSyncService: asFunction(PermissionSyncServiceImpl).singleton(),
 * });
 *
 * // Usage
 * const syncService = DI.resolve('permissionSyncService');
 * const result = await syncService.syncPermissions({
 *   operationType: SyncOperationType.INCREMENTAL,
 *   targetId: 'auth-cache',
 * }, targetState);
 * ```
 */
export const PermissionSyncServiceImpl = ({
  config = DEFAULT_PERMISSION_SYNC_CONFIG,
  auditLogger = ConsolePermissionSyncAuditLogger,
  cacheInvalidationService,
}: {
  config?: PermissionSyncConfig;
  auditLogger?: IPermissionSyncAuditLogger;
  cacheInvalidationService?: ICacheInvalidationService;
} = {}): IPermissionSyncService => {
  // Mutable config
  let currentConfig = { ...config };

  // Sync result history (per target)
  const syncHistory = new Map<string, PermissionSyncResult>();

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique sync operation ID.
   */
  const generateSyncId = (): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `sync-${timestamp}-${random}`;
  };

  /**
   * Compute a simple hash for a permission set (for change detection).
   */
  const computePermissionHash = (
    rolePermissions: Readonly<Record<MembershipRole, readonly string[]>>,
  ): string => {
    // Sort and stringify for consistent hashing
    const entries = Object.entries(rolePermissions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([role, perms]) => `${role}:${[...perms].sort().join(',')}`);
    
    // Simple hash using string representation
    const str = entries.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `v${Math.abs(hash).toString(36)}`;
  };

  /**
   * Get all roles from the membership role enum.
   */
  const getAllRoles = (): MembershipRole[] => {
    return [
      'PLATFORM_ADMIN' as MembershipRole,
      'TENANT_OWNER' as MembershipRole,
      'ORG_ADMIN' as MembershipRole,
      'RT_ADMIN' as MembershipRole,
      'SECURITY' as MembershipRole,
      'RESIDENT' as MembershipRole,
    ];
  };

  /**
   * Get source permissions as a record.
   */
  const getSourcePermissionsRecord = (): Readonly<Record<MembershipRole, readonly string[]>> => {
    const result: Partial<Record<MembershipRole, readonly string[]>> = {};
    for (const role of getAllRoles()) {
      result[role] = [...getPermissionsForRole(role)];
    }
    return result as Readonly<Record<MembershipRole, readonly string[]>>;
  };

  /**
   * Compare two permission sets and return differences.
   */
  const comparePermissions = (
    source: readonly string[],
    target: readonly string[],
  ): { added: string[]; removed: string[]; unchanged: string[] } => {
    const sourceSet = new Set(source);
    const targetSet = new Set(target);

    const added: string[] = [];
    const removed: string[] = [];
    const unchanged: string[] = [];

    // Find added (in source, not in target)
    for (const perm of source) {
      if (targetSet.has(perm)) {
        unchanged.push(perm);
      } else {
        added.push(perm);
      }
    }

    // Find removed (in target, not in source)
    for (const perm of target) {
      if (!sourceSet.has(perm)) {
        removed.push(perm);
      }
    }

    return { added, removed, unchanged };
  };

  /**
   * Invalidate permission caches if service is available.
   */
  const invalidateCaches = async (): Promise<boolean> => {
    if (!cacheInvalidationService) {
      return false;
    }

    try {
      await cacheInvalidationService.invalidateAllPermissions();
      return true;
    } catch (error) {
      console.error('[PERMISSION_SYNC] Cache invalidation failed:', error);
      return false;
    }
  };

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  return {
    /**
     * Synchronize permissions to a target.
     */
    async syncPermissions(
      params: SyncPermissionsParams,
      targetState?: PermissionTargetState,
    ): Promise<DomainResult<PermissionSyncResult>> {
      const startTime = Date.now();
      const syncId = generateSyncId();
      const {
        operationType,
        targetId,
        conflictStrategy = currentConfig.defaultConflictStrategy,
        correlationId,
        dryRun = false,
      } = params;

      try {
        // Validate source registry first
        const validationErrors = validatePermissionRegistry();
        if (validationErrors.length > 0) {
          return fail(permissionSyncValidationFailed(validationErrors.join('; ')));
        }

        const sourcePermissions = getSourcePermissionsRecord();
        const sourceVersion = computePermissionHash(sourcePermissions);

        // Get target permissions (empty if not provided)
        const targetPermissions = targetState?.rolePermissions ?? {} as Record<MembershipRole, readonly string[]>;

        const roleResults: RolePermissionSyncItem[] = [];
        const rolesAffected: MembershipRole[] = [];
        let totalPermissions = 0;
        let syncedCount = 0;
        let conflictCount = 0;
        let skippedCount = 0;

        // Process each role
        for (const role of getAllRoles()) {
          const sourcePerms = sourcePermissions[role] ?? [];
          const targetPerms = targetPermissions[role] ?? [];
          
          totalPermissions += sourcePerms.length;

          const { added, removed, unchanged } = comparePermissions(sourcePerms, targetPerms);
          const hasChanges = added.length > 0 || removed.length > 0;
          const hasConflict = hasChanges && operationType === SyncOperationType.VALIDATION;

          let status: SyncStatus;
          if (!hasChanges) {
            status = SyncStatus.SKIPPED;
            skippedCount += sourcePerms.length;
          } else if (hasConflict && conflictStrategy === ConflictResolutionStrategy.REJECT) {
            status = SyncStatus.CONFLICT;
            conflictCount += added.length + removed.length;
          } else {
            status = dryRun ? SyncStatus.PENDING : SyncStatus.COMPLETED;
            syncedCount += added.length + removed.length;
            if (hasChanges) {
              rolesAffected.push(role);
            }
          }

          if (hasChanges) {
            conflictCount++;
          }

          roleResults.push({
            role,
            sourcePermissions: sourcePerms,
            targetPermissions: targetPerms,
            added,
            removed,
            unchanged,
            status,
            hasConflict: hasChanges && conflictStrategy === ConflictResolutionStrategy.REJECT,
          });
        }

        // Determine overall status
        let overallStatus: SyncStatus;
        if (conflictCount > 0 && conflictStrategy === ConflictResolutionStrategy.REJECT) {
          overallStatus = SyncStatus.CONFLICT;
        } else if (syncedCount === 0 && skippedCount > 0) {
          overallStatus = SyncStatus.SKIPPED;
        } else if (dryRun) {
          overallStatus = SyncStatus.PENDING;
        } else {
          overallStatus = SyncStatus.COMPLETED;
        }

        // Invalidate caches if configured and not dry run
        let cacheInvalidated = false;
        if (!dryRun && currentConfig.invalidateCacheOnSync && overallStatus === SyncStatus.COMPLETED) {
          cacheInvalidated = await invalidateCaches();
        }

        const completedAt = new Date();
        const durationMs = Date.now() - startTime;

        const result: PermissionSyncResult = {
          syncId,
          operationType,
          status: overallStatus,
          startedAt: new Date(startTime),
          completedAt,
          totalPermissions,
          syncedCount,
          conflictCount: conflictStrategy === ConflictResolutionStrategy.REJECT ? conflictCount : 0,
          skippedCount,
          roleResults,
          durationMs,
          sourceVersion,
          conflictStrategy,
          cacheInvalidated,
        };

        // Store in history
        syncHistory.set(targetId, result);

        // Audit log
        await auditLogger.logSyncOperation({
          operationId: syncId,
          operationType,
          timestamp: completedAt,
          targetId,
          status: overallStatus,
          rolesAffected,
          permissionsSynced: syncedCount,
          conflictsDetected: conflictCount,
          conflictStrategy,
          dryRun,
          cacheInvalidated,
          durationMs,
          sourceVersion,
          correlationId,
        });

        return ok(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Audit log failure
        await auditLogger.logSyncOperation({
          operationId: syncId,
          operationType,
          timestamp: new Date(),
          targetId,
          status: SyncStatus.FAILED,
          rolesAffected: [],
          permissionsSynced: 0,
          conflictsDetected: 0,
          conflictStrategy,
          dryRun,
          cacheInvalidated: false,
          durationMs: Date.now() - startTime,
          sourceVersion: '',
          correlationId,
          errorMessage,
        });

        return fail(permissionSyncFailed(targetId, error));
      }
    },

    /**
     * Perform a full sync (force) to a target.
     */
    async forceSyncPermissions(
      targetId: string,
      targetState: PermissionTargetState,
      confirmationToken?: string,
      correlationId?: string,
    ): Promise<DomainResult<PermissionSyncResult>> {
      // Check confirmation if required
      if (currentConfig.requireForceSyncConfirmation && !confirmationToken) {
        return fail(permissionSyncConflict(
          'Force sync requires confirmation. Provide a confirmation token.',
          [{ type: 'CONFIRMATION_REQUIRED', role: 'PLATFORM_ADMIN' as MembershipRole, permissionCode: '*', severity: 'ERROR' as const, description: 'Force sync requires explicit confirmation' }],
        ));
      }

      return this.syncPermissions(
        {
          operationType: SyncOperationType.FORCE,
          targetId,
          conflictStrategy: ConflictResolutionStrategy.SOURCE_WINS,
          correlationId,
          forceSyncConfirmed: true,
        },
        targetState,
      );
    },

    /**
     * Check permission consistency between source and target.
     */
    async checkConsistency(
      targetId: string,
      targetState: PermissionTargetState,
      correlationId?: string,
    ): Promise<DomainResult<ConsistencyCheckResult>> {
      const startTime = Date.now();

      try {
        const sourcePermissions = getSourcePermissionsRecord();
        const sourceVersion = computePermissionHash(sourcePermissions);
        const targetPermissions = targetState.rolePermissions;

        const inconsistencies: ConsistencyIssue[] = [];
        let permissionsChecked = 0;

        // Check each role
        for (const role of getAllRoles()) {
          const sourcePerms = sourcePermissions[role] ?? [];
          const targetPerms = targetPermissions[role] ?? [];
          
          permissionsChecked += sourcePerms.length;

          const sourceSet = new Set(sourcePerms);
          const targetSet = new Set(targetPerms);

          // Check for missing in target
          for (const perm of sourcePerms) {
            if (!targetSet.has(perm)) {
              inconsistencies.push({
                type: 'MISSING_IN_TARGET',
                role,
                permissionCode: perm,
                sourceValue: true,
                targetValue: false,
                severity: 'ERROR',
                description: `Permission ${perm} exists in source but missing in target for role ${role}`,
              });
            }
          }

          // Check for extra in target (missing in source)
          for (const perm of targetPerms) {
            if (!sourceSet.has(perm)) {
              inconsistencies.push({
                type: 'MISSING_IN_SOURCE',
                role,
                permissionCode: perm,
                sourceValue: false,
                targetValue: true,
                severity: 'WARNING',
                description: `Permission ${perm} exists in target but missing in source for role ${role}`,
              });
            }
          }
        }

        const result: ConsistencyCheckResult = {
          isConsistent: inconsistencies.length === 0,
          checkedAt: new Date(),
          sourceVersion,
          targetVersion: targetState.version,
          inconsistencies,
          rolesChecked: getAllRoles().length,
          permissionsChecked,
          durationMs: Date.now() - startTime,
        };

        // Audit log
        await auditLogger.logConsistencyCheck(targetId, result, correlationId);

        return ok(result);
      } catch (error) {
        return fail(permissionSyncFailed(targetId, error));
      }
    },

    /**
     * Validate the source permission registry.
     */
    validateSourceRegistry(): DomainResult<readonly string[]> {
      try {
        const errors = validatePermissionRegistry();
        return ok(errors);
      } catch (error) {
        return fail(permissionSyncValidationFailed(
          error instanceof Error ? error.message : 'Unknown validation error',
        ));
      }
    },

    /**
     * Resolve a permission conflict.
     */
    resolveConflict(
      _role: MembershipRole,
      sourcePermissions: readonly string[],
      targetPermissions: readonly string[],
      strategy: ConflictResolutionStrategy,
    ): readonly string[] {
      switch (strategy) {
        case ConflictResolutionStrategy.SOURCE_WINS:
          return sourcePermissions;

        case ConflictResolutionStrategy.TARGET_WINS:
          return targetPermissions;

        case ConflictResolutionStrategy.MERGE:
          // Union of both sets
          return [...new Set([...sourcePermissions, ...targetPermissions])];

        case ConflictResolutionStrategy.REJECT:
          // Return source (caller should handle conflict)
          return sourcePermissions;

        default:
          return sourcePermissions;
      }
    },

    /**
     * Get the current source registry state.
     */
    getSourceState(): PermissionTargetState {
      const rolePermissions = getSourcePermissionsRecord();
      return {
        targetId: 'source-registry',
        rolePermissions,
        version: computePermissionHash(rolePermissions),
        lastSyncAt: new Date(),
      };
    },

    /**
     * Compute a version hash for the current source registry.
     */
    computeSourceVersion(): string {
      return computePermissionHash(getSourcePermissionsRecord());
    },

    /**
     * Get the current sync configuration.
     */
    getConfig(): PermissionSyncConfig {
      return { ...currentConfig };
    },

    /**
     * Update the sync configuration.
     */
    updateConfig(config: Partial<PermissionSyncConfig>): void {
      currentConfig = { ...currentConfig, ...config };
    },

    /**
     * Get the last sync result for a target.
     */
    getLastSyncResult(targetId: string): PermissionSyncResult | undefined {
      return syncHistory.get(targetId);
    },

    /**
     * Check if a target needs sync.
     */
    needsSync(targetState: PermissionTargetState): boolean {
      const sourceVersion = computePermissionHash(getSourcePermissionsRecord());
      return targetState.version !== sourceVersion;
    },
  };
};

// Type alias for convenience
export type PermissionSyncService = IPermissionSyncService;
