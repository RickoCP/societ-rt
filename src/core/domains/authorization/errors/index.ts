/**
 * Authorization errors barrel export.
 *
 * @see Requirements 2.7, 3, 6, 28, 29, 33, 35, 47
 */

export {
  // Permission Registry Errors
  permissionUndefined,
  permissionRegistryError,
  // JWT/Token Errors (Authentication)
  authTokenInvalid,
  authTokenExpired,
  authTokenVersionMismatch,
  // Authorization Context Resolution Errors
  authContextResolutionFailed,
  // OrgUnit Scope Authorization Errors (Task 15)
  authTenantMismatch,
  authOutOfScope,
  authScopeCheckFailed,
  // Authorization Concurrency Errors (Task 63, Req 28)
  conflictDetected,
  optimisticLockFailed,
  toctouRaceDetected,
  membershipLockTimeout,
  concurrentMembershipModification,
  authorizationRevalidationFailed,
  // Cache Invalidation Errors (Task 64, Req 29)
  cacheInvalidationFailed,
  cachePropagationFailed,
  invalidCacheKey,
  cacheOperationTimeout,
  // Batch Operations Errors (Task 66, Req 33)
  batchOperationFailed,
  batchPartialFailure,
  batchSizeLimitExceeded,
  batchTransactionFailed,
  batchEmptyItems,
  // Permission Sync Errors (Task 67, Req 35)
  permissionSyncFailed,
  permissionSyncConflict,
  permissionSyncValidationFailed,
  permissionSyncTimeout,
  permissionSyncSourceUnavailable,
} from './authorizationErrors';
