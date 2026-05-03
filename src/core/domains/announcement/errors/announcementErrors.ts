/**
 * Announcement-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 9.5
 */

import type { AppError } from '@core/utils';
import { validationError } from '@core/utils';

/** Attachment limit exceeded — max 5 files, each max 10 MB. */
export function announcementAttachmentLimitExceeded(): AppError {
  return validationError(
    'ANNOUNCEMENT_ATTACHMENT_LIMIT_EXCEEDED',
    'Attachment limit exceeded: maximum 5 files, each up to 10 MB',
  );
}
