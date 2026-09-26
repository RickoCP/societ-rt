/**
 * AuthorizationErrorHandlerService — Standardized authorization error handling.
 *
 * This service provides centralized error handling for all authorization errors:
 * 1. Standardized error codes for consistent client handling
 * 2. Error context preservation (error chain, additional context)
 * 3. Error response sanitization (remove internal details for client responses)
 * 4. Error logging with correlation ID support
 *
 * **SECURITY REQUIREMENTS (INV-AUTH-002):**
 * - Error messages MUST NOT expose internal permission details to clients
 * - Fail closed on unknown error states
 * - Errors MUST NOT leak which permissions exist or don't exist
 * - Error responses MUST NOT expose tenant/resource IDs in user messages
 *
 * @see Task 69: Authorization Error Handling (Req 39)
 * @see Requirements 47 — Authorization Error Standardization
 * @see Error Handling Guideline (12-error-handling.md)
 */

import type { DomainResult, AppError, AppErrorType } from '@core/utils';
import { ok, fail, authenticationError, authorizationError, unexpectedError } from '@core/utils';

// ---------------------------------------------------------------------------
// Standardized Authorization Error Codes (Req 47)
// ---------------------------------------------------------------------------

/**
 * Comprehensive list of authorization error codes per Req 47.
 * Each code maps to a specific HTTP status and has defined semantics.
 */
export const AuthorizationErrorCode = {
  // Authentication errors (401)
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',
  AUTH_TOKEN_REUSE_DETECTED: 'AUTH_TOKEN_REUSE_DETECTED',
  AUTH_TOKEN_VERSION_MISMATCH: 'AUTH_TOKEN_VERSION_MISMATCH',
  AUTH_REAUTH_REQUIRED: 'AUTH_REAUTH_REQUIRED',

  // Authorization errors (403)
  AUTH_NO_MEMBERSHIP: 'AUTH_NO_MEMBERSHIP',
  AUTH_MEMBERSHIP_INACTIVE: 'AUTH_MEMBERSHIP_INACTIVE',
  AUTH_MEMBERSHIP_CONTEXT_INVALID: 'AUTH_MEMBERSHIP_CONTEXT_INVALID',
  AUTH_INSUFFICIENT_PERMISSION: 'AUTH_INSUFFICIENT_PERMISSION',
  AUTH_OUT_OF_SCOPE: 'AUTH_OUT_OF_SCOPE',
  AUTH_TENANT_MISMATCH: 'AUTH_TENANT_MISMATCH',
  AUTH_USER_QUARANTINED: 'AUTH_USER_QUARANTINED',
  AUTH_DELEGATION_VIOLATION: 'AUTH_DELEGATION_VIOLATION',
  AUTH_HOUSEHOLD_MISMATCH: 'AUTH_HOUSEHOLD_MISMATCH',
  AUTH_INVALID_SCOPE: 'AUTH_INVALID_SCOPE',
  AUTH_CONTEXT_RESOLUTION_FAILED: 'AUTH_CONTEXT_RESOLUTION_FAILED',
  AUTH_SCOPE_CHECK_FAILED: 'AUTH_SCOPE_CHECK_FAILED',
  AUTH_REVALIDATION_FAILED: 'AUTH_REVALIDATION_FAILED',

  // Subscription/entitlement errors (403)
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  ENTITLEMENT_NOT_AVAILABLE: 'ENTITLEMENT_NOT_AVAILABLE',

  // Context switch errors (400)
  CONTEXT_SWITCH_INVALID: 'CONTEXT_SWITCH_INVALID',

  // Concurrency/conflict errors (409)
  CONFLICT_DETECTED: 'CONFLICT_DETECTED',
  OPTIMISTIC_LOCK_FAILED: 'OPTIMISTIC_LOCK_FAILED',
  TOCTOU_RACE_DETECTED: 'TOCTOU_RACE_DETECTED',
  CONCURRENT_MEMBERSHIP_MODIFICATION: 'CONCURRENT_MEMBERSHIP_MODIFICATION',

  // Integration errors
  IDEMPOTENCY_MISMATCH: 'IDEMPOTENCY_MISMATCH',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',

  // Internal errors (500)
  PERMISSION_UNDEFINED: 'PERMISSION_UNDEFINED',
  PERMISSION_REGISTRY_ERROR: 'PERMISSION_REGISTRY_ERROR',
  CACHE_INVALIDATION_FAILED: 'CACHE_INVALIDATION_FAILED',
  CACHE_PROPAGATION_FAILED: 'CACHE_PROPAGATION_FAILED',
  CACHE_OPERATION_TIMEOUT: 'CACHE_OPERATION_TIMEOUT',
  INVALID_CACHE_KEY: 'INVALID_CACHE_KEY',
  MEMBERSHIP_LOCK_TIMEOUT: 'MEMBERSHIP_LOCK_TIMEOUT',
  BATCH_OPERATION_FAILED: 'BATCH_OPERATION_FAILED',
  BATCH_PARTIAL_FAILURE: 'BATCH_PARTIAL_FAILURE',
  BATCH_SIZE_LIMIT_EXCEEDED: 'BATCH_SIZE_LIMIT_EXCEEDED',
  BATCH_TRANSACTION_FAILED: 'BATCH_TRANSACTION_FAILED',
  BATCH_EMPTY_ITEMS: 'BATCH_EMPTY_ITEMS',
  PERMISSION_SYNC_FAILED: 'PERMISSION_SYNC_FAILED',
  PERMISSION_SYNC_CONFLICT: 'PERMISSION_SYNC_CONFLICT',
  PERMISSION_SYNC_VALIDATION_FAILED: 'PERMISSION_SYNC_VALIDATION_FAILED',
  PERMISSION_SYNC_TIMEOUT: 'PERMISSION_SYNC_TIMEOUT',
  PERMISSION_SYNC_SOURCE_UNAVAILABLE: 'PERMISSION_SYNC_SOURCE_UNAVAILABLE',
  AUTHORIZATION_ERROR_HANDLING_FAILED: 'AUTHORIZATION_ERROR_HANDLING_FAILED',
} as const;

