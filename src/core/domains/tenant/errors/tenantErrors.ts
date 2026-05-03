/**
 * Tenant-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 1.3, 1.4, 1.5, 2.1, 2.5
 */

import type { AppError } from '@core/utils';
import { authorizationError, businessError, notFoundError } from '@core/utils';

/** A tenant with the same subdomain or RT/RW number in the same region already exists. */
export function tenantDuplicate(): AppError {
  return businessError(
    'TENANT_DUPLICATE',
    'A tenant with this subdomain or RT/RW number in this region already exists',
  );
}

/** The tenant is currently suspended and cannot process requests. */
export function tenantSuspended(): AppError {
  return authorizationError(
    'TENANT_SUSPENDED',
    'Tenant is suspended — all API access is blocked',
  );
}

/** The user does not have permission to access this tenant's resources. */
export function tenantAccessDenied(): AppError {
  return authorizationError(
    'TENANT_ACCESS_DENIED',
    'Access to this tenant is denied',
  );
}

/** No tenant was found for the given identifier. */
export function tenantNotFound(): AppError {
  return notFoundError(
    'TENANT_NOT_FOUND',
    'Tenant not found',
  );
}

/** The request is missing a valid tenant context (e.g. no tenant resolved from JWT). */
export function tenantContextMissing(): AppError {
  return authorizationError(
    'TENANT_CONTEXT_MISSING',
    'Request is missing a valid tenant context',
  );
}
