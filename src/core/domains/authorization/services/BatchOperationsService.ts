/**
 * BatchOperationsService — Handles batch authorization operations.
 *
 * This service implements batch operations support per Requirements 33:
 * - Batch permission checks (check multiple permissions in one call)
 * - Batch membership updates (update multiple memberships atomically)
 * - Transaction management for batches (all-or-nothing or partial success)
 * - Partial failure handling with detailed results per item
 *
 * **CRITICAL DESIGN DECISIONS:**
 * - Batch size limit enforced to prevent resource exhaustion (default: 100)
 * - Transaction mode selectable: ATOMIC (all-or-nothing) or PARTIAL (best-effort)
 * - Detailed results provided for each item in the batch
 * - Performance target: batch check < 100ms for up to 100 items
 *
 * **Batch Operation Types:**
 * 1. Permission Checks: Check multiple permissions for one user in one call
 * 2. Membership Updates: Update multiple membership records atomically
 * 3. Authorization Queries: Query authorization status for multiple users
 * 4. Cache Operations: Batch invalidate authorization caches
 *
 * **Transaction Semantics:**
 * - ATOMIC: All operations succeed or all fail (rollback)
 * - PARTIAL: Each operation independent, returns detailed results
 *
 * @see Requirements 33 (AC 1-7)
 * @see Design Authorization Pipeline
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import {
  batchOperationFailed,
  batchPartialFailure,
  batchSizeLimitExceeded,
  batchTransactionFailed,
  batchEmptyItems,
} from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Transaction mode for batch operations.
 */
export enum BatchTransactionMode {
  /** All operations succeed or all fail (rollback on any failure) */
  ATOMIC = 'ATOMIC',
  /** Each operation is independent, returns detailed results per item */
  PARTIAL = 'PARTIAL',
}

/**
 * Status of a single item in a batch operation.
 */
export enum BatchItemStatus {
  /** Item processed successfully */
  SUCCESS = 'SUCCESS',
  /** Item processing failed */
  FAILED = 'FAILED',
  /** Item skipped (e.g., due to prior failure in ATOMIC mode) */
  SKIPPED = 'SKIPPED',
}

/**
 * Result for a single item in a batch operation.
 */
export interface BatchItemResult<T = unknown> {
  /** The index of the item in the original batch */
  readonly index: number;
  /** The unique identifier of the item (if applicable) */
  readonly itemId?: string;
  /** Processing status for this item */
  readonly status: BatchItemStatus;
  /** Result data if successful */
  readonly data?: T;
  /** Error code if failed */
  readonly errorCode?: string;
  /** Error message if failed */
  readonly errorMessage?: string;
  /** Processing time for this item in milliseconds */
  readonly processingTimeMs?: number;
}

/**
 * Aggregate result for a batch operation.
 */
export interface BatchOperationResult<T = unknown> {
  /** Overall success status (true only if all items succeeded in ATOMIC mode) */
  readonly success: boolean;
  /** Transaction mode used */
  readonly transactionMode: BatchTransactionMode;
  /** Total number of items in the batch */
  readonly totalItems: number;
  /** Number of successfully processed items */
  readonly successCount: number;
  /** Number of failed items */
  readonly failureCount: number;
  /** Number of skipped items */
  readonly skippedCount: number;
  /** Detailed results for each item */
  readonly itemResults: readonly BatchItemResult<T>[];
  /** Total processing time in milliseconds */
  readonly totalProcessingTimeMs: number;
  /** Whether the transaction was rolled back (ATOMIC mode only) */
  readonly rolledBack?: boolean;
}

// ---------------------------------------------------------------------------
// Permission Check Types
// ---------------------------------------------------------------------------

/**
 * Single permission check request.
 */
export interface PermissionCheckRequest {
  /** The permission code to check (e.g., 'resident:read') */
  readonly permission: string;
  /** Optional resource ID for scope checking */
  readonly resourceId?: string;
  /** Optional OrgUnit ID for scope checking */
  readonly resourceOrgUnitId?: string;
}

/**
 * Permission check result for a single permission.
 */
export interface PermissionCheckResult {
  /** The permission that was checked */
  readonly permission: string;
  /** Whether the permission is granted */
  readonly granted: boolean;
  /** Reason code if denied */
  readonly denyReason?: string;
}

/**
 * Parameters for batch permission check.
 */
