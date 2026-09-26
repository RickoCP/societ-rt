/**
 * Authorization-specific error factory functions.
 *
 * These errors relate to the Permission Registry, permission checking,
 * authorization context resolution, and OrgUnit scope authorization.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 *
 * SECURITY CONSIDERATIONS:
 * - Error messages MUST NOT expose internal permission details to clients
 * - Fail closed on unknown error states
 * - Errors MUST NOT leak which permissions exist or don't exist
 * - Tenant check MUST be performed BEFORE OrgUnit scope check
 *
 * @see Requirements 2.7, 3, 6, 47, Design Error Handling
 */

import type { AppError } from '@core/utils';
import { authenticationError, authorizationError, unexpectedError } from '@core/utils';

// ---------------------------------------------------------------------------
// Permission Registry Errors
// ---------------------------------------------------------------------------

/**
 * Permission check referenced an undefined permission.
 *
 * This indicates a code bug — a route handler is checking for a permission
 * that doesn't exist in the registry. Access is DENIED (fail closed).
 *
 * NOTE: This is an internal error. The user-facing error should be generic
 * (AUTH_INSUFFICIENT_PERMISSION) to avoid leaking information.
 *
 * @see Requirements 2.7 — Unknown permission fails closed with logging
 */
export function permissionUndefined(permissionCode: string): AppError {
  return unexpectedError(
    'PERMISSION_UNDEFINED',
    `Permission check referenced undefined permission: ${permissionCode}`,
    {
      // Generic user message — don't leak permission details
      userMessage: 'An authorization error occurred',
    },
  );
}

/**
 * Permission registry failed to load or validate.
 *
 * This is a critical startup error indicating the permission configuration
 * is invalid. The application should NOT start in this state.
 */
export function permissionRegistryError(details: string): AppError {
  return unexpectedError(
    'PERMISSION_REGISTRY_ERROR',
    `Permission registry error: ${details}`,
    {
      userMessage: 'A system configuration error occurred',
    },
  );
}

// ---------------------------------------------------------------------------
// JWT/Token Errors (Authentication)
// ---------------------------------------------------------------------------

/**
 * JWT is missing, malformed, or has invalid signature.
 * HTTP Status: 401
 *
 * @see Requirements 47 — AUTH_TOKEN_INVALID
 */
export function authTokenInvalid(reason?: string): AppError {
  const details = reason ? ` Reason: ${reason}` : '';
  return authenticationError(
    'AUTH_TOKEN_INVALID',
    `JWT is missing, malformed, or has invalid signature.${details}`,
    { userMessage: 'Invalid authentication token. Please log in again.' },
  );
}

/**
 * JWT has expired.
 * HTTP Status: 401
 */
export function authTokenExpired(): AppError {
  return authenticationError(
    'AUTH_TOKEN_EXPIRED',
    'JWT has expired',
    { userMessage: 'Your session has expired. Please log in again.' },
  );
}

/**
 * JWT tokenVersion doesn't match User.tokenVersion (exact match required).
 * HTTP Status: 401
 *
 * @see Requirements 15.4 — Token version exact match required
 * @see Design Property 7 — Token Version Exact Match
 */
export function authTokenVersionMismatch(): AppError {
  return authenticationError(
    'AUTH_TOKEN_VERSION_MISMATCH',
    'Token version does not match - all sessions have been invalidated',
    { userMessage: 'Your session has expired. Please log in again.' },
  );
}

// ---------------------------------------------------------------------------
// Authorization Context Resolution Errors
// ---------------------------------------------------------------------------

/**
 * Authorization context resolution failed due to internal error.
 *
 * This is used when an unexpected error occurs during context resolution.
 * Fails closed with generic error message.
 */
export function authContextResolutionFailed(cause?: unknown): AppError {
  return unexpectedError(
    'AUTH_CONTEXT_RESOLUTION_FAILED',
    'Failed to resolve authorization context',
    {
      userMessage: 'An authentication error occurred. Please try again.',
      cause,
    },
  );
}

// ---------------------------------------------------------------------------
// OrgUnit Scope Authorization Errors (Task 15)
// ---------------------------------------------------------------------------

/**
 * Resource tenant does not match user's active tenant.
 * HTTP Status: 403
 *
 * SECURITY: This check MUST be performed BEFORE OrgUnit scope check.
 * Tenant mismatch is a higher priority security boundary.
 *
 * @see Requirements 6.6, 6.7, 47 — AUTH_TENANT_MISMATCH
 * @see Design Authorization Pipeline Step 7
 */
