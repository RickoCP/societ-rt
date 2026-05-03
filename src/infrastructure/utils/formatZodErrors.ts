/**
 * Zod Error Formatter — Converts Zod validation errors into field-level
 * error details suitable for API responses.
 *
 * Returns a flat object mapping field names to their first error message,
 * which aligns with the BFF error response contract:
 *
 * ```json
 * {
 *   "code": "COMMON_VALIDATION_FAILED",
 *   "fields": { "email": "Invalid email", "amount": "Required" }
 * }
 * ```
 *
 * @see Requirements 21.2
 */

import type { ZodError } from 'zod';

/**
 * Transform a ZodError into a flat record of field-level error messages.
 *
 * For nested paths (e.g. `address.street`), the field name is joined with dots.
 * Only the first error per field path is included to keep responses concise.
 */
export function formatZodErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '_root';

    // Keep only the first error per field
    if (!(fieldPath in fieldErrors)) {
      fieldErrors[fieldPath] = issue.message;
    }
  }

  return fieldErrors;
}
