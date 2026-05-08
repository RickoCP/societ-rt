/**
 * CCTV-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 34.8
 */

import type { AppError } from '@core/utils';
import { notFoundError, businessError } from '@core/utils';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

/** CCTV camera not found for the given tenant and ID. */
export function cctvCameraNotFound(cameraId: string): AppError {
  return notFoundError(
    'CCTV_CAMERA_NOT_FOUND',
    `CCTV camera ${cameraId} not found`,
    {
      userMessage: 'Kamera CCTV tidak ditemukan.',
    },
  );
}

/** CCTV camera has gone offline (no stream data). */
export function cctvCameraOffline(cameraId: string): AppError {
  return businessError(
    'CCTV_CAMERA_OFFLINE',
    `CCTV camera ${cameraId} is offline`,
    {
      userMessage: 'Kamera CCTV sedang offline.',
      retryable: true,
    },
  );
}

/** CCTV stream is unavailable (cannot connect to RTSP source). */
export function cctvStreamUnavailable(cameraId: string): AppError {
  return businessError(
    'CCTV_STREAM_UNAVAILABLE',
    `CCTV stream for camera ${cameraId} is unavailable`,
    {
      userMessage: 'Stream CCTV tidak tersedia saat ini.',
      retryable: true,
    },
  );
}

/** CCTV storage limit exceeded for the tenant. */
export function cctvStorageLimitExceeded(tenantId: string): AppError {
  return businessError(
    'CCTV_STORAGE_LIMIT_EXCEEDED',
    `CCTV storage limit exceeded for tenant ${tenantId}`,
    {
      userMessage: 'Batas penyimpanan CCTV telah tercapai.',
      retryable: false,
    },
  );
}