export function authTenantMismatch(
  resourceTenantId?: string,
  contextTenantId?: string,
): AppError {
  // SECURITY: Don't expose tenant IDs in user-facing message
  const internalMsg = resourceTenantId && contextTenantId
    ? `Resource tenant (${resourceTenantId}) does not match context tenant (${contextTenantId})`
    : 'Resource tenant does not match user\'s active tenant';
  
  return authorizationError(
    'AUTH_TENANT_MISMATCH',
    internalMsg,
    { userMessage: 'You do not have access to this resource' },
  );
}

/**
 * Resource OrgUnit is outside user's membership scope.
 * HTTP Status: 403
 *
 * This error is returned when:
 * - User has org-scoped membership (not PLATFORM_ADMIN or TENANT_OWNER)
 * - Resource OrgUnit is NOT a descendant or equal to membership OrgUnit
 *
 * @see Requirements 6.1, 6.2, 6.4, 47 — AUTH_OUT_OF_SCOPE
 * @see Design OrgUnit Scope Containment (Property 6)
 */
export function authOutOfScope(
  resourceOrgUnitId?: string,
  membershipOrgUnitId?: string,
): AppError {
  // SECURITY: Don't expose OrgUnit IDs in user-facing message
  const internalMsg = resourceOrgUnitId && membershipOrgUnitId
    ? `Resource OrgUnit (${resourceOrgUnitId}) is outside membership scope (${membershipOrgUnitId})`
    : 'Resource is outside user\'s organizational scope';
  
  return authorizationError(
    'AUTH_OUT_OF_SCOPE',
    internalMsg,
    { userMessage: 'You do not have access to this resource' },
  );
}

/**
 * Scope check failed due to internal error.
 *
 * This is used when an unexpected error occurs during scope checking.
 * Fails closed with generic error message (INV-AUTH-002).
 */
export function authScopeCheckFailed(cause?: unknown): AppError {
  return unexpectedError(
    'AUTH_SCOPE_CHECK_FAILED',
    'Failed to check OrgUnit scope authorization',
    {
      userMessage: 'An authorization error occurred. Please try again.',
      cause,
    },
  );
}

// ---------------------------------------------------------------------------
// Authorization Concurrency Errors (Task 63, Req 28)
// ---------------------------------------------------------------------------

/**
 * Concurrent conflicting operations detected.
 * HTTP Status: 409
 *
 * This error is returned when two or more operations attempt to modify
 * the same resource concurrently, resulting in a conflict.
 *
 * @see Requirements 28.4 — CONFLICT_DETECTED
 */
export function conflictDetected(
  resourceType?: string,
  resourceId?: string,
  details?: string,
): AppError {
  const internalMsg = resourceType && resourceId
    ? `Conflict detected for ${resourceType} (${resourceId})${details ? `: ${details}` : ''}`
    : `Concurrent conflicting operations detected${details ? `: ${details}` : ''}`;
  
  return authorizationError(
    'CONFLICT_DETECTED',
    internalMsg,
    {
      userMessage: 'The resource was modified by another operation. Please refresh and try again.',
      retryable: true,
    },
  );
}

/**
 * Optimistic lock version mismatch.
 * HTTP Status: 409
 *
 * This error is returned when an update operation fails because
 * the resource version has changed since it was read.
 *
 * @see Requirements 28.2 — Optimistic concurrency control with version checks
 */
export function optimisticLockFailed(
  resourceType?: string,
  expectedVersion?: number,
  actualVersion?: number,
): AppError {
  const versionInfo = expectedVersion !== undefined && actualVersion !== undefined
    ? ` (expected version ${expectedVersion}, found ${actualVersion})`
    : '';
  const internalMsg = resourceType
    ? `Optimistic lock failed for ${resourceType}${versionInfo}`
    : `Optimistic lock failed${versionInfo}`;
  
  return authorizationError(
    'OPTIMISTIC_LOCK_FAILED',
    internalMsg,
    {
      userMessage: 'The resource was modified by another user. Please refresh and try again.',
      retryable: true,
    },
  );
}

