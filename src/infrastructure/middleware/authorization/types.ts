/**
 * Authorization Middleware Types
 *
 * Types for the permission-based route authorization middleware.
 *
 * @see Requirements 5 (AC 1-7)
 * @see Requirements 17 (AC 1-7) — Auth Route Exclusion
 * @see Design Authorization Pipeline
 */

import type { NextRequest, NextResponse } from 'next/server';
import type { AuthorizationContext } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Route Handler Types
// ---------------------------------------------------------------------------

/**
 * Standard route handler function signature for Next.js App Router.
 */
export type RouteHandler<T = unknown> = (
  request: NextRequest,
  context?: { params?: Promise<Record<string, string>> },
) => Promise<NextResponse<T>>;

/**
 * Authorized route handler function signature.
 *
 * Receives the resolved AuthorizationContext as the third parameter,
 * allowing the handler to use the authorization context for business logic.
 */
export type AuthorizedRouteHandler<T = unknown> = (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
) => Promise<NextResponse<T>>;

// ---------------------------------------------------------------------------
// Middleware Configuration Types
// ---------------------------------------------------------------------------

/**
 * Options for the requirePermission middleware.
 */
export interface RequirePermissionOptions {
  /**
   * Array of permission codes required for the route.
   * All permissions must be present for access to be granted.
   *
   * @example ['resident:read', 'finance:write']
   */
  readonly permissions: readonly string[];

  /**
   * Optional flag to log successful permission checks.
   * Defaults to false (only denials are logged).
   */
  readonly logSuccess?: boolean;

  /**
   * Optional flag to allow SUSPENDED membership status to access this route.
   * Defaults to false (only ACTIVE memberships can access).
   *
   * IMPORTANT: This flag is intended for SAFETY-CRITICAL routes only,
   * such as emergency alerts, panic buttons, and emergency status endpoints.
   * A suspended user can still trigger emergencies but cannot access
   * normal application functionality.
   *
   * @example
   * // Safety-critical route - allow suspended users
   * withPermission({ permissions: ['emergency:create'], allowSuspended: true }, handler)
   *
   * // Normal route - suspended users blocked (default)
   * withPermission({ permissions: ['resident:read'] }, handler)
   *
   * @see Requirements 7.1, 7.2, 7.3 — Safety-Critical Route Preservation
   */
  readonly allowSuspended?: boolean;
}

/**
 * Options for the withPublicRoute wrapper.
 *
 * @see Requirements 17.2 — Auth_Routes SHALL bypass withPermission wrapper
 * @see Requirements 17.3 — Auth_Routes SHALL use dedicated wrapper
 * @see Requirements 17.4 — Auth_Routes SHALL still perform rate limiting and input validation
 */
export interface PublicRouteOptions {
  /**
   * Enable rate limiting for this endpoint.
   * Defaults to enabled with 10 requests per minute.
   */
  readonly rateLimit?: {
    /**
     * Maximum number of requests allowed in the window.
     * @default 10
     */
    readonly maxRequests?: number;
    /**
     * Time window in milliseconds.
     * @default 60000 (1 minute)
     */
    readonly windowMs?: number;
  };

  /**
   * Optional input validation function.
   * If provided, will be called before the handler.
   * Should return an error response if validation fails, or null to proceed.
   */
  readonly validateInput?: (
    request: NextRequest,
  ) => Promise<NextResponse | null>;

  /**
   * Whether to log successful requests.
   * Defaults to false.
   */
  readonly logSuccess?: boolean;
}

// ---------------------------------------------------------------------------
// Logging Context Types
// ---------------------------------------------------------------------------

/**
 * Context for logging permission check results.
 */
export interface PermissionCheckLogContext {
  readonly correlationId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly orgUnitId: string | null;
  readonly role: string;
  readonly requiredPermissions: readonly string[];
  readonly presentPermissions: readonly string[];
  readonly missingPermissions: readonly string[];
  readonly route: string;
  readonly method: string;
  readonly decision: 'ALLOW' | 'DENY';
  readonly reason?: string;
}

/**
 * Context for logging public route access.
 *
 * @see Requirements 17.4 — Auth_Routes SHALL still perform rate limiting
 */
export interface PublicRouteLogContext {
  readonly correlationId: string;
  readonly route: string;
  readonly method: string;
  readonly ip?: string;
  readonly rateLimited?: boolean;
  readonly validationFailed?: boolean;
}

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

/**
 * Result of a permission check operation.
 */
export interface PermissionCheckResult {
  readonly allowed: boolean;
  readonly missingPermissions: string[];
}
