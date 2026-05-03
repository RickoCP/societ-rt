/**
 * Billing-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 16.2, 16.6, 29.1
 */

import type { AppError } from '@core/utils';
import { businessError } from '@core/utils';

/** Tenant has reached the maximum number of users allowed by their plan. */
export function billingUserLimitExceeded(): AppError {
  return businessError(
    'BILLING_USER_LIMIT_EXCEEDED',
    'Tenant has reached the maximum number of users allowed by the current subscription plan',
  );
}