/**
 * TOCTOU race condition detected.
 * HTTP Status: 409
 *
 * This error is returned when a time-of-check to time-of-use race condition
 * is detected during authorization checks. The authorization state changed
 * between the initial check and the actual operation execution.
 *
 * @see Requirements 28.1, 28.3, 28.7 — TOCTOU Prevention
 */
export function toctouRaceDetected(
  operationType?: string,
  details?: string,
): AppError {
  const internalMsg = operationType
    ? `TOCTOU race detected during ${operationType}${details ? `: ${details}` : ''}`
    : `Authorization state changed during operation${details ? `: ${details}` : ''}`;
  
  return authorizationError(
    'TOCTOU_RACE_DETECTED',
    internalMsg,
    {
      userMessage: 'The authorization state changed during the operation. Please try again.',
      retryable: true,
    },
  );
}

/**
 * Concurrent membership resolution failed due to lock timeout.
 * HTTP Status: 503
 *
 * This error is returned when acquiring a lock for membership operations
 * times out due to high contention.
 *
 * @see Requirements 28.1 — Database-level locking for critical membership operations
 */
export function membershipLockTimeout(
  membershipId?: string,
  timeoutMs?: number,
): AppError {
  const internalMsg = membershipId
    ? `Lock timeout for membership ${membershipId}${timeoutMs ? ` after ${timeoutMs}ms` : ''}`
    : `Membership lock timeout${timeoutMs ? ` after ${timeoutMs}ms` : ''}`;
  
  return unexpectedError(
    'MEMBERSHIP_LOCK_TIMEOUT',
    internalMsg,
    {
      userMessage: 'The system is busy. Please try again in a moment.',
      retryable: true,
    },
  );
}

/**
 * Concurrent membership modification detected.
 * HTTP Status: 409
 *
 * This error is returned when parallel membership modifications
 * are detected for the same user/tenant combination.
 *
 * @see Requirements 28.4 — Detect and reject concurrent conflicting operations
 */
export function concurrentMembershipModification(
  userId?: string,
  tenantId?: string,
): AppError {
  const internalMsg = userId && tenantId
    ? `Concurrent membership modification detected for user ${userId} in tenant ${tenantId}`
    : 'Concurrent membership modification detected';
  
  return authorizationError(
    'CONCURRENT_MEMBERSHIP_MODIFICATION',
    internalMsg,
    {
      userMessage: 'Another operation is modifying this membership. Please try again.',
      retryable: true,
    },
  );
}

/**
 * Authorization validation failed after state change.
 * HTTP Status: 403
 *
 * This error is returned when re-validation of authorization fails
 * immediately before executing a mutating operation.
 *
 * @see Requirements 28.3 — Validate authorization immediately before executing mutating operations
 */
export function authorizationRevalidationFailed(
  operation?: string,
  reason?: string,
): AppError {
  const internalMsg = operation
    ? `Authorization re-validation failed for ${operation}${reason ? `: ${reason}` : ''}`
    : `Authorization re-validation failed${reason ? `: ${reason}` : ''}`;
  
  return authorizationError(
    'AUTH_REVALIDATION_FAILED',
    internalMsg,
    { userMessage: 'Your authorization has changed. Please refresh and try again.' },
  );
}

// ---------------------------------------------------------------------------
// Cache Invalidation Errors (Task 64, Req 29)
// ---------------------------------------------------------------------------

/**
 * Cache invalidation operation failed.
 * HTTP Status: 500
 *
 * This error is returned when an internal cache invalidation operation fails.
 * The system should still function, but cached data may be stale.
 *
 * @see Requirements 29 — Cache Invalidation Strategy
 */
export function cacheInvalidationFailed(
  operation?: string,
  cause?: unknown,
): AppError {
  const internalMsg = operation
    ? `Cache invalidation failed for operation: ${operation}`
    : 'Cache invalidation operation failed';
  
  return unexpectedError(
    'CACHE_INVALIDATION_FAILED',
    internalMsg,
    {
      userMessage: 'A temporary error occurred. Please try again.',
      cause,
      retryable: true,
    },
  );
}

/**
 * Cache propagation to related caches failed.
 * HTTP Status: 500
 *
 * This error is returned when invalidation succeeded for primary cache
 * but failed to propagate to related caches.
 *
 * @see Requirements 29 — Invalidation propagation
 */