export type AuthorizationErrorCodeType = typeof AuthorizationErrorCode[keyof typeof AuthorizationErrorCode];

// ---------------------------------------------------------------------------
// Error Code to HTTP Status Mapping
// ---------------------------------------------------------------------------

/**
 * Maps authorization error codes to HTTP status codes per Req 47.4.
 */
export const ErrorCodeToHttpStatus: Record<AuthorizationErrorCodeType, number> = {
  // 401 Unauthorized (Authentication)
  [AuthorizationErrorCode.AUTH_TOKEN_INVALID]: 401,
  [AuthorizationErrorCode.AUTH_TOKEN_EXPIRED]: 401,
  [AuthorizationErrorCode.AUTH_TOKEN_REVOKED]: 401,
  [AuthorizationErrorCode.AUTH_TOKEN_REUSE_DETECTED]: 401,
  [AuthorizationErrorCode.AUTH_TOKEN_VERSION_MISMATCH]: 401,
  [AuthorizationErrorCode.AUTH_REAUTH_REQUIRED]: 401,

  // 403 Forbidden (Authorization)
  [AuthorizationErrorCode.AUTH_NO_MEMBERSHIP]: 403,
  [AuthorizationErrorCode.AUTH_MEMBERSHIP_INACTIVE]: 403,
  [AuthorizationErrorCode.AUTH_MEMBERSHIP_CONTEXT_INVALID]: 403,
  [AuthorizationErrorCode.AUTH_INSUFFICIENT_PERMISSION]: 403,
  [AuthorizationErrorCode.AUTH_OUT_OF_SCOPE]: 403,
  [AuthorizationErrorCode.AUTH_TENANT_MISMATCH]: 403,
  [AuthorizationErrorCode.AUTH_USER_QUARANTINED]: 403,
  [AuthorizationErrorCode.AUTH_DELEGATION_VIOLATION]: 403,
  [AuthorizationErrorCode.AUTH_HOUSEHOLD_MISMATCH]: 403,
  [AuthorizationErrorCode.AUTH_INVALID_SCOPE]: 403,
  [AuthorizationErrorCode.AUTH_CONTEXT_RESOLUTION_FAILED]: 403,
  [AuthorizationErrorCode.AUTH_SCOPE_CHECK_FAILED]: 403,
  [AuthorizationErrorCode.AUTH_REVALIDATION_FAILED]: 403,
  [AuthorizationErrorCode.TENANT_SUSPENDED]: 403,
  [AuthorizationErrorCode.ENTITLEMENT_NOT_AVAILABLE]: 403,

  // 400 Bad Request
  [AuthorizationErrorCode.CONTEXT_SWITCH_INVALID]: 400,
  [AuthorizationErrorCode.BATCH_EMPTY_ITEMS]: 400,
  [AuthorizationErrorCode.BATCH_SIZE_LIMIT_EXCEEDED]: 400,
  [AuthorizationErrorCode.IDEMPOTENCY_MISMATCH]: 400,
  [AuthorizationErrorCode.INVALID_CACHE_KEY]: 400,
  [AuthorizationErrorCode.PERMISSION_SYNC_VALIDATION_FAILED]: 400,

  // 409 Conflict
  [AuthorizationErrorCode.CONFLICT_DETECTED]: 409,
  [AuthorizationErrorCode.OPTIMISTIC_LOCK_FAILED]: 409,
  [AuthorizationErrorCode.TOCTOU_RACE_DETECTED]: 409,
  [AuthorizationErrorCode.CONCURRENT_MEMBERSHIP_MODIFICATION]: 409,
  [AuthorizationErrorCode.PERMISSION_SYNC_CONFLICT]: 409,

  // 401/403 for webhook (use 401 as signature is authentication-like)
  [AuthorizationErrorCode.WEBHOOK_SIGNATURE_INVALID]: 401,

  // 500 Internal Server Error
  [AuthorizationErrorCode.PERMISSION_UNDEFINED]: 500,
  [AuthorizationErrorCode.PERMISSION_REGISTRY_ERROR]: 500,
  [AuthorizationErrorCode.CACHE_INVALIDATION_FAILED]: 500,
  [AuthorizationErrorCode.CACHE_PROPAGATION_FAILED]: 500,
  [AuthorizationErrorCode.BATCH_OPERATION_FAILED]: 500,
  [AuthorizationErrorCode.BATCH_TRANSACTION_FAILED]: 500,
  [AuthorizationErrorCode.PERMISSION_SYNC_FAILED]: 500,
  [AuthorizationErrorCode.AUTHORIZATION_ERROR_HANDLING_FAILED]: 500,

  // 207 Multi-Status for partial failures
  [AuthorizationErrorCode.BATCH_PARTIAL_FAILURE]: 207,

  // 503 Service Unavailable
  [AuthorizationErrorCode.CACHE_OPERATION_TIMEOUT]: 503,
  [AuthorizationErrorCode.MEMBERSHIP_LOCK_TIMEOUT]: 503,
  [AuthorizationErrorCode.PERMISSION_SYNC_TIMEOUT]: 503,
  [AuthorizationErrorCode.PERMISSION_SYNC_SOURCE_UNAVAILABLE]: 503,
};

