/**
 * Emergency-contact-specific error factories. Each returns a typed AppError
 * with a stable, searchable code and a safe user-facing message.
 */

import type { AppError } from '@core/utils';
import { validationError, notFoundError } from '@core/utils';

/** The emergency contact does not exist within the tenant. */
export function emergencyContactNotFound(id: string): AppError {
  return notFoundError(
    'EMERGENCY_CONTACT_NOT_FOUND',
    `Emergency contact ${id} not found`,
    { userMessage: 'Kontak darurat tidak ditemukan.' },
  );
}

/** The label is missing/blank. */
export function emergencyContactInvalidLabel(): AppError {
  return validationError(
    'EMERGENCY_CONTACT_INVALID_LABEL',
    'Emergency contact label is required',
    { userMessage: 'Nama kontak wajib diisi.' },
  );
}

/** The phone number is missing or not a plausible dialable value. */
export function emergencyContactInvalidPhone(): AppError {
  return validationError(
    'EMERGENCY_CONTACT_INVALID_PHONE',
    'Emergency contact phone is invalid',
    {
      userMessage: 'Nomor telepon tidak valid.',
    },
  );
}
