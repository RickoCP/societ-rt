/**
 * Error utilities module — centralized exports for error handling.
 *
 * @see Requirements 61 (Error Code Standardization)
 */

// Error Code Registry
export {
  // Category-specific error codes
  AUTH_ERROR_CODES,
  AUTHZ_ERROR_CODES,
  LEGACY_AUTHZ_ERROR_CODES,
  MEM_ERROR_CODES,
  TENANT_ERROR_CODES,
  VAL_ERROR_CODES,
  BIZ_ERROR_CODES,
  TECH_ERROR_CODES,
  NOT_FOUND_ERROR_CODES,
  UNEXPECTED_ERROR_CODES,
  ENTITLEMENT_ERROR_CODES,
  CONTEXT_ERROR_CODES,
  // Aggregated registry
  ERROR_CODES,
  // Types
  type ErrorCode,
  type ErrorCodeDefinition,
  // Lookup functions
  getErrorCodeDefinition,
  getHttpStatusForCode,
  isRetryableCode,
  getErrorTypeForCode,
  getI18nKeyForCode,
  isKnownErrorCode,
  getErrorCodesByType,
  getErrorCodesByHttpStatus,
} from './ErrorCodeRegistry';

// Error creation helpers
export {
  createErrorFromCode,
  createErrorFromDefinition,
  isErrorCode,
  isAnyErrorCode,
  type CreateErrorOptions,
} from './createErrorFromCode';
