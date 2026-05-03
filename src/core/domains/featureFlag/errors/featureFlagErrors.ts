/**
 * Feature flag-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 19.2, 19.3
 */

import type { AppError } from '@core/utils';
import { authorizationError } from '@core/utils';

/** Feature is disabled for the tenant's current subscription plan. */
export function featureDisabled(): AppError {
  return authorizationError(
    'FEATURE_DISABLED',
    'This feature is not available on the current subscription plan',
  );
}
