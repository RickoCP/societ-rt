export type { AppError, AppErrorType } from './AppError';
export {
  validationError,
  businessError,
  authenticationError,
  authorizationError,
  notFoundError,
  technicalError,
  unexpectedError,
} from './AppError';

export type { DomainResult } from './DomainResult';
export {
  ok,
  fail,
  unwrapOrThrow,
  unwrapOr,
  mapResult,
  isOk,
  isFail,
} from './DomainResult';

// Error Code Registry
export {
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
  ERROR_CODES,
  type ErrorCode,
  type ErrorCodeDefinition,
  getErrorCodeDefinition,
  getHttpStatusForCode,
  isRetryableCode,
  getErrorTypeForCode,
  getI18nKeyForCode,
  isKnownErrorCode,
  getErrorCodesByType,
  getErrorCodesByHttpStatus,
  // Error creation helpers
  createErrorFromCode,
  createErrorFromDefinition,
  isErrorCode,
  isAnyErrorCode,
  type CreateErrorOptions,
} from './errors';
