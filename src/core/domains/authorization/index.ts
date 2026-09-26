/**
 * Authorization domain barrel export.
 *
 * This domain contains the central Permission Registry, authorization
 * context types, and services for the membership-based authorization system.
 *
 * @see Requirements 2, 3, 5, 6, 28, 29, 33, 35
 * @see Design Components and Interfaces > 8. Permission Registry
 */

// ============================================================================
// Types
// ============================================================================

// Authorization Context types
export type {
  AuthorizationContext,
  JWTClaims,
  PartialJWTClaims,
  AuthorizationContextInput,
  AuthorizationContextMetadata,
  AuthorizationContextResult,
  AuthContextCompat,
} from './types';

// Migration Compatibility Helpers (FASE 2.6 - Task 14)
export {
  isAuthorizationContext,
  isLegacyAuthContext,
  getOrgUnitId,
  getPermissions,
  hasPermission,
  getMembershipId,
  getRole,
  getMembershipRole,
  isAuthoritative,
  isTenantLevel,
  getUserId,
  getTenantId,
} from './types';

// Permission types
export type {
  Permission,
  PermissionAction,
  PermissionDomain,
  PermissionCode,
} from './permissions/Permission';

// Permission Registry types
export type { PermissionRegistry } from './permissions/PermissionRegistry';

// ============================================================================
// Constants and Helpers
// ============================================================================

// Permission constants and helpers
export {
  PERMISSIONS,
  PERMISSION_BY_CODE,
  ALL_PERMISSION_CODES,
  createPermission,
  parsePermissionCode,
  isValidPermissionCode,
} from './permissions/Permission';

// Role-Permission mapping and helpers
export {
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  roleHasPermission,
  roleHasAllPermissions,
  getMissingPermissions,
  validatePermissionRegistry,
  PERMISSION_REGISTRY,
} from './permissions/PermissionRegistry';

// ============================================================================
// Services
// ============================================================================

// Authorization Context Resolver (Task 13)
export type {
  IAuthorizationContextResolver,
  AuthorizationContextResolver,
} from './services';

export { AuthorizationContextResolverImpl } from './services';

// OrgUnit Scope Authorizer (Task 15)
export type {
  IOrgUnitScopeAuthorizer,
  OrgUnitScopeAuthorizer,
  OrgUnitScopeCheckParams,
  OrgUnitScopeCheckResult,
  OrgUnitScopeAllowReason,
  OrgUnitScopeDenyReason,
} from './services';

export { OrgUnitScopeAuthorizerImpl } from './services';

// Authorization Concurrency Service (Task 63, Req 28)
export type {
  IAuthorizationConcurrencyService,
  AuthorizationConcurrencyService,
  IToctouAuditLogger,
  VersionedResource,
  ConcurrentMembershipResolutionParams,
  ConcurrentMembershipResolutionResult,
  OptimisticLockUpdateParams,
  ToctouSafeOperationParams,
  ConflictDetectionParams,
  ConflictResolutionConfig,
  ToctouAuditEntry,
} from './services';

export {
  AuthorizationConcurrencyServiceImpl,
  ConsoleToctouAuditLogger,
  ConflictResolutionStrategy,
} from './services';

// Cache Invalidation Service (Task 64, Req 29)
export type {
  ICacheInvalidationService,
  CacheInvalidationService,
  IInvalidationEventListener,
  CacheKey,
  InvalidationEvent,
  InvalidationResult,
  CacheEntry,
  CacheTTLConfig,
  CacheStats,
} from './services';

export {
  CacheInvalidationServiceImpl,
  ConsoleInvalidationEventListener,
  CacheKeyType,
  InvalidationEventType,
  DEFAULT_CACHE_TTL_CONFIG,
} from './services';

// Batch Operations Service (Task 66, Req 33)
export type {
  IBatchOperationsService,
  BatchOperationsService,
  IBatchOperationAuditLogger,
  BatchOperationsConfig,
  BatchItemResult,
  BatchOperationResult,
  BatchOperationAuditEntry,
  PermissionCheckRequest,
  PermissionCheckResult,
  BatchPermissionCheckParams,
  MembershipUpdateRequest,
  MembershipUpdateResult,
  BatchMembershipUpdateParams,
  AuthorizationQueryRequest,
  AuthorizationQueryResult,
  BatchAuthorizationQueryParams,
  CacheInvalidationRequest,
  BatchCacheInvalidationParams,
} from './services';

export {
  BatchOperationsServiceImpl,
  ConsoleBatchOperationAuditLogger,
  BatchTransactionMode,
  BatchItemStatus,
  DEFAULT_BATCH_OPERATIONS_CONFIG,
} from './services';

// Permission Sync Service (Task 67, Req 35)
export type {
  IPermissionSyncService,
  PermissionSyncService,
  IPermissionSyncAuditLogger,
  PermissionSyncConfig,
  PermissionSyncResult,
  PermissionSyncItem,
  RolePermissionSyncItem,
  ConsistencyCheckResult,
  ConsistencyIssue,
  SyncPermissionsParams,
  PermissionTargetState,
  PermissionSyncAuditEntry,
} from './services';

export {
  PermissionSyncServiceImpl,
  ConsolePermissionSyncAuditLogger,
  SyncOperationType,
  SyncStatus,
  PermissionConflictResolutionStrategy,
  DEFAULT_PERMISSION_SYNC_CONFIG,
} from './services';

// Security Validation Suite (Task 75 - FASE 1.21, Req 37)
export type {
  ISecurityValidationSuite,
  SecurityValidationSuiteDependencies,
  SecurityValidationScenario,
  SecurityValidationResult,
  SecurityValidationSummary,
  SecurityInvariantId,
  ValidateTenantIsolationInput,
  CrossTenantAccessTestInput,
  ValidateAuthorizationBoundaryInput,
  PermissionBoundaryTestInput,
  ValidateSessionSecurityInput,
  TokenReuseDetectionTestInput,
  ValidateMembershipResolutionInput,
} from './services';

export {
  SecurityValidationSuiteImpl,
  SecurityValidationCategory,
  SecurityValidationSeverity,
  SecurityTestType,
  SecurityValidationStatus,
  SECURITY_VALIDATION_SCENARIOS,
  SUPPORTED_SECURITY_INVARIANTS,
} from './services';

// ============================================================================
// Errors
// ============================================================================

// Authorization errors
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
} from './errors';
