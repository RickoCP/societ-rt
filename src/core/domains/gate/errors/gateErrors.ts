/**
 * Gate-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 33.7, 33.9
 */

import type { AppError } from '@core/utils';
import { notFoundError, businessError } from '@core/utils';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

/** Gate not found for the given tenant and ID. */
export function gateNotFound(gateId: string): AppError {
  return notFoundError('GATE_NOT_FOUND', `Gate ${gateId} not found`, {
    userMessage: 'Gerbang tidak ditemukan.',
  });
}

/** A gate with the same device ID is already registered within the tenant. */
export function gateAlreadyRegistered(deviceId: string): AppError {
  return businessError(
    'GATE_ALREADY_REGISTERED',
    `Gate with device ${deviceId} is already registered`,
    {
      userMessage: 'Gerbang dengan perangkat ini sudah terdaftar.',
      retryable: false,
    },
  );
}

/** Gate sensor has gone offline (no heartbeat). */
export function gateSensorOffline(gateId: string): AppError {
  return businessError(
    'GATE_SENSOR_OFFLINE',
    `Gate sensor ${gateId} is offline`,
    {
      userMessage: 'Sensor gerbang sedang offline.',
      retryable: true,
    },
  );
}