export interface BatchPermissionCheckParams {
  /** User ID to check permissions for */
  readonly userId: string;
  /** Tenant ID context */
  readonly tenantId: string;
  /** Active OrgUnit ID context */
  readonly orgUnitId: string | null;
  /** List of permissions to check */
  readonly permissions: readonly PermissionCheckRequest[];
}

// ---------------------------------------------------------------------------
// Membership Update Types
// ---------------------------------------------------------------------------

/**
 * Single membership update request.
 */
export interface MembershipUpdateRequest {
  /** The membership ID to update */
  readonly membershipId: string;
  /** New status (optional) */
  readonly newStatus?: MembershipStatus;
  /** New role (optional) */
  readonly newRole?: MembershipRole;
  /** Reason for the update (for audit) */
  readonly reason?: string;
}

/**
 * Parameters for batch membership update.
 */
export interface BatchMembershipUpdateParams {
  /** The tenant ID context */
  readonly tenantId: string;
  /** The user performing the update (for audit) */
  readonly updatedBy: string;
  /** List of membership updates to apply */
  readonly updates: readonly MembershipUpdateRequest[];
  /** Transaction mode (default: ATOMIC) */
  readonly transactionMode?: BatchTransactionMode;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Membership update result for a single membership.
 */
export interface MembershipUpdateResult {
  /** The membership ID that was updated */
  readonly membershipId: string;
  /** Previous status before update */
  readonly previousStatus?: MembershipStatus;
  /** New status after update */
  readonly newStatus?: MembershipStatus;
  /** Previous role before update */
  readonly previousRole?: MembershipRole;
  /** New role after update */
  readonly newRole?: MembershipRole;
}

// ---------------------------------------------------------------------------
// Authorization Query Types
// ---------------------------------------------------------------------------

/**
 * Single authorization query request.
 */
export interface AuthorizationQueryRequest {
  /** User ID to query */
  readonly userId: string;
  /** Optional specific permission to check */
  readonly permission?: string;
}

/**
 * Parameters for batch authorization query.
 */
export interface BatchAuthorizationQueryParams {
  /** Tenant ID context */
  readonly tenantId: string;
  /** OrgUnit ID context (null for tenant-wide) */
  readonly orgUnitId: string | null;
  /** List of authorization queries */
  readonly queries: readonly AuthorizationQueryRequest[];
}

/**
 * Authorization query result for a single user.
 */
export interface AuthorizationQueryResult {
  /** User ID */
  readonly userId: string;
  /** Whether the user has an active membership */
  readonly hasActiveMembership: boolean;
  /** User's role in the context (if membership exists) */
  readonly role?: MembershipRole;
  /** Specific permission check result (if requested) */
  readonly permissionGranted?: boolean;
}

// ---------------------------------------------------------------------------
// Cache Batch Types
// ---------------------------------------------------------------------------

/**
 * Single cache invalidation request.
 */
export interface CacheInvalidationRequest {
  /** User ID to invalidate cache for */
  readonly userId: string;
  /** Tenant ID context (optional, for tenant-specific cache) */
  readonly tenantId?: string;
  /** OrgUnit ID context (optional, for scope-specific cache) */
  readonly orgUnitId?: string | null;
}

/**
 * Parameters for batch cache invalidation.
 */
export interface BatchCacheInvalidationParams {
  /** List of cache invalidation requests */
  readonly requests: readonly CacheInvalidationRequest[];
  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

// ---------------------------------------------------------------------------
// Service Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for batch operations service.
 */
export interface BatchOperationsConfig {
  /** Maximum number of items allowed in a batch (default: 100) */
  readonly maxBatchSize: number;
  /** Default transaction mode for batch updates (default: ATOMIC) */
  readonly defaultTransactionMode: BatchTransactionMode;
  /** Timeout for individual batch items in milliseconds (default: 5000) */
  readonly itemTimeoutMs: number;
  /** Whether to enable detailed timing per item (default: true) */
  readonly enableItemTiming: boolean;
}

/**
 * Default batch operations configuration.
 */
export const DEFAULT_BATCH_OPERATIONS_CONFIG: BatchOperationsConfig = {
  maxBatchSize: 100,
  defaultTransactionMode: BatchTransactionMode.ATOMIC,
  itemTimeoutMs: 5000,
  enableItemTiming: true,
};

// ---------------------------------------------------------------------------
// Audit Logger Interface
// ---------------------------------------------------------------------------

/**
 * Audit entry for batch operations.
 */
export interface BatchOperationAuditEntry {
  /** Unique operation ID */
  readonly operationId: string;
  /** Operation type */
  readonly operationType: 'PERMISSION_CHECK' | 'MEMBERSHIP_UPDATE' | 'AUTHORIZATION_QUERY' | 'CACHE_INVALIDATION';
  /** Timestamp */
  readonly timestamp: Date;
  /** Tenant ID context */
  readonly tenantId: string;
  /** User who initiated the operation */
  readonly initiatedBy: string;
  /** Transaction mode used */
  readonly transactionMode: BatchTransactionMode;
  /** Total items in batch */
  readonly totalItems: number;
  /** Success count */
  readonly successCount: number;
  /** Failure count */
  readonly failureCount: number;
  /** Whether rolled back */
  readonly rolledBack: boolean;
  /** Total processing time */
  readonly totalProcessingTimeMs: number;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Interface for batch operation audit logging.
 */
export interface IBatchOperationAuditLogger {
  /**
   * Log a batch operation for audit purposes.
   */
  logOperation(entry: BatchOperationAuditEntry): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IBatchOperationsService — Service interface for batch authorization operations.
 *
 * This service provides methods for performing batch authorization operations
 * efficiently and atomically where needed.
 */
export interface IBatchOperationsService {
  // -------------------------------------------------------------------------
  // Batch Permission Checks
  // -------------------------------------------------------------------------

