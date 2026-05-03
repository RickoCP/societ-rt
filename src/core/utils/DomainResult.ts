/**
 * DomainResult<T> — Explicit success/error return type for all repository
 * and use case boundaries.
 *
 * Using a discriminated union instead of thrown exceptions makes every
 * success/error path explicit and easily testable.
 *
 * @see Requirements 22.3
 */

import type { AppError } from './AppError';

// ---------------------------------------------------------------------------
// Core type
// ---------------------------------------------------------------------------

export type DomainResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: AppError };

// ---------------------------------------------------------------------------
// Constructor helpers
// ---------------------------------------------------------------------------

/** Wrap a value in a successful DomainResult. */
export function ok<T>(data: T): DomainResult<T> {
  return { success: true, data };
}

/** Wrap an AppError in a failed DomainResult. */
export function fail<T = never>(error: AppError): DomainResult<T> {
  return { success: false, error };
}

// ---------------------------------------------------------------------------
// Unwrap helpers
// ---------------------------------------------------------------------------

/**
 * Extract the data from a successful result or throw if it failed.
 * Use sparingly — prefer pattern-matching on `success` in most cases.
 */
export function unwrapOrThrow<T>(result: DomainResult<T>): T {
  if (result.success) {
    return result.data;
  }
  throw new Error(
    `DomainResult unwrap failed: [${result.error.code}] ${result.error.message}`,
  );
}

/**
 * Extract the data from a successful result or return a fallback value.
 */
export function unwrapOr<T>(result: DomainResult<T>, fallback: T): T {
  return result.success ? result.data : fallback;
}

/**
 * Map the data inside a successful result, leaving errors untouched.
 */
export function mapResult<T, U>(
  result: DomainResult<T>,
  fn: (data: T) => U,
): DomainResult<U> {
  if (result.success) {
    return ok(fn(result.data));
  }
  return result;
}

/**
 * Type guard: returns true when the result is successful.
 */
export function isOk<T>(
  result: DomainResult<T>,
): result is { readonly success: true; readonly data: T } {
  return result.success;
}

/**
 * Type guard: returns true when the result is a failure.
 */
export function isFail<T>(
  result: DomainResult<T>,
): result is { readonly success: false; readonly error: AppError } {
  return !result.success;
}
