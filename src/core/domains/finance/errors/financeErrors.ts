/**
 * Finance-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 7.9
 */

import type { AppError } from '@core/utils';
import { validationError } from '@core/utils';

/** Transaction amount is zero or negative — must be greater than zero. */
export function financeInvalidAmount(): AppError {
  return validationError(
    'FINANCE_INVALID_AMOUNT',
    'Transaction amount must be greater than zero',
  );
}
