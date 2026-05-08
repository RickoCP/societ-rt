/**
 * Notification domain errors.
 *
 * @see Requirements 43.7, 43.8
 */

import type { AppError } from '@core/utils';
import { technicalError, businessError } from '@core/utils';

/**
 * Error when a notification channel fails to deliver.
 * Triggers channel fallback logic.
 */
export function notificationChannelFailed(
  channel: string,
  reason?: string,
): AppError {
  return technicalError(
    'NOTIFICATION_CHANNEL_FAILED',
    `Notification delivery failed on channel: ${channel}${reason ? ` — ${reason}` : ''}`,
    {
      userMessage: 'Pengiriman notifikasi gagal pada salah satu kanal.',
      retryable: true,
    },
  );
}

/**
 * Error when rate limit is exceeded for non-critical notifications.
 */
export function notificationRateLimitExceeded(userId: string): AppError {
  return businessError(
    'NOTIFICATION_RATE_LIMIT_EXCEEDED',
    `Non-critical notification rate limit exceeded for user: ${userId}`,
    {
      userMessage: 'Batas pengiriman notifikasi per jam telah tercapai.',
      retryable: false,
    },
  );
}

/**
 * Error when notification is not found (e.g. for acknowledgment).
 */
export function notificationNotFound(notificationId: string): AppError {
  return businessError(
    'NOTIFICATION_NOT_FOUND',
    `Notification not found: ${notificationId}`,
    {
      userMessage: 'Notifikasi tidak ditemukan.',
      retryable: false,
    },
  );
}

/**
 * Error when notification has already been acknowledged.
 */
export function notificationAlreadyAcknowledged(
  notificationId: string,
): AppError {
  return businessError(
    'NOTIFICATION_ALREADY_ACKNOWLEDGED',
    `Notification already acknowledged: ${notificationId}`,
    {
      userMessage: 'Notifikasi sudah dikonfirmasi sebelumnya.',
      retryable: false,
    },
  );
}
