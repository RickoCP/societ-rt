/**
 * Infrastructure Auth Module — Barrel exports for auth-related services.
 *
 * @see Requirements 14 (Refresh Token), 15 (Token Version), 16 (Session Revocation)
 * @see Requirement 51 (Account Recovery & Credential Security) — Task 40
 */

// RefreshToken Service
export type {
  RefreshTokenService,
  ValidatedToken,
  TokenRotationResult,
  CreateTokenInput,
  RotateTokenInput,
  AuditLogger,
  RefreshTokenServiceConfig,
} from './RefreshTokenService';
export { RefreshTokenServiceImpl } from './RefreshTokenService';

// TokenVersion Service
export type {
  TokenVersionService,
  TokenVersionIncrementResult,
  BulkTokenVersionIncrementResult,
  TokenVersionUserRepository,
} from './TokenVersionService';
export { TokenVersionServiceImpl } from './TokenVersionService';

// SessionManager Service
export type {
  SessionManagerService,
  LogoutResult,
  LogoutAllDevicesResult,
  LogoutFromTenantResult,
  SessionAuditLogger,
  SessionAuditEntry,
  SessionManagerServiceConfig,
} from './SessionManagerService';
export { SessionManagerServiceImpl } from './SessionManagerService';

// Cookie Helper
export type {
  CookieHelper,
  RefreshTokenCookieOptions,
  AccessTokenCookieOptions,
} from './CookieHelper';
export {
  createCookieHelper,
  cookieHelper,
  REFRESH_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_EXPIRY_SECONDS,
  DEFAULT_ACCESS_TOKEN_EXPIRY_SECONDS,
} from './CookieHelper';

// ============================================================================
// Token Security Hardening (Task 40 — Requirement 51)
// ============================================================================

// Token Entropy Validator
export type {
  TokenEntropyValidator,
  TokenEntropyValidatorConfig,
  EntropyValidationResult,
  EntropyIssue,
  EntropyIssueType,
} from './TokenEntropyValidator';
export { TokenEntropyValidatorImpl } from './TokenEntropyValidator';

// Secure Token Storage
export type {
  SecureTokenStorage,
  SecureTokenStorageConfig,
  HashedTokenResult,
  EncryptionKeyConfig,
  EncryptedDataResult,
  StoredEncryptedData,
} from './SecureTokenStorage';
export { SecureTokenStorageImpl } from './SecureTokenStorage';

// Token Leak Detection Service
export type {
  TokenLeakDetectionService,
  TokenLeakDetectionConfig,
  TokenUsageEvent,
  GeolocationInfo,
  LeakDetectionResult,
  RiskLevel,
  DetectedAnomaly,
  AnomalyType,
  RecommendedAction,
  ActionType,
  LeakDetectionAuditEntry,
} from './TokenLeakDetectionService';
export { TokenLeakDetectionServiceImpl } from './TokenLeakDetectionService';

// Recovery Token Service
export type {
  RecoveryTokenService,
  RecoveryTokenServiceConfig,
  RecoveryTokenRepository,
  CreateRecoveryTokenResult,
  CreateRecoveryTokenInput,
  UseRecoveryTokenInput,
  ValidatedRecoveryToken,
  RecoveryTokenAuditLogger,
} from './RecoveryTokenService';
export { RecoveryTokenServiceImpl } from './RecoveryTokenService';

// Token Security Audit Service
export type {
  TokenSecurityAuditService,
  TokenSecurityAuditServiceConfig,
  TokenSecurityAuditEvent,
  CreateAuditEventInput,
  AuditEventQuery,
  SecurityAlertConfig,
  SecurityEventSeverity,
  SecurityEventCategory,
  TokenSecurityEventType,
} from './TokenSecurityAuditService';
export { TokenSecurityAuditServiceImpl } from './TokenSecurityAuditService';

// Password Change Handler
export type {
  PasswordChangeHandler,
  PasswordChangeHandlerConfig,
  PasswordChangeResult,
  ChangePasswordInput,
  PasswordChangeReason,
  PasswordPolicy,
  PasswordValidationResult,
  PasswordPolicyViolation,
  PasswordRepository,
} from './PasswordChangeHandler';
export { PasswordChangeHandlerImpl } from './PasswordChangeHandler';

// ============================================================================
// Session Invalidation Service (Task 41 — Req 52)
// ============================================================================

// Session Invalidation Service
export type {
  SessionInvalidationService,
  SessionInvalidationServiceConfig,
  ImmediateInvalidationResult,
  BulkInvalidationResult,
  CrossDeviceTerminationResult,
  TenantWideInvalidationResult,
  CrossDeviceTerminationOptions,
  InvalidationReason,
  SessionInvalidationAuditEntry,
  SessionInvalidationAuditLogger,
  SessionInvalidationUserRepository,
} from './SessionInvalidationService';
export { SessionInvalidationServiceImpl } from './SessionInvalidationService';

// ============================================================================
// Refresh Token Security Service (Task 42 — Req 53)
// ============================================================================

// Refresh Token Security Service
export type {
  RefreshTokenSecurityService,
  RefreshTokenSecurityConfig,
  DeviceFingerprint,
  TokenBinding,
  RefreshPatternData,
  RefreshPatternAnomalyResult,
  RefreshAnomalyType,
  RefreshSecurityAction,
  RefreshAnomalyEvidence,
  TokenBindingValidationResult,
  TokenBindingValidationReason,
  RefreshSecurityEvent,
  RefreshSecurityEventType,
  SecurityEventSeverity,
  RefreshSecurityAuditLogger,
  RefreshSecurityValidationResult,
} from './RefreshTokenSecurityService';
export {
  RefreshTokenSecurityServiceImpl,
  authTokenBindingInvalid,
  authDeviceFingerprintMismatch,
  authRefreshAnomalyDetected,
  authTokenAutoRevoked,
} from './RefreshTokenSecurityService';
