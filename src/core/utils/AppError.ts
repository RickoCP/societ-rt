/**
 * AppError — Standard error model for the entire application.
 *
 * Every error MUST be classified into one of seven types with a stable,
 * searchable error code. The `message` field is for internal/dev context;
 * `userMessage` is optional and safe for end-user display.
 *
 * @see Requirements 22.1, 22.2, 22.4
 */

export type AppErrorType =
  | 'validation'
  | 'business'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'technical'
  | 'unexpected';

export interface AppError {
  /** Classification of the error */
  readonly type: AppErrorType;
  /** Stable, searchable error code (e.g. AUTH_TOKEN_EXPIRED) */
  readonly code: string;
  /** Internal/developer-facing message — never expose to UI */
  readonly message: string;
  /** Optional user-safe message (i18n key or plain text) */
  readonly userMessage?: string;
  /** Whether the operation can be retried */
  readonly retryable?: boolean;
  /** Original cause — never leak to the client */
  readonly cause?: unknown;
}

// ---------------------------------------------------------------------------
// Factory helpers — keep error creation concise and consistent
// ---------------------------------------------------------------------------

export function validationError(
  code: string,
  message: string,
  options?: Pick<AppError, 'userMessage' | 'retryable' | 'cause'>,
): AppError {
  return { type: 'validation', code, message, retryable: false, ...options };
}

export function businessError(
  code: string,
  message: string,
  options?: Pick<AppError, 'userMessage' | 'retryable' | 'cause'>,
): AppError {
  return { type: 'business', code, message, retryable: false, ...options };
}

export function authenticationError(
  code: string,
  message: string,
  options?: Pick<AppError, 'userMessage' | 'retryable' | 'cause'>,
): AppError {
  return {
    type: 'authentication',
    code,
    message,
    retryable: false,
    ...options,
  };
}

export function authorizationError(
  code: string,
  message: string,
  options?: Pick<AppError, 'userMessage' | 'retryable' | 'cause'>,
): AppError {
  return {
    type: 'authorization',
    code,
    message,
    retryable: false,
    ...options,
  };
}

export function notFoundError(
  code: string,
  message: string,
  options?: Pick<AppError, 'userMessage' | 'retryable' | 'cause'>,
): AppError {
  return { type: 'not_found', code, message, retryable: false, ...options };
}

export function technicalError(
  code: string,
  message: string,
  options?: Pick<AppError, 'userMessage' | 'retryable' | 'cause'>,
): AppError {
  return { type: 'technical', code, message, retryable: true, ...options };
}

export function unexpectedError(
  code: string,
  message: string,
  options?: Pick<AppError, 'userMessage' | 'retryable' | 'cause'>,
): AppError {
  return { type: 'unexpected', code, message, retryable: false, ...options };
}