export function cachePropagationFailed(
  eventType?: string,
  cause?: unknown,
): AppError {
  const internalMsg = eventType
    ? `Cache propagation failed for event type: ${eventType}`
    : 'Cache propagation failed';
  
  return unexpectedError(
    'CACHE_PROPAGATION_FAILED',
    internalMsg,
    {
      userMessage: 'A temporary error occurred. Please try again.',
      cause,
      retryable: true,
    },
  );
}

/**
 * Invalid cache key format.
 * HTTP Status: 400
 *
 * This error is returned when a cache key cannot be parsed or is malformed.
 *
 * @see Requirements 29 — Cache key strategy
 */
export function invalidCacheKey(
  key?: string,
  reason?: string,
): AppError {
  const internalMsg = key
    ? `Invalid cache key: ${key}${reason ? ` - ${reason}` : ''}`
    : `Invalid cache key format${reason ? `: ${reason}` : ''}`;
  
  return unexpectedError(
    'INVALID_CACHE_KEY',
    internalMsg,
    {
      userMessage: 'An internal error occurred.',
    },
  );
}

/**
 * Cache operation timed out.
 * HTTP Status: 503
 *
 * This error is returned when a cache operation (read/write/invalidate)
 * times out, typically due to cache infrastructure issues.
 *
 * @see Requirements 29 — TTL-based expiration
 */
export function cacheOperationTimeout(
  operation?: string,
  timeoutMs?: number,
): AppError {
  const internalMsg = operation
    ? `Cache operation timed out: ${operation}${timeoutMs ? ` after ${timeoutMs}ms` : ''}`
    : `Cache operation timed out${timeoutMs ? ` after ${timeoutMs}ms` : ''}`;
  
  return unexpectedError(
    'CACHE_OPERATION_TIMEOUT',
    internalMsg,
    {
      userMessage: 'The system is busy. Please try again in a moment.',
      retryable: true,
    },
  );
}

// ---------------------------------------------------------------------------
// Batch Operations Errors (Task 66, Req 33)
// ---------------------------------------------------------------------------

/**
 * Batch operation failed completely.
 * HTTP Status: 500
 *
 * This error is returned when a batch operation fails to process any items.
 *
 * @see Requirements 33 — Batch Operations Support
 */
export function batchOperationFailed(
  operationType?: string,
  cause?: unknown,
): AppError {
  const internalMsg = operationType
    ? `Batch operation failed: ${operationType}`
    : 'Batch operation failed';
  
  return unexpectedError(
    'BATCH_OPERATION_FAILED',
    internalMsg,
    {
      userMessage: 'The batch operation failed. Please try again.',
      cause,
      retryable: true,
    },
  );
}

/**
 * Batch operation partially succeeded.
 * HTTP Status: 207 (Multi-Status)
 *
 * This error is returned when some items in a batch operation failed
 * while others succeeded. Contains detailed results per item.
 *
 * @see Requirements 33 — Partial failure handling
 */
export function batchPartialFailure(
  successCount: number,
  failureCount: number,
  operationType?: string,
): AppError {
  const internalMsg = operationType
    ? `Batch ${operationType} partially failed: ${successCount} succeeded, ${failureCount} failed`
    : `Batch operation partially failed: ${successCount} succeeded, ${failureCount} failed`;
  
  return authorizationError(
    'BATCH_PARTIAL_FAILURE',
    internalMsg,
    {
      userMessage: `Some items could not be processed: ${successCount} succeeded, ${failureCount} failed`,
    },
  );
}

/**
 * Batch operation exceeded size limit.
 * HTTP Status: 400
 *
 * This error is returned when a batch operation contains more items
 * than the allowed maximum.
 *
 * @see Requirements 33 — Batch size limits
 */
export function batchSizeLimitExceeded(
  requestedSize: number,
  maxSize: number,
): AppError {
  return authorizationError(
    'BATCH_SIZE_LIMIT_EXCEEDED',
    `Batch size ${requestedSize} exceeds maximum allowed size of ${maxSize}`,
    {
      userMessage: `Batch size exceeds maximum of ${maxSize} items. Please reduce the number of items.`,
    },
  );
}

/**
 * Batch transaction failed.
 * HTTP Status: 500
 *
 * This error is returned when a batch operation running in a transaction
 * fails and the entire transaction is rolled back.
 *
 * @see Requirements 33 — Transaction management for batches
 */
