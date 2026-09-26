/**
 * Authorization services barrel export.
 *
 * @see Requirements 2, 3, 5, 6, 7, 28, 29, 33, 35
 */

// Authorization Context Resolver (Task 13)
export type {
  IAuthorizationContextResolver,
  AuthorizationContextResolver,
} from './AuthorizationContextResolver';

export { AuthorizationContextResolverImpl } from './AuthorizationContextResolver';

// OrgUnit Scope Authorizer (Task 15)
export type {
  IOrgUnitScopeAuthorizer,
  OrgUnitScopeAuthorizer,
  OrgUnitScopeCheckParams,
  OrgUnitScopeCheckResult,
  OrgUnitScopeAllowReason,
  OrgUnitScopeDenyReason,
} from './OrgUnitScopeAuthorizer';

export { OrgUnitScopeAuthorizerImpl } from './OrgUnitScopeAuthorizer';

// Shadow Authorization Service (Task 21 - FASE 1.9)
export type {
  IShadowAuthorizationService,
  ShadowAuthorizationService,
  IMismatchLogger,
} from './ShadowAuthorizationService';

export {
  ShadowAuthorizationServiceImpl,
  ConsoleMismatchLogger,
} from './ShadowAuthorizationService';

// Shadow Mode Feature Flag Service (Task 22 - FASE 1.9)
export type {
  IShadowModeFeatureFlagService,
  ShadowModeFeatureFlagService,
} from './ShadowModeFeatureFlagService';

export { ShadowModeFeatureFlagServiceImpl } from './ShadowModeFeatureFlagService';

// Authorization Concurrency Service (Task 63 - FASE 1.20, Req 28)
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
} from './AuthorizationConcurrencyService';

export {
  AuthorizationConcurrencyServiceImpl,
  ConsoleToctouAuditLogger,
  ConflictResolutionStrategy,
} from './AuthorizationConcurrencyService';

// Cache Invalidation Service (Task 64 - FASE 1.20, Req 29)
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
} from './CacheInvalidationService';

export {
  CacheInvalidationServiceImpl,
  ConsoleInvalidationEventListener,
  CacheKeyType,
  InvalidationEventType,
  DEFAULT_CACHE_TTL_CONFIG,
} from './CacheInvalidationService';

// Batch Operations Service (Task 66 - FASE 1.20, Req 33)
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
} from './BatchOperationsService';

export {
  BatchOperationsServiceImpl,
  ConsoleBatchOperationAuditLogger,
  BatchTransactionMode,
  BatchItemStatus,
  DEFAULT_BATCH_OPERATIONS_CONFIG,
} from './BatchOperationsService';

// Permission Sync Service (Task 67 - FASE 1.20, Req 35)
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
} from './PermissionSyncService';

export {
  PermissionSyncServiceImpl,
  ConsolePermissionSyncAuditLogger,
  SyncOperationType,
  SyncStatus,
  ConflictResolutionStrategy as PermissionConflictResolutionStrategy,
  DEFAULT_PERMISSION_SYNC_CONFIG,
} from './PermissionSyncService';

// Authorization Error Handler Service (Task 69 - FASE 1.20, Req 39)
export type {
  IAuthorizationErrorHandlerService,
  AuthorizationErrorHandlerService,
  IAuthorizationErrorLogger,
  ErrorContext,
  EnhancedAuthorizationError,
  SanitizedErrorResponse,
  ErrorLogEntry,
  AuthorizationErrorCodeType,
} from './AuthorizationErrorHandlerService';

export {
  AuthorizationErrorHandlerServiceImpl,
  ConsoleAuthorizationErrorLogger,
  AuthorizationErrorCode,
  ErrorCodeToHttpStatus,
} from './AuthorizationErrorHandlerService';

// Cross-Tenant Prevention Service (Task 72 - FASE 1.20, Req 59)
export type {
  ICrossTenantPreventionService,
  ICrossTenantPreventionAuditEmitter,
  IUserMembershipChecker,
  TenantContext,
  ResourceInfo,
  ValidateResourceAccessInput,
  ValidateUserMembershipInput,
  ValidateRequestContextInput,
  BatchResourceItem,
  ValidateBatchOperationInput,
  ValidateQueryTenantFilterInput,
  ValidateMutationTargetInput,
  PreventionCheckResult,
  BatchValidationResult,
  InvalidResourceInfo,
  PreventionViolationEvent,
} from './CrossTenantPreventionService';

export {
  CrossTenantPreventionServiceImpl,
  ConsoleCrossTenantPreventionAuditEmitter,
  DefaultUserMembershipChecker,
  CrossTenantCheckType,
  OperationType,
  ResourceType,
  PreventionCheckStatus,
  PreventionEventSeverity,
} from './CrossTenantPreventionService';

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
} from './SecurityValidationSuite';

