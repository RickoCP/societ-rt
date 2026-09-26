/**
 * Factory functions for creating AppError instances from ErrorCodeRegistry.
 *
 * These helpers integrate the ErrorCodeRegistry with the existing AppError
 * factory functions, ensuring consistency between error codes and error objects.
 *
 * @see Requirements 61 (Error Code Standardization)
 */

import type { AppError } from '../AppError';
import {
  validationError,
  businessError,
  authenticationError,
  authorizationError,
  notFoundError,
  technicalError,
  unexpectedError,
} from '../AppError';
import {
  getErrorCodeDefinition,
  type ErrorCodeDefinition,
} from './ErrorCodeRegistry';

/**
 * Options for creating an error from a registry code.
 */
export interface CreateErrorOptions {
  /** Override the default message from the registry */
  message?: string;
  /** User-safe message (i18n key or plain text) */
  userMessage?: string;
  /** Original cause of the error */
  cause?: unknown;
  /** Override retryable flag from registry */
  retryable?: boolean;
}

/**
 * Create an AppError from a registered error code.
 *
 * Uses the ErrorCodeRegistry to determine the error type and default message.
 * Allows overriding message and adding cause for context.
 *
 * @example
 * ```ts
 * const error = createErrorFromCode('AUTH_TOKEN_INVALID');
 * const errorWithContext = createErrorFromCode('AUTHZ_NO_MEMBERSHIP', {
 *   message: 'User has no membership in tenant abc-123',
 *   cause: originalError,
 * });
 * ```
 */
export function createErrorFromCode(
  code: string,
  options?: CreateErrorOptions,
): AppError {
  const definition = getErrorCodeDefinition(code);

  if (!definition) {
    // Unknown code - create unexpected error (fail closed)
    console.warn(
      `[createErrorFromCode] Unknown error code: ${code}. Creating unexpected error.`,
    );
    return unexpectedError(code, options?.message ?? `Unknown error: ${code}`, {
      userMessage: options?.userMessage,
      cause: options?.cause,
    });
  }

  const message = options?.message ?? definition.description;
  const userMessage = options?.userMessage ?? definition.i18nKey;
  const retryable = options?.retryable ?? definition.retryable;

  const errorOptions = {
    userMessage,
    cause: options?.cause,
    retryable,
  };

  switch (definition.type) {
    case 'validation':
      return validationError(code, message, errorOptions);
    case 'business':
      return businessError(code, message, errorOptions);
    case 'authentication':
      return authenticationError(code, message, errorOptions);
    case 'authorization':
      return authorizationError(code, message, errorOptions);
    case 'not_found':
      return notFoundError(code, message, errorOptions);
    case 'technical':
      return technicalError(code, message, errorOptions);
    case 'unexpected':
    default:
      return unexpectedError(code, message, errorOptions);
  }
}

/**
 * Create an AppError directly from an ErrorCodeDefinition.
 *
 * Useful when you already have the definition and want to avoid
 * the lookup overhead.
 */
export function createErrorFromDefinition(
  definition: ErrorCodeDefinition,
  options?: CreateErrorOptions,
): AppError {
  const message = options?.message ?? definition.description;
  const userMessage = options?.userMessage ?? definition.i18nKey;
  const retryable = options?.retryable ?? definition.retryable;

  const errorOptions = {
    userMessage,
    cause: options?.cause,
    retryable,
  };

  switch (definition.type) {
    case 'validation':
      return validationError(definition.code, message, errorOptions);
    case 'business':
      return businessError(definition.code, message, errorOptions);
    case 'authentication':
      return authenticationError(definition.code, message, errorOptions);
    case 'authorization':
      return authorizationError(definition.code, message, errorOptions);
    case 'not_found':
      return notFoundError(definition.code, message, errorOptions);
    case 'technical':
      return technicalError(definition.code, message, errorOptions);
    case 'unexpected':
    default:
      return unexpectedError(definition.code, message, errorOptions);
  }
}

/**
 * Type guard to check if an AppError matches a specific error code.
 */
export function isErrorCode(error: AppError, code: string): boolean {
  return error.code === code;
}

/**
 * Type guard to check if an AppError matches any of the given error codes.
 */
export function isAnyErrorCode(error: AppError, codes: string[]): boolean {
  return codes.includes(error.code);
}
