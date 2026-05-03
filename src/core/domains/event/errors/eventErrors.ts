/**
 * Event-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 14.4
 */

import type { AppError } from '@core/utils';
import { businessError } from '@core/utils';

/** User has already submitted an RSVP for this event. */
export function eventDuplicateRsvp(): AppError {
  return businessError(
    'EVENT_DUPLICATE_RSVP',
    'User has already submitted an RSVP for this event',
  );
}