// ---------------------------------------------------------------------------
// Error Context Types
// ---------------------------------------------------------------------------

/**
 * Error context for preserving error chain and additional metadata.
 */
export interface ErrorContext {
  /** Correlation ID for request tracing */
  readonly correlationId?: string;
  /** User ID involved in the error */
  readonly userId?: string;
  /** Tenant ID context */
  readonly tenantId?: string;
  /** OrgUnit ID context */
  readonly orgUnitId?: string;
  /** Request path/endpoint */
  readonly requestPath?: string;
  /** HTTP method */
  readonly httpMethod?: string;
  /** IP address */
  readonly ipAddress?: string;
  /** User agent */
  readonly userAgent?: string;
  /** Operation being performed */
  readonly operation?: string;
  /** Resource type being accessed */
  readonly resourceType?: string;
  /** Resource ID being accessed */
  readonly resourceId?: string;
  /** Timestamp of the error */
  readonly timestamp?: Date;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Enhanced error with preserved context chain.
 */
export interface EnhancedAuthorizationError extends AppError {
  /** Original error context */
  readonly context: ErrorContext;
  /** Error chain (preserved causes) */
  readonly errorChain: readonly AppError[];
  /** HTTP status code */
  readonly httpStatus: number;
}

/**
 * Sanitized error response safe for client consumption.
 */
export interface SanitizedErrorResponse {
  /** Error code for client handling */
  readonly code: string;
  /** Safe user message */
  readonly message: string;
  /** HTTP status code */
  readonly status: number;
  /** Correlation ID for support */
  readonly correlationId?: string;
  /** Whether operation can be retried */
  readonly retryable: boolean;
  /** Optional retry-after hint in seconds */
  readonly retryAfter?: number;
}

/**
 * Error log entry for observability.
 */
export interface ErrorLogEntry {
  /** Log level */
  readonly level: 'error' | 'warn' | 'info';
  /** Error code */
  readonly code: string;
  /** Error type classification */
  readonly type: AppErrorType;
  /** Internal message (for logs only) */
  readonly message: string;
  /** Correlation ID */
  readonly correlationId: string;
  /** User ID */
  readonly userId?: string;
  /** Tenant ID */
  readonly tenantId?: string;
  /** Request path */
  readonly requestPath?: string;
  /** HTTP method */
  readonly httpMethod?: string;
  /** HTTP status */
  readonly httpStatus: number;
  /** Timestamp */
  readonly timestamp: string;
  /** Error chain depth */
  readonly errorChainDepth: number;
  /** Retryable flag */
  readonly retryable: boolean;
  /** Additional context (sanitized) */
  readonly context: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Error Logger Interface
// ---------------------------------------------------------------------------

/**
 * Interface for error logging with correlation ID support.
 */
export interface IAuthorizationErrorLogger {
  /**
   * Log an authorization error with full context.
   */
  logError(entry: ErrorLogEntry): void;

  /**
   * Log a warning (non-critical authorization issue).
   */
  logWarning(entry: ErrorLogEntry): void;

