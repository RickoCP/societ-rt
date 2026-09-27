/**
 * Error Mapping Utility — Maps AppError to safe HTTP responses.
 *
 * This module is the single point of translation between domain errors
 * and HTTP responses. It ensures:
 *
 * - Correct HTTP status codes per error type
 * - Sanitized response bodies (no stack traces, SQL, internal URLs, class names)
 * - Consistent response shape: { code, message, correlationId }
 * - User-safe messages via `userMessage` fallback
 *
 * @see Requirements 21.5, 22.1, 22.2, 22.4
 */

import { NextResponse } from 'next/server';
import type { AppError, AppErrorType } from '@core/utils/AppError';

// ---------------------------------------------------------------------------
// HTTP status mapping
// ---------------------------------------------------------------------------

const HTTP_STATUS_MAP: Record<AppErrorType, number> = {
  validation: 400,
  authentication: 401,
  authorization: 403,
  not_found: 404,
  business: 409,
  technical: 500,
  unexpected: 500,
};

// ---------------------------------------------------------------------------
// Generic safe messages per error type (never expose internal details)
// ---------------------------------------------------------------------------

const SAFE_MESSAGE_MAP: Record<AppErrorType, string> = {
  validation: 'The request contains invalid data.',
  authentication: 'Authentication is required.',
  authorization: 'You do not have permission to perform this action.',
  not_found: 'The requested resource was not found.',
  business: 'The operation could not be completed due to a business rule.',
  technical: 'A technical error occurred. Please try again later.',
  unexpected: 'An unexpected error occurred. Please try again later.',
};

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface ErrorResponseBody {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly fields?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map an AppError to a NextResponse with the correct HTTP status and a
 * sanitized JSON body.
 *
 * The `message` field uses `userMessage` when available, otherwise falls
 * back to a generic safe message for the error type. Internal details
 * (stack traces, SQL, class names, internal URLs) are never included.
 */
export function mapAppErrorToHttpResponse(
  error: AppError,
  correlationId: string,
): NextResponse<ErrorResponseBody> {
  const status = HTTP_STATUS_MAP[error.type];
  const message = error.userMessage ?? SAFE_MESSAGE_MAP[error.type];

  const body: ErrorResponseBody = {
    code: error.code,
    message,
    correlationId,
  };

  return NextResponse.json(body, { status });
}
