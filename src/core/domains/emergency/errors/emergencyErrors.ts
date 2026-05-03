/**
 * Emergency-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 10.1, 10.3
 */

import type { AppError } from '@core/utils';
import { notFoundError } from '@core/utils';

/** Emergency alert not found. */
export function emergencyAlertNotFound(): AppError {
  return notFoundError(
    'EMERGENCY_ALERT_NOT_FOUND',
    'Emergency alert not found',
  );
}
