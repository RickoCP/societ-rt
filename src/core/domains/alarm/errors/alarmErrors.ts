/**
 * Alarm-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 36.6, 36.9
 */

import type { AppError } from '@core/utils';
import { technicalError, notFoundError } from '@core/utils';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

/**
 * Siren device did not respond to an activation command within 5 seconds.
 * This is a technical/retryable error.
 */
export function alarmDeviceUnresponsive(deviceId: string): AppError {
  return technicalError(
    'ALARM_DEVICE_UNRESPONSIVE',
    `Alarm device ${deviceId} did not respond within 5 seconds`,
    {
      userMessage: 'Perangkat alarm tidak merespons. Silakan coba lagi.',
      retryable: true,
    },
  );
}

/**
 * The specified alarm zone does not exist within the tenant.
 */
export function alarmZoneNotFound(zone: string): AppError {
  return notFoundError(
    'ALARM_ZONE_NOT_FOUND',
    `Alarm zone "${zone}" does not exist`,
    {
      userMessage: 'Zona alarm tidak ditemukan.',
    },
  );
}