  /**
   * Check multiple permissions for a user in a single call.
   *
   * Returns results for each permission indicating whether it is granted or denied.
   * This is more efficient than making individual permission checks.
   *
   * @param params - Batch permission check parameters
   * @returns DomainResult with batch operation result
   *
   * @see Requirements 33 — Batch permission checks
   */
  checkPermissionsBatch(
    params: BatchPermissionCheckParams,
  ): Promise<DomainResult<BatchOperationResult<PermissionCheckResult>>>;

  // -------------------------------------------------------------------------
  // Batch Membership Updates
  // -------------------------------------------------------------------------

  /**
   * Update multiple memberships atomically or with partial success handling.
   *
   * In ATOMIC mode, all updates succeed or all are rolled back.
   * In PARTIAL mode, each update is independent and detailed results are returned.
   *
   * @param params - Batch membership update parameters
   * @returns DomainResult with batch operation result
   *
   * @see Requirements 33 — Batch membership updates
   */
  updateMembershipsBatch(
    params: BatchMembershipUpdateParams,
  ): Promise<DomainResult<BatchOperationResult<MembershipUpdateResult>>>;

  // -------------------------------------------------------------------------
  // Batch Authorization Queries
  // -------------------------------------------------------------------------

  /**
   * Query authorization status for multiple users in a single call.
   *
   * Returns authorization information for each user efficiently.
   *
   * @param params - Batch authorization query parameters
   * @returns DomainResult with batch operation result
   *
   * @see Requirements 33 — Batch authorization operations
   */
  queryAuthorizationBatch(
    params: BatchAuthorizationQueryParams,
  ): Promise<DomainResult<BatchOperationResult<AuthorizationQueryResult>>>;

  // -------------------------------------------------------------------------
  // Batch Cache Operations
  // -------------------------------------------------------------------------

  /**
   * Invalidate authorization caches for multiple users in a single call.
   *
   * Efficiently clears authorization caches for multiple users, useful after
   * bulk membership changes or permission updates.
   *
   * @param params - Batch cache invalidation parameters
   * @returns DomainResult with batch operation result
   *
   * @see Requirements 33 — Batch cache operations
   */
  invalidateCachesBatch(
    params: BatchCacheInvalidationParams,
  ): Promise<DomainResult<BatchOperationResult<{ invalidated: boolean }>>>;

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Get the current batch operations configuration.
   */
  getConfig(): BatchOperationsConfig;

