/**
 * Door-monitoring-specific error factory functions.
 *
 * Each returns a typed AppError with a stable, searchable code. User-facing
 * messages are safe (i18n-friendly Indonesian text) and never leak internal
 * detail.
 */

import type { AppError } from '@core/utils';
import {
  validationError,
  notFoundError,
  businessError,
} from '@core/utils';

/** The household has no door-sensor configuration yet. */
export function doorSensorConfigNotFound(householdId: string): AppError {
  return notFoundError(
    'DOOR_SENSOR_CONFIG_NOT_FOUND',
    `Door sensor config not found for household ${householdId}`,
    { userMessage: 'Konfigurasi sensor pintu tidak ditemukan.' },
  );
}

/** A door sensor is already registered for this household. */
export function doorSensorAlreadyRegistered(householdId: string): AppError {
  return businessError(
    'DOOR_SENSOR_ALREADY_REGISTERED',
    `A door sensor is already registered for household ${householdId}`,
    {
      userMessage: 'Sensor pintu untuk rumah ini sudah terdaftar.',
    },
  );
}

/** The installation request does not exist. */
export function doorInstallationRequestNotFound(id: string): AppError {
  return notFoundError(
    'DOOR_INSTALLATION_REQUEST_NOT_FOUND',
    `Door installation request ${id} not found`,
    { userMessage: 'Permintaan pemasangan tidak ditemukan.' },
  );
}

/** The monitoring window HH:mm values are invalid. */
export function invalidMonitoringWindow(detail: string): AppError {
  return validationError(
    'DOOR_INVALID_MONITORING_WINDOW',
    `Invalid monitoring window: ${detail}`,
    {
      userMessage:
        'Jam monitoring tidak valid. Gunakan format HH:mm (contoh 22:00).',
    },
  );
}

/** No siren zone configured, so an in-window open cannot trigger a siren. */
export function doorSirenZoneNotConfigured(householdId: string): AppError {
  return businessError(
    'DOOR_SIREN_ZONE_NOT_CONFIGURED',
    `No siren zone configured for household ${householdId}`,
    {
      userMessage: 'Zona sirine belum dikonfigurasi untuk rumah ini.',
    },
  );
}
