/**
 * Incident-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 32.2, 32.6
 */

import type { AppError } from '@core/utils';
import { notFoundError, businessError } from '@core/utils';
import type { IncidentStatus } from '../entities';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

/** Incident not found for the given tenant and ID. */
export function incidentNotFound(incidentId: string): AppError {
  return notFoundError(
    'INCIDENT_NOT_FOUND',
    `Incident ${incidentId} not found`,
    {
      userMessage: 'Insiden tidak ditemukan.',
    },
  );
}

/** The requested status transition is not allowed. */
export function incidentInvalidTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): AppError {
  return businessError(
    'INCIDENT_INVALID_TRANSITION',
    `Cannot transition incident from "${from}" to "${to}"`,
    {
      userMessage: 'Perubahan status insiden tidak diizinkan.',
      retryable: false,
    },
  );
}

/** The incident has already been resolved and cannot accept further status changes (except close). */
export function incidentAlreadyResolved(incidentId: string): AppError {
  return businessError(
    'INCIDENT_ALREADY_RESOLVED',
    `Incident ${incidentId} is already resolved`,
    {
      userMessage: 'Insiden sudah diselesaikan.',
      retryable: false,
    },
  );
}

/** Evidence file limit exceeded for the incident. */
export function incidentEvidenceLimitExceeded(
  currentCount: number,
  maxCount: number,
): AppError {
  return businessError(
    'INCIDENT_EVIDENCE_LIMIT_EXCEEDED',
    `Evidence limit exceeded: ${currentCount} files already attached, max is ${maxCount}`,
    {
      userMessage: `Batas file bukti tercapai (maksimal ${maxCount} file).`,
      retryable: false,
    },
  );
}