  /**
   * Update the batch operations configuration.
   *
   * @param config - Partial config to merge
   */
  updateConfig(config: Partial<BatchOperationsConfig>): void;

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  /**
   * Validate batch size against configured limits.
   *
   * @param itemCount - Number of items in the batch
   * @returns DomainResult with void on success, error if limit exceeded
   */
  validateBatchSize(itemCount: number): DomainResult<void>;
}

// ---------------------------------------------------------------------------
// Console Audit Logger (Development/Testing)
// ---------------------------------------------------------------------------

/**
 * Console-based batch operation audit logger for development/testing.
 * Replace with proper audit logging service in production.
 */
export const ConsoleBatchOperationAuditLogger: IBatchOperationAuditLogger = {
  async logOperation(entry: BatchOperationAuditEntry): Promise<void> {
    console.log('[BATCH] Operation completed:', {
      operationId: entry.operationId,
      operationType: entry.operationType,
      timestamp: entry.timestamp.toISOString(),
      tenantId: entry.tenantId,
      initiatedBy: entry.initiatedBy,
      transactionMode: entry.transactionMode,
      totalItems: entry.totalItems,
      successCount: entry.successCount,
      failureCount: entry.failureCount,
      rolledBack: entry.rolledBack,
      totalProcessingTimeMs: entry.totalProcessingTimeMs,
      correlationId: entry.correlationId,
    });
  },
};

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a BatchOperationsService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param config - Optional batch operations configuration
 * @param auditLogger - Optional audit logger for batch operations
 * @returns An implementation of IBatchOperationsService
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   batchOperationsService: asFunction(BatchOperationsServiceImpl).singleton(),
 * });
 *
 * // Usage
 * const batchService = DI.resolve('batchOperationsService');
 * const result = await batchService.checkPermissionsBatch({
 *   userId,
 *   tenantId,
 *   orgUnitId,
 *   permissions: [
 *     { permission: 'resident:read' },
 *     { permission: 'finance:write' },
 *   ],
 * });
 * ```
 */
export const BatchOperationsServiceImpl = ({
  config = DEFAULT_BATCH_OPERATIONS_CONFIG,
  auditLogger = ConsoleBatchOperationAuditLogger,
}: {
  config?: BatchOperationsConfig;
  auditLogger?: IBatchOperationAuditLogger;
} = {}): IBatchOperationsService => {
  // Mutable config
  let currentConfig = { ...config };

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique operation ID.
   */
  const generateOperationId = (): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `batch-${timestamp}-${random}`;
  };

  /**
   * Create a successful batch item result.
   */
  const successItem = <T>(
    index: number,
    data: T,
    itemId?: string,
    processingTimeMs?: number,
  ): BatchItemResult<T> => ({
    index,
    itemId,
    status: BatchItemStatus.SUCCESS,
    data,
    processingTimeMs,
  });

  /**
   * Create a failed batch item result.
   */
  const failedItem = <T>(
    index: number,
    errorCode: string,
    errorMessage: string,
    itemId?: string,
    processingTimeMs?: number,
  ): BatchItemResult<T> => ({
    index,
    itemId,
    status: BatchItemStatus.FAILED,
    errorCode,
    errorMessage,
    processingTimeMs,
  });

  /**
   * Create a skipped batch item result.
   */
  const skippedItem = <T>(
    index: number,
    itemId?: string,
  ): BatchItemResult<T> => ({
    index,
    itemId,
    status: BatchItemStatus.SKIPPED,
  });

  /**
   * Aggregate item results into a batch operation result.
   */
  const aggregateResults = <T>(
    itemResults: BatchItemResult<T>[],
    transactionMode: BatchTransactionMode,
    totalProcessingTimeMs: number,
    rolledBack = false,
  ): BatchOperationResult<T> => {
    const successCount = itemResults.filter(r => r.status === BatchItemStatus.SUCCESS).length;
    const failureCount = itemResults.filter(r => r.status === BatchItemStatus.FAILED).length;
    const skippedCount = itemResults.filter(r => r.status === BatchItemStatus.SKIPPED).length;

    const success = transactionMode === BatchTransactionMode.ATOMIC
      ? failureCount === 0 && !rolledBack
      : successCount > 0;

    return {
      success,
      transactionMode,
      totalItems: itemResults.length,
      successCount,
      failureCount,
      skippedCount,
      itemResults,
      totalProcessingTimeMs,
      rolledBack,
    };
  };

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  return {
    /**
     * Check multiple permissions for a user in a single call.
     */
    async checkPermissionsBatch(
      params: BatchPermissionCheckParams,
    ): Promise<DomainResult<BatchOperationResult<PermissionCheckResult>>> {
      const startTime = Date.now();
      const { userId, tenantId, orgUnitId, permissions } = params;

      // Validate input
      if (permissions.length === 0) {
        return fail(batchEmptyItems());
      }

      const sizeValidation = this.validateBatchSize(permissions.length);
      if (!sizeValidation.success) {
        return fail(sizeValidation.error);
      }

      try {
        const itemResults: BatchItemResult<PermissionCheckResult>[] = [];

        // Process each permission check
        for (let i = 0; i < permissions.length; i++) {
          const itemStartTime = currentConfig.enableItemTiming ? Date.now() : undefined;
          const permReq = permissions[i];

          try {
            // Simulate permission check logic
            // In production, this would integrate with PermissionRegistry
            const granted = await simulatePermissionCheck(
              userId,
              tenantId,
              orgUnitId,
              permReq.permission,
              permReq.resourceOrgUnitId,
            );

            const result: PermissionCheckResult = {
              permission: permReq.permission,
              granted,
              denyReason: granted ? undefined : 'PERMISSION_NOT_GRANTED',
            };

            const processingTime = itemStartTime ? Date.now() - itemStartTime : undefined;
            itemResults.push(successItem(i, result, permReq.permission, processingTime));
          } catch (error) {
            const processingTime = itemStartTime ? Date.now() - itemStartTime : undefined;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            itemResults.push(failedItem(i, 'CHECK_FAILED', errorMsg, permReq.permission, processingTime));
          }
        }

        const totalProcessingTimeMs = Date.now() - startTime;

        // Log audit entry
        await auditLogger.logOperation({
          operationId: generateOperationId(),
          operationType: 'PERMISSION_CHECK',
          timestamp: new Date(),
          tenantId,
          initiatedBy: userId,
          transactionMode: BatchTransactionMode.PARTIAL,
          totalItems: permissions.length,
          successCount: itemResults.filter(r => r.status === BatchItemStatus.SUCCESS).length,
          failureCount: itemResults.filter(r => r.status === BatchItemStatus.FAILED).length,
          rolledBack: false,
          totalProcessingTimeMs,
        });

        return ok(aggregateResults(itemResults, BatchTransactionMode.PARTIAL, totalProcessingTimeMs));
      } catch (error) {
        return fail(batchOperationFailed('checkPermissionsBatch', error));
      }
    },

    /**
     * Update multiple memberships atomically or with partial success handling.
     */
    async updateMembershipsBatch(
      params: BatchMembershipUpdateParams,
    ): Promise<DomainResult<BatchOperationResult<MembershipUpdateResult>>> {
      const startTime = Date.now();
      const {
        tenantId,
        updatedBy,
        updates,
        transactionMode = currentConfig.defaultTransactionMode,
        correlationId,
      } = params;

      // Validate input
      if (updates.length === 0) {
        return fail(batchEmptyItems());
      }

      const sizeValidation = this.validateBatchSize(updates.length);
      if (!sizeValidation.success) {
        return fail(sizeValidation.error);
      }

      try {
        const itemResults: BatchItemResult<MembershipUpdateResult>[] = [];
        let rolledBack = false;
        let encounteredError = false;

        // Process each membership update
        for (let i = 0; i < updates.length; i++) {
          // In ATOMIC mode, skip remaining items if any failed
          if (transactionMode === BatchTransactionMode.ATOMIC && encounteredError) {
            itemResults.push(skippedItem(i, updates[i].membershipId));
            continue;
          }

          const itemStartTime = currentConfig.enableItemTiming ? Date.now() : undefined;
          const update = updates[i];

          try {
            // Simulate membership update
            // In production, this would call MembershipLifecycleService
            const updateResult = await simulateMembershipUpdate(
              update.membershipId,
              tenantId,
              update.newStatus,
              update.newRole,
            );

            const processingTime = itemStartTime ? Date.now() - itemStartTime : undefined;
            itemResults.push(successItem(i, updateResult, update.membershipId, processingTime));
          } catch (error) {
            encounteredError = true;
            const processingTime = itemStartTime ? Date.now() - itemStartTime : undefined;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            itemResults.push(failedItem(i, 'UPDATE_FAILED', errorMsg, update.membershipId, processingTime));
          }
        }

        // In ATOMIC mode, if any failed, mark all as rolled back
        if (transactionMode === BatchTransactionMode.ATOMIC && encounteredError) {
          rolledBack = true;
          // In production, actual transaction rollback would happen here
          // Mark previously successful items as rolled back by updating their status
          for (let i = 0; i < itemResults.length; i++) {
            if (itemResults[i].status === BatchItemStatus.SUCCESS) {
              itemResults[i] = {
                ...itemResults[i],
                status: BatchItemStatus.SKIPPED,
                errorCode: 'ROLLED_BACK',
                errorMessage: 'Transaction rolled back due to other failures',
              };
            }
          }
        }

        const totalProcessingTimeMs = Date.now() - startTime;

        // Log audit entry
        await auditLogger.logOperation({
          operationId: generateOperationId(),
          operationType: 'MEMBERSHIP_UPDATE',
          timestamp: new Date(),
          tenantId,
          initiatedBy: updatedBy,
          transactionMode,
          totalItems: updates.length,
          successCount: rolledBack ? 0 : itemResults.filter(r => r.status === BatchItemStatus.SUCCESS).length,
          failureCount: itemResults.filter(r => r.status === BatchItemStatus.FAILED).length,
          rolledBack,
          totalProcessingTimeMs,
          correlationId,
        });

        if (rolledBack) {
          const result = aggregateResults(itemResults, transactionMode, totalProcessingTimeMs, true);
          return ok(result);
        }

        return ok(aggregateResults(itemResults, transactionMode, totalProcessingTimeMs));
      } catch (error) {
        return fail(batchTransactionFailed('updateMembershipsBatch', error));
      }
    },

    /**
     * Query authorization status for multiple users in a single call.
     */
    async queryAuthorizationBatch(
      params: BatchAuthorizationQueryParams,
    ): Promise<DomainResult<BatchOperationResult<AuthorizationQueryResult>>> {
      const startTime = Date.now();
      const { tenantId, orgUnitId, queries } = params;

      // Validate input
      if (queries.length === 0) {
        return fail(batchEmptyItems());
      }

      const sizeValidation = this.validateBatchSize(queries.length);
      if (!sizeValidation.success) {
        return fail(sizeValidation.error);
      }

      try {
        const itemResults: BatchItemResult<AuthorizationQueryResult>[] = [];

        // Process each authorization query
        for (let i = 0; i < queries.length; i++) {
          const itemStartTime = currentConfig.enableItemTiming ? Date.now() : undefined;
          const query = queries[i];

          try {
            // Simulate authorization query
            // In production, this would call MembershipResolutionService
            const queryResult = await simulateAuthorizationQuery(
              query.userId,
              tenantId,
              orgUnitId,
              query.permission,
            );

            const processingTime = itemStartTime ? Date.now() - itemStartTime : undefined;
            itemResults.push(successItem(i, queryResult, query.userId, processingTime));
          } catch (error) {
            const processingTime = itemStartTime ? Date.now() - itemStartTime : undefined;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            itemResults.push(failedItem(i, 'QUERY_FAILED', errorMsg, query.userId, processingTime));
          }
        }

        const totalProcessingTimeMs = Date.now() - startTime;

        // Log audit entry
        await auditLogger.logOperation({
          operationId: generateOperationId(),
          operationType: 'AUTHORIZATION_QUERY',
          timestamp: new Date(),
          tenantId,
          initiatedBy: 'system',
          transactionMode: BatchTransactionMode.PARTIAL,
          totalItems: queries.length,
          successCount: itemResults.filter(r => r.status === BatchItemStatus.SUCCESS).length,
          failureCount: itemResults.filter(r => r.status === BatchItemStatus.FAILED).length,
          rolledBack: false,
          totalProcessingTimeMs,
        });

        return ok(aggregateResults(itemResults, BatchTransactionMode.PARTIAL, totalProcessingTimeMs));
      } catch (error) {
        return fail(batchOperationFailed('queryAuthorizationBatch', error));
      }
    },

    /**
     * Invalidate authorization caches for multiple users in a single call.
     */
    async invalidateCachesBatch(
      params: BatchCacheInvalidationParams,
    ): Promise<DomainResult<BatchOperationResult<{ invalidated: boolean }>>> {
      const startTime = Date.now();
      const { requests, correlationId } = params;

      // Validate input
      if (requests.length === 0) {
        return fail(batchEmptyItems());
      }

      const sizeValidation = this.validateBatchSize(requests.length);
      if (!sizeValidation.success) {
        return fail(sizeValidation.error);
      }

      try {
        const itemResults: BatchItemResult<{ invalidated: boolean }>[] = [];

        // Process each cache invalidation request
        for (let i = 0; i < requests.length; i++) {
          const itemStartTime = currentConfig.enableItemTiming ? Date.now() : undefined;
          const request = requests[i];

          try {
            // Simulate cache invalidation
            // In production, this would call CacheInvalidationService
            await simulateCacheInvalidation(request.userId, request.tenantId, request.orgUnitId);

            const processingTime = itemStartTime ? Date.now() - itemStartTime : undefined;
            itemResults.push(successItem(i, { invalidated: true }, request.userId, processingTime));
          } catch (error) {
            const processingTime = itemStartTime ? Date.now() - itemStartTime : undefined;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            itemResults.push(failedItem(i, 'INVALIDATION_FAILED', errorMsg, request.userId, processingTime));
          }
        }

        const totalProcessingTimeMs = Date.now() - startTime;

        // Log audit entry
        await auditLogger.logOperation({
          operationId: generateOperationId(),
          operationType: 'CACHE_INVALIDATION',
          timestamp: new Date(),
          tenantId: requests[0]?.tenantId ?? 'unknown',
          initiatedBy: 'system',
          transactionMode: BatchTransactionMode.PARTIAL,
          totalItems: requests.length,
          successCount: itemResults.filter(r => r.status === BatchItemStatus.SUCCESS).length,
          failureCount: itemResults.filter(r => r.status === BatchItemStatus.FAILED).length,
          rolledBack: false,
          totalProcessingTimeMs,
          correlationId,
        });

        return ok(aggregateResults(itemResults, BatchTransactionMode.PARTIAL, totalProcessingTimeMs));
      } catch (error) {
        return fail(batchOperationFailed('invalidateCachesBatch', error));
      }
    },

    /**
     * Get the current batch operations configuration.
     */
    getConfig(): BatchOperationsConfig {
      return { ...currentConfig };
    },

    /**
     * Update the batch operations configuration.
     */
    updateConfig(configUpdate: Partial<BatchOperationsConfig>): void {
      currentConfig = { ...currentConfig, ...configUpdate };
    },

    /**
     * Validate batch size against configured limits.
     */
    validateBatchSize(itemCount: number): DomainResult<void> {
      if (itemCount === 0) {
        return fail(batchEmptyItems());
      }
      if (itemCount > currentConfig.maxBatchSize) {
        return fail(batchSizeLimitExceeded(itemCount, currentConfig.maxBatchSize));
      }
      return ok(undefined);
    },
  };
};

// ---------------------------------------------------------------------------
// Simulation Functions (Replace with actual implementations in production)
// ---------------------------------------------------------------------------

/**
 * Simulate permission check.
 * In production, integrate with PermissionRegistry and OrgUnitScopeAuthorizer.
 */
async function simulatePermissionCheck(
  _userId: string,
  _tenantId: string,
  _orgUnitId: string | null,
  permission: string,
  _resourceOrgUnitId?: string,
): Promise<boolean> {
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 1));
  // For simulation, grant common permissions
  const commonPermissions = ['resident:read', 'announcement:read', 'vote:cast'];
  return commonPermissions.includes(permission);
}

/**
 * Simulate membership update.
 * In production, integrate with MembershipLifecycleService.
 */
async function simulateMembershipUpdate(
  membershipId: string,
  _tenantId: string,
  newStatus?: MembershipStatus,
  newRole?: MembershipRole,
): Promise<MembershipUpdateResult> {
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 1));
  return {
    membershipId,
    previousStatus: 'ACTIVE' as MembershipStatus,
    newStatus: newStatus ?? ('ACTIVE' as MembershipStatus),
    previousRole: 'RESIDENT' as MembershipRole,
    newRole: newRole ?? ('RESIDENT' as MembershipRole),
  };
}

/**
 * Simulate authorization query.
 * In production, integrate with MembershipResolutionService.
 */
async function simulateAuthorizationQuery(
  userId: string,
  _tenantId: string,
  _orgUnitId: string | null,
  permission?: string,
): Promise<AuthorizationQueryResult> {
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 1));
  return {
    userId,
    hasActiveMembership: true,
    role: 'RESIDENT' as MembershipRole,
    permissionGranted: permission ? permission.includes('read') : undefined,
  };
}

/**
 * Simulate cache invalidation.
 * In production, integrate with CacheInvalidationService.
 */
async function simulateCacheInvalidation(
  _userId: string,
  _tenantId?: string,
  _orgUnitId?: string | null,
): Promise<void> {
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 1));
}

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type BatchOperationsService = IBatchOperationsService;
