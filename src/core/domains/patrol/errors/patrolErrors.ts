/**
 * Patrol-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 35.1, 35.3, 35.4, 35.7
 */

import type { AppError } from '@core/utils';
import { notFoundError, businessError } from '@core/utils';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

/** Guard already has an active patrol session. */
export function patrolAlreadyActive(guardId: string): AppError {
  return businessError(
    'PATROL_ALREADY_ACTIVE',
    `Guard ${guardId} already has an active patrol session`,
    {
      userMessage: 'Anda sudah memiliki sesi patroli yang sedang aktif.',
      retryable: false,
    },
  );
}

/** GPS position is more than 50 meters from the checkpoint. */
export function patrolCheckpointTooFar(
  checkpointIndex: number,
  distance: number,
): AppError {
  return businessError(
    'PATROL_CHECKPOINT_TOO_FAR',
    `Position is ${distance}m from checkpoint ${checkpointIndex}, exceeds 50m threshold`,
    {
      userMessage:
        'Posisi Anda terlalu jauh dari checkpoint. Dekati checkpoint untuk melakukan check-in.',
      retryable: true,
    },
  );
}

/** Patrol session not found for the given ID. */
export function patrolSessionNotFound(sessionId: string): AppError {
  return notFoundError(
    'PATROL_SESSION_NOT_FOUND',
    `Patrol session ${sessionId} not found`,
    {
      userMessage: 'Sesi patroli tidak ditemukan.',
    },
  );
}

/** Patrol route not found for the given ID. */
export function patrolRouteNotFound(routeId: string): AppError {
  return notFoundError(
    'PATROL_ROUTE_NOT_FOUND',
    `Patrol route ${routeId} not found`,
    {
      userMessage: 'Rute patroli tidak ditemukan.',
    },
  );
}
