/**
 * File storage domain errors.
 *
 * @see Requirements 26.2, 26.3
 */

import type { AppError } from '@core/utils';
import { validationError } from '@core/utils';

export function fileInvalidType(): AppError {
  return validationError(
    'FILE_INVALID_TYPE',
    'File MIME type is not allowed',
    { userMessage: 'Tipe file tidak diizinkan.' },
  );
}

export function fileSizeExceeded(): AppError {
  return validationError(
    'FILE_SIZE_EXCEEDED',
    'File size exceeds the maximum allowed limit',
    { userMessage: 'Ukuran file melebihi batas maksimum.' },
  );
}
