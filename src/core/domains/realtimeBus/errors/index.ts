/**
 * Realtime Bus error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 *
 * @see Requirements 40.1, 40.4
 */

import type { AppError } from '@core/utils';
import { authenticationError, authorizationError } from '@core/utils';

/** WebSocket authentication failed — invalid or expired JWT on handshake. */
export function wsAuthFailed(): AppError {
  return authenticationError(
    'WS_AUTH_FAILED',
    'WebSocket authentication failed — invalid or expired token on handshake',
  );
}

/** Client attempted to subscribe to a channel belonging to a different tenant. */
export function wsTenantMismatch(): AppError {
  return authorizationError(
    'WS_TENANT_MISMATCH',
    'Cannot subscribe to channels belonging to a different tenant',
  );
}