  /**
   * Log an info message (successful error handling).
   */
  logInfo(entry: ErrorLogEntry): void;
}

// ---------------------------------------------------------------------------
// Default User Messages (Sanitized)
// ---------------------------------------------------------------------------

/**
 * Default user-safe messages for each error code.
 * These messages are intentionally generic to avoid information leakage.
 */
const DEFAULT_USER_MESSAGES: Record<AuthorizationErrorCodeType, string> = {
  // Authentication errors
  [AuthorizationErrorCode.AUTH_TOKEN_INVALID]: 'Invalid authentication token. Please log in again.',
  [AuthorizationErrorCode.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [AuthorizationErrorCode.AUTH_TOKEN_REVOKED]: 'Your session has expired. Please log in again.',
  [AuthorizationErrorCode.AUTH_TOKEN_REUSE_DETECTED]: 'Session security issue detected. Please log in again.',
  [AuthorizationErrorCode.AUTH_TOKEN_VERSION_MISMATCH]: 'Your session has expired. Please log in again.',
  [AuthorizationErrorCode.AUTH_REAUTH_REQUIRED]: 'Please re-authenticate to continue with this operation.',

  // Authorization errors
  [AuthorizationErrorCode.AUTH_NO_MEMBERSHIP]: 'You do not have access to this tenant.',
  [AuthorizationErrorCode.AUTH_MEMBERSHIP_INACTIVE]: 'Your access to this tenant has been suspended.',
  [AuthorizationErrorCode.AUTH_MEMBERSHIP_CONTEXT_INVALID]: 'Invalid access context. Please select a valid tenant.',
  [AuthorizationErrorCode.AUTH_INSUFFICIENT_PERMISSION]: 'You do not have permission to perform this action.',
  [AuthorizationErrorCode.AUTH_OUT_OF_SCOPE]: 'You do not have access to this resource.',
  [AuthorizationErrorCode.AUTH_TENANT_MISMATCH]: 'You do not have access to this resource.',
  [AuthorizationErrorCode.AUTH_USER_QUARANTINED]: 'Your account access is restricted. Please contact support.',
  [AuthorizationErrorCode.AUTH_DELEGATION_VIOLATION]: 'You cannot grant this level of access.',
  [AuthorizationErrorCode.AUTH_HOUSEHOLD_MISMATCH]: 'You do not have access to this household.',
  [AuthorizationErrorCode.AUTH_INVALID_SCOPE]: 'Invalid access scope for this operation.',
  [AuthorizationErrorCode.AUTH_CONTEXT_RESOLUTION_FAILED]: 'An authentication error occurred. Please try again.',
  [AuthorizationErrorCode.AUTH_SCOPE_CHECK_FAILED]: 'An authorization error occurred. Please try again.',
  [AuthorizationErrorCode.AUTH_REVALIDATION_FAILED]: 'Your authorization has changed. Please refresh and try again.',

  // Subscription errors
  [AuthorizationErrorCode.TENANT_SUSPENDED]: 'This tenant is currently suspended. Please contact support.',
  [AuthorizationErrorCode.ENTITLEMENT_NOT_AVAILABLE]: 'This feature is not available on your current plan.',

  // Context errors
  [AuthorizationErrorCode.CONTEXT_SWITCH_INVALID]: 'Unable to switch to the requested context.',

  // Conflict errors
  [AuthorizationErrorCode.CONFLICT_DETECTED]: 'The resource was modified by another operation. Please refresh and try again.',
  [AuthorizationErrorCode.OPTIMISTIC_LOCK_FAILED]: 'The resource was modified by another user. Please refresh and try again.',
  [AuthorizationErrorCode.TOCTOU_RACE_DETECTED]: 'The authorization state changed during the operation. Please try again.',
  [AuthorizationErrorCode.CONCURRENT_MEMBERSHIP_MODIFICATION]: 'Another operation is modifying this membership. Please try again.',

  // Integration errors
  [AuthorizationErrorCode.IDEMPOTENCY_MISMATCH]: 'Request conflict: different request body with same idempotency key.',
  [AuthorizationErrorCode.WEBHOOK_SIGNATURE_INVALID]: 'Invalid webhook signature.',

  // Internal errors
  [AuthorizationErrorCode.PERMISSION_UNDEFINED]: 'An authorization error occurred.',
  [AuthorizationErrorCode.PERMISSION_REGISTRY_ERROR]: 'A system configuration error occurred.',
  [AuthorizationErrorCode.CACHE_INVALIDATION_FAILED]: 'A temporary error occurred. Please try again.',
  [AuthorizationErrorCode.CACHE_PROPAGATION_FAILED]: 'A temporary error occurred. Please try again.',
  [AuthorizationErrorCode.CACHE_OPERATION_TIMEOUT]: 'The system is busy. Please try again in a moment.',
  [AuthorizationErrorCode.INVALID_CACHE_KEY]: 'An internal error occurred.',
  [AuthorizationErrorCode.MEMBERSHIP_LOCK_TIMEOUT]: 'The system is busy. Please try again in a moment.',
  [AuthorizationErrorCode.BATCH_OPERATION_FAILED]: 'The batch operation failed. Please try again.',
  [AuthorizationErrorCode.BATCH_PARTIAL_FAILURE]: 'Some items could not be processed.',
  [AuthorizationErrorCode.BATCH_SIZE_LIMIT_EXCEEDED]: 'Batch size exceeds the maximum allowed.',
  [AuthorizationErrorCode.BATCH_TRANSACTION_FAILED]: 'The batch operation failed and all changes were rolled back.',
  [AuthorizationErrorCode.BATCH_EMPTY_ITEMS]: 'Batch operation requires at least one item.',
  [AuthorizationErrorCode.PERMISSION_SYNC_FAILED]: 'Permission synchronization failed. Please try again.',
  [AuthorizationErrorCode.PERMISSION_SYNC_CONFLICT]: 'Permission synchronization detected conflicts that require resolution.',
  [AuthorizationErrorCode.PERMISSION_SYNC_VALIDATION_FAILED]: 'Permission configuration is invalid. Please contact support.',
  [AuthorizationErrorCode.PERMISSION_SYNC_TIMEOUT]: 'Permission synchronization timed out. Please try again.',
  [AuthorizationErrorCode.PERMISSION_SYNC_SOURCE_UNAVAILABLE]: 'Permission configuration is temporarily unavailable.',
  [AuthorizationErrorCode.AUTHORIZATION_ERROR_HANDLING_FAILED]: 'An unexpected error occurred.',
};

// ---------------------------------------------------------------------------
// Sensitive Data Patterns
// ---------------------------------------------------------------------------

/**
 * Keys that should be redacted from error context.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'privatekey',
  'otp',
  'pin',
  'cvv',
  'ssn',
  'creditcard',
  'cardnumber',
  'authorization',
  'bearer',
  'cookie',
  'session',
  'nik',
]);

/**
 * Substrings that indicate sensitive data.
 */
const SENSITIVE_SUBSTRINGS = [
  'password',
  'token',
  'secret',
  'key',
  'credential',
];

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IAuthorizationErrorHandlerService interface.
 *
 * Provides comprehensive authorization error handling with:
 * - Error code standardization
 * - Context preservation
 * - Response sanitization
 * - Correlation ID logging
 */
export interface IAuthorizationErrorHandlerService {
  // ---------------------------------------------------------------------------
  // Error Enhancement
  // ---------------------------------------------------------------------------

  /**
   * Enhance an error with context and chain preservation.
   *
   * @param error - Original AppError
   * @param context - Error context
   * @param previousErrors - Previous errors in the chain
   * @returns DomainResult with enhanced error
   */
  enhanceError(
    error: AppError,
    context: ErrorContext,
    previousErrors?: readonly AppError[],
  ): DomainResult<EnhancedAuthorizationError>;

  /**
   * Create a standardized authorization error.
   *
   * @param code - Authorization error code
   * @param internalMessage - Internal message for logging
   * @param context - Error context
   * @param options - Additional options
   * @returns DomainResult with enhanced error
   */
  createError(
    code: AuthorizationErrorCodeType,
    internalMessage: string,
    context: ErrorContext,
    options?: {
      readonly userMessage?: string;
      readonly retryable?: boolean;
      readonly cause?: unknown;
      readonly previousErrors?: readonly AppError[];
    },
  ): DomainResult<EnhancedAuthorizationError>;

  // ---------------------------------------------------------------------------
  // Response Sanitization
  // ---------------------------------------------------------------------------

  /**
   * Sanitize an error for client response.
   *
   * Removes all internal details and returns only safe information.
   *
   * @param error - Enhanced error to sanitize
   * @returns Sanitized error response
   */
  sanitizeForResponse(error: EnhancedAuthorizationError): SanitizedErrorResponse;

  /**
   * Sanitize any error for client response.
   *
   * Handles both AppError and EnhancedAuthorizationError.
   *
   * @param error - Error to sanitize
   * @param correlationId - Correlation ID
   * @returns Sanitized error response
   */
  sanitizeAnyError(error: AppError, correlationId?: string): SanitizedErrorResponse;

  // ---------------------------------------------------------------------------
  // Error Logging
  // ---------------------------------------------------------------------------

  /**
   * Log an error with full context and correlation ID.
   *
   * @param error - Enhanced error to log
   */
  logError(error: EnhancedAuthorizationError): void;

  /**
   * Log an error from an AppError with context.
   *
   * @param error - AppError to log
   * @param context - Error context
   */
  logAppError(error: AppError, context: ErrorContext): void;

  // ---------------------------------------------------------------------------
  // Error Code Utilities
  // ---------------------------------------------------------------------------

  /**
   * Get HTTP status code for an error code.
   *
   * @param code - Authorization error code
   * @returns HTTP status code
   */
  getHttpStatus(code: string): number;

  /**
   * Check if an error code is an authentication error.
   *
   * @param code - Error code to check
   * @returns True if authentication error
   */
  isAuthenticationError(code: string): boolean;

  /**
   * Check if an error code indicates a retryable error.
   *
   * @param code - Error code to check
   * @returns True if retryable
   */
  isRetryableError(code: string): boolean;

  /**
   * Get all standardized error codes.
   *
   * @returns Array of all error codes
   */
  getErrorCodes(): readonly AuthorizationErrorCodeType[];

  // ---------------------------------------------------------------------------
  // Context Sanitization
  // ---------------------------------------------------------------------------

  /**
   * Sanitize context object for logging (remove sensitive data).
   *
   * @param context - Context to sanitize
   * @returns Sanitized context
   */
  sanitizeContext(context: ErrorContext): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Default Console Error Logger
// ---------------------------------------------------------------------------

/**
 * Console-based implementation of IAuthorizationErrorLogger for development.
 */
export const ConsoleAuthorizationErrorLogger: IAuthorizationErrorLogger = {
  logError(entry: ErrorLogEntry): void {
    console.error(
      `[AUTH_ERROR] [${entry.correlationId}] ${entry.code}: ${entry.message}`,
      JSON.stringify(entry, null, 2),
    );
  },

  logWarning(entry: ErrorLogEntry): void {
    console.warn(
      `[AUTH_WARN] [${entry.correlationId}] ${entry.code}: ${entry.message}`,
      JSON.stringify(entry, null, 2),
    );
  },

  logInfo(entry: ErrorLogEntry): void {
    console.info(
      `[AUTH_INFO] [${entry.correlationId}] ${entry.code}: ${entry.message}`,
      JSON.stringify(entry, null, 2),
    );
  },
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an AuthorizationErrorHandlerService instance.
 *
 * @param dependencies - Service dependencies
 * @returns An implementation of IAuthorizationErrorHandlerService
 *
 * @example
 * ```typescript
 * // DI Registration
 * container.register({
 *   authorizationErrorHandler: asFunction(AuthorizationErrorHandlerServiceImpl).singleton(),
 * });
 *
 * // Usage
 * const errorHandler = DI.resolve('authorizationErrorHandler');
 * const enhanced = errorHandler.createError(
 *   AuthorizationErrorCode.AUTH_INSUFFICIENT_PERMISSION,
 *   'User lacks permission: finance:write',
 *   { correlationId: 'abc-123', userId: 'user-1', tenantId: 'tenant-1' }
 * );
 * if (enhanced.success) {
 *   const sanitized = errorHandler.sanitizeForResponse(enhanced.data);
 *   // Return sanitized to client
 * }
 * ```
 */
export const AuthorizationErrorHandlerServiceImpl = ({
  errorLogger = ConsoleAuthorizationErrorLogger,
}: {
  errorLogger?: IAuthorizationErrorLogger;
}): IAuthorizationErrorHandlerService => {
  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate correlation ID if not provided.
   */
  const ensureCorrelationId = (context: ErrorContext): string => {
    if (context.correlationId) {
      return context.correlationId;
    }
    // Generate a simple UUID-like correlation ID
    return `auth-err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  /**
   * Determine AppErrorType from error code.
   */
  const getErrorType = (code: AuthorizationErrorCodeType): AppErrorType => {
    const status = ErrorCodeToHttpStatus[code] ?? 500;

    if (status === 401) {
      return 'authentication';
    }
    if (status === 403) {
      return 'authorization';
    }
    if (status === 400) {
      return 'validation';
    }
    if (status === 409 || status === 207) {
      return 'business';
    }
    if (status === 503) {
      return 'technical';
    }
    return 'unexpected';
  };

  /**
   * Check if a key is sensitive.
   */
  const isSensitiveKey = (key: string): boolean => {
    const lowerKey = key.toLowerCase();
    return (
      SENSITIVE_KEYS.has(lowerKey) ||
      SENSITIVE_SUBSTRINGS.some(sub => lowerKey.includes(sub))
    );
  };

  /**
   * Sanitize a value recursively.
   */
  const sanitizeValue = (value: unknown): unknown => {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      }

      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        if (isSensitiveKey(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitizeValue(val);
        }
      }
      return sanitized;
    }

    return value;
  };

  /**
   * Determine if error code is retryable by default.
   */
  const isDefaultRetryable = (code: AuthorizationErrorCodeType): boolean => {
    const retryableCodes = new Set<AuthorizationErrorCodeType>([
      AuthorizationErrorCode.CONFLICT_DETECTED,
      AuthorizationErrorCode.OPTIMISTIC_LOCK_FAILED,
      AuthorizationErrorCode.TOCTOU_RACE_DETECTED,
      AuthorizationErrorCode.CONCURRENT_MEMBERSHIP_MODIFICATION,
      AuthorizationErrorCode.CACHE_INVALIDATION_FAILED,
      AuthorizationErrorCode.CACHE_PROPAGATION_FAILED,
      AuthorizationErrorCode.CACHE_OPERATION_TIMEOUT,
      AuthorizationErrorCode.MEMBERSHIP_LOCK_TIMEOUT,
      AuthorizationErrorCode.BATCH_OPERATION_FAILED,
      AuthorizationErrorCode.BATCH_TRANSACTION_FAILED,
      AuthorizationErrorCode.PERMISSION_SYNC_FAILED,
      AuthorizationErrorCode.PERMISSION_SYNC_TIMEOUT,
      AuthorizationErrorCode.PERMISSION_SYNC_SOURCE_UNAVAILABLE,
    ]);
    return retryableCodes.has(code);
  };

  /**
   * Get log level based on error type and code.
   */
  const getLogLevel = (code: AuthorizationErrorCodeType, type: AppErrorType): 'error' | 'warn' | 'info' => {
    const status = ErrorCodeToHttpStatus[code] ?? 500;

    // 500+ are always errors
    if (status >= 500) {
      return 'error';
    }

    // 401/403 are warnings (expected authorization failures)
    if (status === 401 || status === 403) {
      return 'warn';
    }

    // 409/207 are info (expected conflicts)
    if (status === 409 || status === 207) {
      return 'info';
    }

    // Default to warn
    return type === 'unexpected' || type === 'technical' ? 'error' : 'warn';
  };

  /**
   * Create an AppError with the correct factory based on type.
   */
  const createBaseError = (
    code: AuthorizationErrorCodeType,
    internalMessage: string,
    userMessage: string,
    retryable: boolean,
    cause?: unknown,
  ): AppError => {
    const type = getErrorType(code);
    const options = { userMessage, retryable, cause };

    switch (type) {
      case 'authentication':
        return authenticationError(code, internalMessage, options);
      case 'authorization':
        return authorizationError(code, internalMessage, options);
      case 'unexpected':
        return unexpectedError(code, internalMessage, options);
      default:
        return authorizationError(code, internalMessage, options);
    }
  };

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  return {
    enhanceError(
      error: AppError,
      context: ErrorContext,
      previousErrors: readonly AppError[] = [],
    ): DomainResult<EnhancedAuthorizationError> {
      try {
        const correlationId = ensureCorrelationId(context);
        const httpStatus = ErrorCodeToHttpStatus[error.code as AuthorizationErrorCodeType] ?? 500;

        const enhancedError: EnhancedAuthorizationError = {
          ...error,
          context: {
            ...context,
            correlationId,
            timestamp: context.timestamp ?? new Date(),
          },
          errorChain: previousErrors,
          httpStatus,
        };

        return ok(enhancedError);
      } catch (cause) {
        return fail(unexpectedError(
          AuthorizationErrorCode.AUTHORIZATION_ERROR_HANDLING_FAILED,
          'Failed to enhance authorization error',
          { userMessage: 'An unexpected error occurred.', cause },
        ));
      }
    },

    createError(
      code: AuthorizationErrorCodeType,
      internalMessage: string,
      context: ErrorContext,
      options?: {
        readonly userMessage?: string;
        readonly retryable?: boolean;
        readonly cause?: unknown;
        readonly previousErrors?: readonly AppError[];
      },
    ): DomainResult<EnhancedAuthorizationError> {
      try {
        const correlationId = ensureCorrelationId(context);
        const userMessage = options?.userMessage ?? DEFAULT_USER_MESSAGES[code] ?? 'An error occurred.';
        const retryable = options?.retryable ?? isDefaultRetryable(code);
        const httpStatus = ErrorCodeToHttpStatus[code] ?? 500;

        const baseError = createBaseError(
          code,
          internalMessage,
          userMessage,
          retryable,
          options?.cause,
        );

        const enhancedError: EnhancedAuthorizationError = {
          ...baseError,
          context: {
            ...context,
            correlationId,
            timestamp: context.timestamp ?? new Date(),
          },
          errorChain: options?.previousErrors ?? [],
          httpStatus,
        };

        return ok(enhancedError);
      } catch (cause) {
        return fail(unexpectedError(
          AuthorizationErrorCode.AUTHORIZATION_ERROR_HANDLING_FAILED,
          'Failed to create authorization error',
          { userMessage: 'An unexpected error occurred.', cause },
        ));
      }
    },

    sanitizeForResponse(error: EnhancedAuthorizationError): SanitizedErrorResponse {
      // Calculate retry-after for retryable errors
      let retryAfter: number | undefined;
      if (error.retryable) {
        // Suggest 1-5 seconds based on error type
        const status = error.httpStatus;
        if (status === 503) {
          retryAfter = 5;
        } else if (status === 409) {
          retryAfter = 1;
        } else {
          retryAfter = 2;
        }
      }

      return {
        code: error.code,
        message: error.userMessage ?? DEFAULT_USER_MESSAGES[error.code as AuthorizationErrorCodeType] ?? 'An error occurred.',
        status: error.httpStatus,
        correlationId: error.context.correlationId,
        retryable: error.retryable ?? false,
        ...(retryAfter && { retryAfter }),
      };
    },

    sanitizeAnyError(error: AppError, correlationId?: string): SanitizedErrorResponse {
      const code = error.code as AuthorizationErrorCodeType;
      const httpStatus = ErrorCodeToHttpStatus[code] ?? 500;
      const retryable = error.retryable ?? isDefaultRetryable(code);

      let retryAfter: number | undefined;
      if (retryable) {
        retryAfter = httpStatus === 503 ? 5 : httpStatus === 409 ? 1 : 2;
      }

      return {
        code: error.code,
        message: error.userMessage ?? DEFAULT_USER_MESSAGES[code] ?? 'An error occurred.',
        status: httpStatus,
        correlationId,
        retryable,
        ...(retryAfter && { retryAfter }),
      };
    },

    logError(error: EnhancedAuthorizationError): void {
      const logEntry: ErrorLogEntry = {
        level: getLogLevel(error.code as AuthorizationErrorCodeType, error.type),
        code: error.code,
        type: error.type,
        message: error.message,
        correlationId: error.context.correlationId ?? 'unknown',
        userId: error.context.userId,
        tenantId: error.context.tenantId,
        requestPath: error.context.requestPath,
        httpMethod: error.context.httpMethod,
        httpStatus: error.httpStatus,
        timestamp: (error.context.timestamp ?? new Date()).toISOString(),
        errorChainDepth: error.errorChain.length,
        retryable: error.retryable ?? false,
        context: sanitizeValue(error.context.metadata ?? {}) as Record<string, unknown>,
      };

      switch (logEntry.level) {
        case 'error':
          errorLogger.logError(logEntry);
          break;
        case 'warn':
          errorLogger.logWarning(logEntry);
          break;
        case 'info':
          errorLogger.logInfo(logEntry);
          break;
      }
    },

    logAppError(error: AppError, context: ErrorContext): void {
      const code = error.code as AuthorizationErrorCodeType;
      const httpStatus = ErrorCodeToHttpStatus[code] ?? 500;
      const correlationId = ensureCorrelationId(context);

      const logEntry: ErrorLogEntry = {
        level: getLogLevel(code, error.type),
        code: error.code,
        type: error.type,
        message: error.message,
        correlationId,
        userId: context.userId,
        tenantId: context.tenantId,
        requestPath: context.requestPath,
        httpMethod: context.httpMethod,
        httpStatus,
        timestamp: (context.timestamp ?? new Date()).toISOString(),
        errorChainDepth: 0,
        retryable: error.retryable ?? false,
        context: sanitizeValue(context.metadata ?? {}) as Record<string, unknown>,
      };

      switch (logEntry.level) {
        case 'error':
          errorLogger.logError(logEntry);
          break;
        case 'warn':
          errorLogger.logWarning(logEntry);
          break;
        case 'info':
          errorLogger.logInfo(logEntry);
          break;
      }
    },

    getHttpStatus(code: string): number {
      return ErrorCodeToHttpStatus[code as AuthorizationErrorCodeType] ?? 500;
    },

    isAuthenticationError(code: string): boolean {
      const status = ErrorCodeToHttpStatus[code as AuthorizationErrorCodeType];
      return status === 401;
    },

    isRetryableError(code: string): boolean {
      return isDefaultRetryable(code as AuthorizationErrorCodeType);
    },

    getErrorCodes(): readonly AuthorizationErrorCodeType[] {
      return Object.values(AuthorizationErrorCode) as AuthorizationErrorCodeType[];
    },

    sanitizeContext(context: ErrorContext): Record<string, unknown> {
      return sanitizeValue(context) as Record<string, unknown>;
    },
  };
};

// ---------------------------------------------------------------------------
// Export Type Alias
// ---------------------------------------------------------------------------

/**
 * Type alias for the service interface (for barrel exports).
 */
export type AuthorizationErrorHandlerService = IAuthorizationErrorHandlerService;