export function batchTransactionFailed(
  operationType?: string,
  cause?: unknown,
): AppError {
  const internalMsg = operationType
    ? `Batch transaction failed for ${operationType}: all changes rolled back`
    : 'Batch transaction failed: all changes rolled back';
  
  return unexpectedError(
    'BATCH_TRANSACTION_FAILED',
    internalMsg,
    {
      userMessage: 'The batch operation failed and all changes were rolled back. Please try again.',
      cause,
      retryable: true,
    },
  );
}

/**
 * Empty batch operation.
 * HTTP Status: 400
 *
 * This error is returned when a batch operation is called with no items.
 *
 * @see Requirements 33 — Batch validation
 */
export function batchEmptyItems(): AppError {
  return authorizationError(
    'BATCH_EMPTY_ITEMS',
    'Batch operation called with no items',
    {
      userMessage: 'Batch operation requires at least one item.',
    },
  );
}

// ---------------------------------------------------------------------------
// Permission Sync Errors (Task 67, Req 35)
// ---------------------------------------------------------------------------

/**
 * Permission sync operation failed.
 * HTTP Status: 500
 *
 * This error is returned when a permission sync operation fails.
 *
 * @see Requirements 35 — Permission Sync Mechanism
 */
export function permissionSyncFailed(
  targetId?: string,
  cause?: unknown,
): AppError {
  const internalMsg = targetId
    ? `Permission sync failed for target: ${targetId}`
    : 'Permission sync operation failed';
  
  return unexpectedError(
    'PERMISSION_SYNC_FAILED',
    internalMsg,
    {
      userMessage: 'Permission synchronization failed. Please try again.',
      cause,
      retryable: true,
    },
  );
}

/**
 * Permission sync conflict detected.
 * HTTP Status: 409
 *
 * This error is returned when permission sync detects conflicts that
 * cannot be automatically resolved with the current strategy.
 *
 * @see Requirements 35 — Sync conflict resolution
 */
export function permissionSyncConflict(
  description: string,
  conflicts?: readonly { type: string; role: string; permissionCode: string; severity: string; description: string }[],
): AppError {
  const conflictCount = conflicts?.length ?? 0;
  const internalMsg = `Permission sync conflict: ${description}. ${conflictCount} conflicts detected.`;
  
  return authorizationError(
    'PERMISSION_SYNC_CONFLICT',
    internalMsg,
    {
      userMessage: 'Permission synchronization detected conflicts that require resolution.',
    },
  );
}

/**
 * Permission sync validation failed.
 * HTTP Status: 400
 *
 * This error is returned when the permission registry fails validation
 * before sync can proceed.
 *
 * @see Requirements 35 — Permission registry synchronization
 */
export function permissionSyncValidationFailed(
  details: string,
): AppError {
  return authorizationError(
    'PERMISSION_SYNC_VALIDATION_FAILED',
    `Permission registry validation failed: ${details}`,
    {
      userMessage: 'Permission configuration is invalid. Please contact support.',
    },
  );
}

/**
 * Permission sync timed out.
 * HTTP Status: 503
 *
 * This error is returned when a permission sync operation times out.
 *
 * @see Requirements 35 — Permission Sync Mechanism
 */
export function permissionSyncTimeout(
  targetId?: string,
  timeoutMs?: number,
): AppError {
  const internalMsg = targetId
    ? `Permission sync timed out for target: ${targetId}${timeoutMs ? ` after ${timeoutMs}ms` : ''}`
    : `Permission sync timed out${timeoutMs ? ` after ${timeoutMs}ms` : ''}`;
  
  return unexpectedError(
    'PERMISSION_SYNC_TIMEOUT',
    internalMsg,
    {
      userMessage: 'Permission synchronization timed out. Please try again.',
      retryable: true,
    },
  );
}

/**
 * Permission sync source unavailable.
 * HTTP Status: 503
 *
 * This error is returned when the permission registry source is not available.
 *
 * @see Requirements 35 — Permission registry synchronization
 */
export function permissionSyncSourceUnavailable(
  reason?: string,
): AppError {
  const internalMsg = reason
    ? `Permission registry source unavailable: ${reason}`
    : 'Permission registry source is unavailable';
  
  return unexpectedError(
    'PERMISSION_SYNC_SOURCE_UNAVAILABLE',
    internalMsg,
    {
      userMessage: 'Permission configuration is temporarily unavailable. Please try again later.',
      retryable: true,
    },
  );
}
