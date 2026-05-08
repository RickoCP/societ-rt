/**
 * IoT-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 38.7, 38.10, 38.11, 38.13, 41.5, 41.8
 */

import type { AppError } from '@core/utils';
import {
  technicalError,
  authorizationError,
  businessError,
} from '@core/utils';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

/** Device command failed after retries. */
export function iotCommandFailed(cause?: unknown): AppError {
  return technicalError('IOT_COMMAND_FAILED', 'IoT device command failed', {
    userMessage: 'Gagal mengirim perintah ke perangkat. Silakan coba lagi.',
    retryable: true,
    cause,
  });
}

/** User does not have access to the requested device. */
export function iotDeviceAccessDenied(): AppError {
  return authorizationError(
    'IOT_DEVICE_ACCESS_DENIED',
    'User is not the Home_Owner of the household where the device is registered',
    {
      userMessage: 'Anda tidak memiliki akses ke perangkat ini.',
    },
  );
}

/** Tuya webhook signature validation failed. */
export function iotWebhookSignatureInvalid(): AppError {
  return authorizationError(
    'IOT_WEBHOOK_SIGNATURE_INVALID',
    'Webhook signature validation failed',
  );
}

/** Tuya Cloud API is unavailable (circuit breaker open). */
export function iotCloudUnavailable(): AppError {
  return technicalError(
    'IOT_CLOUD_UNAVAILABLE',
    'Tuya Cloud API is unavailable — circuit breaker is open',
    {
      userMessage:
        'Layanan IoT sedang tidak tersedia. Silakan coba beberapa saat lagi.',
      retryable: true,
    },
  );
}

/** Device is offline and cannot receive commands. */
export function iotDeviceOffline(deviceId: string): AppError {
  return businessError(
    'IOT_DEVICE_OFFLINE',
    `Device ${deviceId} is offline and cannot receive commands`,
    {
      userMessage: 'Perangkat sedang offline dan tidak dapat menerima perintah.',
      retryable: false,
    },
  );
}

/** Device pairing failed. */
export function iotPairingFailed(cause?: unknown): AppError {
  return technicalError(
    'IOT_PAIRING_FAILED',
    'Device pairing with Tuya Cloud failed',
    {
      userMessage: 'Gagal memasangkan perangkat. Silakan coba lagi.',
      retryable: true,
      cause,
    },
  );
}

/** Rate limit exceeded for IoT commands. */
export function iotRateLimitExceeded(deviceId: string): AppError {
  return businessError(
    'IOT_RATE_LIMIT_EXCEEDED',
    `Rate limit exceeded for device ${deviceId}: max 30 commands per minute`,
    {
      userMessage:
        'Terlalu banyak perintah dikirim. Silakan tunggu sebentar sebelum mencoba lagi.',
      retryable: true,
    },
  );
}