export {
  SecurityValidationSuiteImpl,
  SecurityValidationCategory,
  SecurityValidationSeverity,
  SecurityTestType,
  SecurityValidationStatus,
  SECURITY_VALIDATION_SCENARIOS,
  SUPPORTED_SECURITY_INVARIANTS,
} from './SecurityValidationSuite';

// Security Testing Suite (Task 76 - FASE 1.21, Req 37)
export type {
  ISecurityTestingSuite,
  SecurityTestingSuiteDependencies,
  PenetrationTestScenario,
  SecurityRegressionTest,
  SecurityTestResult,
  SecurityTestSuiteReport,
  SecurityTestingConfig,
  EnvironmentSeparationTestInput,
  VulnerabilityScanResult,
  VulnerabilityFinding,
} from './SecurityTestingSuite';

export {
  SecurityTestingSuiteImpl,
  SecurityTestCategory,
  SecurityTestStatus,
  AttackVector,
  RiskLevel,
  EnvironmentType,
  PENETRATION_TEST_SCENARIOS,
  SECURITY_REGRESSION_TESTS,
  DEFAULT_SECURITY_TESTING_CONFIG,
} from './SecurityTestingSuite';

// Performance Validation Service (Task 78 - FASE 1.22, Req 42)
export type {
  IPerformanceValidationService,
  PerformanceValidationService,
  IPerformanceAlertEmitter,
  PerformanceThresholdConfig,
  PerformanceSample,
  PerformanceStatistics,
  CachePerformanceMetrics,
  RlsPerformanceMetrics,
  MetricValidationResult,
  PerformanceValidationReport,
  PerformanceAlert,
  LoadTestConfig,
  LoadTestResult,
  RecordAuthContextLatencyInput,
  RecordPermissionLookupLatencyInput,
  RecordRlsQueryInput,
  RecordCacheOperationInput,
  RecordMembershipResolutionInput,
  RecordTokenValidationInput,
  PerformanceValidationServiceDependencies,
} from './PerformanceValidationService';

export {
  PerformanceValidationServiceImpl,
  ConsolePerformanceAlertEmitter,
  PerformanceMetricCategory,
  PerformanceValidationStatus,
  PerformanceAlertSeverity,
  PercentileType,
  DEFAULT_PERFORMANCE_THRESHOLDS,
} from './PerformanceValidationService';

// Disaster Recovery Testing Service (Task 79 - FASE 1.22, Req 32)
export type {
  IDisasterRecoveryTestingService,
  DisasterRecoveryTestingService,
  IDisasterRecoveryAlertEmitter,
  IDatabaseValidator,
  ISessionManager,
  ICacheManager,
  IRlsPolicyChecker,
  IBackupManager,
  DisasterRecoveryConfig,
  DisasterRecoveryScenario,
  DisasterRecoveryTestResult,
  DisasterRecoveryMetrics,
  DisasterRecoveryReport,
  DisasterRecoverySummary,
  DisasterRecoveryAlert,
  BackupMetadata,
  TestDatabaseFailoverInput,
  TestDataRecoveryInput,
  TestSessionRecoveryInput,
  TestCacheWarmupInput,
  TestTenantIsolationInput,
  TestRlsConsistencyInput,
  DisasterRecoveryTestingServiceDependencies,
} from './DisasterRecoveryTestingService';

export {
  DisasterRecoveryTestingServiceImpl,
  ConsoleDisasterRecoveryAlertEmitter,
  DisasterRecoveryCategory,
  DisasterRecoveryStatus,
  DisasterRecoverySeverity,
  FailoverScenario,
  DR_ERROR_CODES,
  DR_TEST_SCENARIOS,
  DEFAULT_DR_CONFIG,
} from './DisasterRecoveryTestingService';

// Performance Targets Validation Service (Task 80 - FASE 1.22, Req 40)
export type {
  IPerformanceTargetsValidationService,
  PerformanceTargetsValidationService,
  IPerformanceTargetsAlertEmitter,
  ValidationTargetDefinition,
  ValidationTargetResult,
  ValidationStatistics,
  ScalabilityLimit,
  PerformanceBenchmark,
  PerformanceRegression,
  TenantIsolationPerformanceResult,
  PerformanceTargetsReport,
  RunValidationInput,
  PerformanceSampleInput,
  BaselineConfig,
  PerformanceTargetsValidationServiceDependencies,
} from './PerformanceTargetsValidationService';

export {
  PerformanceTargetsValidationServiceImpl,
  ConsolePerformanceTargetsAlertEmitter,
  ValidationTargetId,
  AdditionalPerformanceTarget,
  ValidationTestType,
  ValidationTargetStatus,
  ScalabilityLimitStatus,
  RegressionStatus,
  V1_V7_TARGETS,
  ADDITIONAL_TARGETS,
  DEFAULT_SCALABILITY_LIMITS,
  DEFAULT_BASELINE_CONFIG,
} from './PerformanceTargetsValidationService';
