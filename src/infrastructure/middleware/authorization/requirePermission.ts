/**
 * RequirePermission — Route Authorization Middleware
 *
 * Provides permission-based route authorization for Next.js App Router.
 *
 * This module implements:
 * 1. Higher-order function wrapper for route handlers (`withPermission`)
 * 2. Server-side permission check helper (`requirePermissions`)
 *
 * Authorization Flow:
 * 1. Extract JWT from request (cookies/headers)
 * 2. Validate JWT and extract claims
 * 3. Resolve AuthorizationContext via AuthorizationContextResolver
 * 4. Check if authContext.permissions contains ALL required permissions
 * 5. If any permission missing → return 403 AUTH_INSUFFICIENT_PERMISSION
 * 6. If all permissions present → continue to handler
 * 7. Log all denials with correlationId for audit
 *
 * SECURITY CONSIDERATIONS:
 * - Fail closed on unknown errors (INV-AUTH-002)
 * - Log all denials with correlationId
 * - Never expose internal error details to client
 * - All permission checks are case-sensitive
 *
 * @see Requirements 5 (AC 1-7)
 * @see Design Authorization Pipeline
 * @see 12-error-handling.md Steering
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import { getMissingPermissions, getPermissionsForRole } from '@core/domains/authorization/permissions/PermissionRegistry';
import { authInsufficientPermission } from '@core/domains/membership/errors';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import { container } from '@infrastructure/di/container';
import type { Logger } from '@infrastructure/logging/Logger';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { checkRateLimit } from '@infrastructure/utils/rateLimiter';
import type {
  RouteHandler,
  AuthorizedRouteHandler,
  RequirePermissionOptions,
  PermissionCheckLogContext,
  PermissionCheckResult,
  PublicRouteOptions,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEADER_CORRELATION_ID = 'x-correlation-id';

// ---------------------------------------------------------------------------
// Permission Check Helper
// ---------------------------------------------------------------------------

/**
 * Checks if the authorization context has all required permissions.
 *
 * This is the core permission validation logic used by both the middleware
 * wrapper and the standalone helper function.
 *
 * @param authContext - The resolved authorization context
 * @param requiredPermissions - Array of required permission codes
 * @returns PermissionCheckResult with allowed status and missing permissions
 *
 * @example
 * ```typescript
 * const result = checkPermissions(authContext, ['resident:read', 'finance:write']);
 * if (!result.allowed) {
 *   // Handle missing permissions: result.missingPermissions
 * }
 * ```
 */
function checkPermissions(
  authContext: AuthorizationContext,
  requiredPermissions: readonly string[],
): PermissionCheckResult {
  // Empty permissions array = no specific permissions required
  if (requiredPermissions.length === 0) {
    return { allowed: true, missingPermissions: [] };
  }

  // Use the PermissionRegistry to check for missing permissions
  const missingPermissions = getMissingPermissions(
    authContext.role,
    requiredPermissions,
  );

  return {
    allowed: missingPermissions.length === 0,
    missingPermissions,
  };
}

/**
 * Builds the log context for permission check results.
 */
function buildLogContext(
  correlationId: string,
  authContext: AuthorizationContext,
  requiredPermissions: readonly string[],
  missingPermissions: string[],
  route: string,
  method: string,
  decision: 'ALLOW' | 'DENY',
  reason?: string,
): PermissionCheckLogContext {
  // Convert Set to array for logging
  const presentPermissions = Array.from(authContext.permissions);

  return {
    correlationId,
    userId: authContext.userId,
    tenantId: authContext.tenantId,
    orgUnitId: authContext.orgUnitId,
    role: authContext.role,
    requiredPermissions,
    presentPermissions,
    missingPermissions,
    route,
    method,
    decision,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Server-Side Permission Check Helper
// ---------------------------------------------------------------------------

/**
 * Validates that an AuthorizationContext has all required permissions.
 *
 * This is a standalone helper function for server-side authorization checks.
 * Use this when you already have an AuthorizationContext and need to validate
 * specific permissions.
 *
 * @param authContext - The resolved authorization context
 * @param requiredPermissions - Array of required permission codes
 * @returns DomainResult<void> - ok(undefined) if all permissions present, fail otherwise
 *
 * @example
 * ```typescript
 * // In a use case or route handler
 * const result = requirePermissions(authContext, ['resident:write']);
 * if (!result.success) {
 *   return mapAppErrorToHttpResponse(result.error, correlationId);
 * }
 * // Proceed with operation
 * ```
 *
 * @see Requirements 5.3 — Access granted IFF all required permissions present
 * @see Requirements 5.4 — Returns AUTH_INSUFFICIENT_PERMISSION if missing
 */
export function requirePermissions(
  authContext: AuthorizationContext,
  requiredPermissions: readonly string[],
): DomainResult<void> {
  const checkResult = checkPermissions(authContext, requiredPermissions);

  if (!checkResult.allowed) {
    // Return fail with AUTH_INSUFFICIENT_PERMISSION error
    // Note: We don't include missing permissions in production to avoid
    // leaking information about what permissions exist
    return fail(authInsufficientPermission(
      process.env.NODE_ENV === 'development' ? checkResult.missingPermissions : undefined,
    ));
  }

  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Higher-Order Function Wrapper
// ---------------------------------------------------------------------------

/**
 * Creates a permission-protected route handler wrapper.
 *
 * This higher-order function wraps a route handler and enforces permission
 * checks before the handler is executed. It integrates with the authorization
 * pipeline to:
 *
 * 1. Resolve the AuthorizationContext from the request
 * 2. Validate all required permissions are present
 * 3. Log denials for audit purposes
 * 4. Pass the AuthorizationContext to the handler on success
 *
 * IMPORTANT: This wrapper expects the AuthorizationContext to be available
 * via headers set by the authentication middleware. If no context is found,
 * it returns a 401 Unauthorized response.
 *
 * @param options - Configuration options including required permissions
 * @param handler - The route handler to wrap
 * @returns A wrapped route handler that enforces permissions
 *
 * @example
 * ```typescript
 * // In a route handler file (e.g., app/api/residents/route.ts)
 * import { withPermission } from '@infrastructure/middleware/authorization';
 *
 * async function handleGetResidents(
 *   request: NextRequest,
 *   authContext: AuthorizationContext,
 * ): Promise<NextResponse> {
 *   // authContext is guaranteed to have required permissions
 *   const residents = await residentRepository.findByTenant(authContext.tenantId);
 *   return NextResponse.json({ data: residents });
 * }
 *
 * export const GET = withPermission(
 *   { permissions: ['resident:read'] },
 *   handleGetResidents,
 * );
 * ```
 *
 * @see Requirements 5.1 — Accept list of required permissions
 * @see Requirements 5.2 — Resolve authorization context
 * @see Requirements 5.3 — Access granted IFF all required permissions present
 * @see Requirements 5.5 — Decorator/middleware pattern
 * @see Requirements 5.6 — Log all denials
 * @see Requirements 5.7 — Fail closed on unknown errors
 */
export function withPermission<T = unknown>(
  options: RequirePermissionOptions,
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  const { permissions, logSuccess = false, allowSuspended = false } = options;

  return async (
    request: NextRequest,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse<T>> => {
    const correlationId =
      request.headers.get(HEADER_CORRELATION_ID) ?? generateCorrelationId();
    const route = request.nextUrl.pathname;
    const method = request.method;

    // Get logger from DI container
    let logger: Logger;
    try {
      logger = container.resolve<Logger>('logger');
    } catch {
      // Fallback to console if logger not available (shouldn't happen in production)
      logger = {
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
      };
    }

    try {
      // Step 1: Get AuthorizationContext from request
      // The context should be resolved by the authentication middleware and
      // stored in request headers or a request-scoped store
      const authContext = await resolveAuthContextFromRequest(request);

      if (!authContext) {
        // No authorization context available - authentication failed
        logger.warn('Authorization failed: No authorization context', {
          correlation_id: correlationId,
          route,
          method,
          reason: 'No authorization context found in request',
        });

        // Return type-safe response that matches expected T
        return NextResponse.json(
          {
            code: 'AUTH_TOKEN_INVALID',
            message: 'Unauthorized',
            correlationId,
          },
          { status: 401 },
        ) as NextResponse<T>;
      }

      // Step 1.5: Check membership status for non-safety routes
      // SECURITY: Suspended users can only access routes with allowSuspended: true
      // REVOKED memberships cannot access any routes (INV-AUTH-003)
      // @see Requirements 7.2, 7.3 — Safety-Critical Route Preservation
      const membershipStatus = authContext.membership?.status;
      
      if (membershipStatus === MembershipStatus.REVOKED) {
        // REVOKED memberships cannot access ANY routes, not even safety-critical ones
        logger.warn('Authorization denied: Membership revoked', {
          correlation_id: correlationId,
          user_id: authContext.userId,
          tenant_id: authContext.tenantId,
          membership_id: authContext.membershipId,
          membership_status: membershipStatus,
          route,
          method,
          decision: 'DENY',
          reason: 'Membership has been revoked',
        });

        return NextResponse.json(
          {
            code: 'AUTH_MEMBERSHIP_INACTIVE',
            message: 'Your membership is not active',
            correlationId,
          },
          { status: 403 },
        ) as NextResponse<T>;
      }

      if (membershipStatus === MembershipStatus.SUSPENDED && !allowSuspended) {
        // SUSPENDED users blocked from non-safety routes
        logger.warn('Authorization denied: Membership suspended', {
          correlation_id: correlationId,
          user_id: authContext.userId,
          tenant_id: authContext.tenantId,
          membership_id: authContext.membershipId,
          membership_status: membershipStatus,
          route,
          method,
          allow_suspended: allowSuspended,
          decision: 'DENY',
          reason: 'Membership suspended and route does not allow suspended access',
        });

        return NextResponse.json(
          {
            code: 'AUTH_MEMBERSHIP_SUSPENDED',
            message: 'Your membership has been suspended. You may only access emergency features.',
            correlationId,
          },
          { status: 403 },
        ) as NextResponse<T>;
      }

      // Step 2: Check permissions
      const checkResult = checkPermissions(authContext, permissions);

      // Step 3: Handle denial
      if (!checkResult.allowed) {
        const logContext = buildLogContext(
          correlationId,
          authContext,
          permissions,
          checkResult.missingPermissions,
          route,
          method,
          'DENY',
          'Missing required permissions',
        );

        // Log the denial (Requirements 5.6)
        logger.warn('Authorization denied: Insufficient permissions', {
          correlation_id: logContext.correlationId,
          user_id: logContext.userId,
          tenant_id: logContext.tenantId,
          org_unit_id: logContext.orgUnitId,
          role: logContext.role,
          required_permissions: logContext.requiredPermissions,
          missing_permissions: logContext.missingPermissions,
          route: logContext.route,
          method: logContext.method,
          decision: logContext.decision,
          reason: logContext.reason,
        });

        // Return 403 with AUTH_INSUFFICIENT_PERMISSION
        const error = authInsufficientPermission(
          process.env.NODE_ENV === 'development' ? checkResult.missingPermissions : undefined,
        );
        return mapAppErrorToHttpResponse(error, correlationId) as NextResponse<T>;
      }

      // Step 4: Log success if configured
      // For safety routes with suspended users, ALWAYS log for audit (Requirements 7.5, 7.7)
      const isSuspendedUserOnSafetyRoute = 
        membershipStatus === MembershipStatus.SUSPENDED && allowSuspended;
      
      if (logSuccess || isSuspendedUserOnSafetyRoute) {
        const logContext = buildLogContext(
          correlationId,
          authContext,
          permissions,
          [],
          route,
          method,
          'ALLOW',
        );

        logger.info('Authorization granted', {
          correlation_id: logContext.correlationId,
          user_id: logContext.userId,
          tenant_id: logContext.tenantId,
          role: logContext.role,
          route: logContext.route,
          method: logContext.method,
          decision: logContext.decision,
          // Requirements 7.5, 7.7: Include membershipSuspended in audit log for safety routes
          ...(isSuspendedUserOnSafetyRoute && {
            membershipSuspended: true,
            safety_route: true,
          }),
        });
      }

      // Step 5: Execute the handler with the authorization context
      return await handler(request, authContext, context);
    } catch (error) {
      // Step 6: Fail closed on unknown errors (INV-AUTH-002)
      logger.error('Authorization failed: Unexpected error', {
        correlation_id: correlationId,
        route,
        method,
        error_type: error instanceof Error ? error.name : 'Unknown',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return 500 without exposing internal details
      return NextResponse.json(
        {
          code: 'AUTH_CONTEXT_RESOLUTION_FAILED',
          message: 'An authentication error occurred. Please try again.',
          correlationId,
        },
        { status: 500 },
      ) as NextResponse<T>;
    }
  };
}

// ---------------------------------------------------------------------------
// Authorization Context Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the AuthorizationContext from the request.
 *
 * This function bridges the existing middleware architecture with the new
 * authorization context. It handles both:
 * - Legacy header-based context (x-user-id, x-tenant-id, x-user-role)
 * - New full AuthorizationContext (stored in x-authorization-context header)
 *
 * In production, the full AuthorizationContext should be resolved by the
 * authentication middleware and passed via a secure mechanism. For now,
 * we support the legacy header approach for backward compatibility.
 *
 * @param request - The incoming NextRequest
 * @returns AuthorizationContext if available, null otherwise
 */
async function resolveAuthContextFromRequest(
  request: NextRequest,
): Promise<AuthorizationContext | null> {
  // Try to get the full serialized AuthorizationContext from header
  const serializedContext = request.headers.get('x-authorization-context');

  if (serializedContext) {
    try {
      const parsed = JSON.parse(serializedContext);

      // Reconstruct the permissions Set from the array
      const permissions = new Set<string>(parsed.permissions ?? []);

      return {
        ...parsed,
        permissions,
      } as AuthorizationContext;
    } catch {
      // Invalid JSON in header - fall through to legacy approach
    }
  }

  // Legacy approach: Build partial context from individual headers
  // NOTE: This is for backward compatibility during migration.
  // The full AuthorizationContext includes additional fields like
  // membershipId, isAuthoritative, isTenantLevel, and membership entity.
  const userId = request.headers.get('x-user-id');
  const tenantId = request.headers.get('x-tenant-id');
  const role = request.headers.get('x-user-role');

  if (!userId || !tenantId || !role) {
    return null;
  }

  // Validate role is a valid MembershipRole
  if (!Object.values(MembershipRole).includes(role as MembershipRole)) {
    return null;
  }

  const permissions = getPermissionsForRole(role as MembershipRole);
  const orgUnitId = request.headers.get('x-org-unit-id');
  const tokenVersion = parseInt(request.headers.get('x-token-version') ?? '0', 10);
  const membershipId = request.headers.get('x-membership-id') ?? 'legacy-unknown';

  // Build a partial AuthorizationContext for backward compatibility
  // Note: Some fields are placeholders as they require full membership resolution
  return {
    userId,
    tenantId,
    membershipId,
    orgUnitId,
    role: role as MembershipRole,
    permissions,
    tokenVersion,
    isAuthoritative: true, // Assume active for legacy compatibility
    isTenantLevel: orgUnitId === null,
    membership: {
      // Placeholder membership entity - in production, this should be fully resolved
      id: membershipId,
      userId,
      tenantId,
      orgUnitId,
      role: role as MembershipRole,
      status: MembershipStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Auth-Only Route Wrapper (Requires JWT, No Specific Permission)
// ---------------------------------------------------------------------------

/**
 * Rate limit configuration for auth-only routes.
 * More permissive than login routes since users are already authenticated.
 */
const AUTH_ONLY_RATE_LIMIT_MAX = 60; // 60 requests
const AUTH_ONLY_RATE_LIMIT_WINDOW_MS = 60 * 1000; // per minute

/**
 * Get client IP address from request headers.
 * Prioritizes x-forwarded-for header (set by load balancers/proxies).
 *
 * @param request - The incoming NextRequest
 * @returns The client IP address or 'unknown'
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/**
 * Options for the auth-only route wrapper.
 */
export interface AuthOnlyRouteOptions {
  /**
   * Whether to log successful authentications.
   * Defaults to false (only failures are logged).
   */
  readonly logSuccess?: boolean;

  /**
   * Custom rate limit configuration.
   * Defaults to 60 requests per minute.
   */
  readonly rateLimit?: {
    readonly maxRequests?: number;
    readonly windowMs?: number;
  };
}

/**
 * Creates a route handler that requires valid JWT but no specific permission.
 *
 * This wrapper is designed for endpoints that need user authentication but don't
 * require specific permissions, such as:
 * - `/api/auth/logout` — User needs to be authenticated to log out
 * - `/api/auth/refresh` — User needs valid JWT to refresh tokens
 *
 * The wrapper:
 * 1. Applies rate limiting (60 requests/minute by default)
 * 2. Validates JWT and resolves AuthorizationContext from headers
 * 3. Returns 401 if JWT is invalid or missing
 * 4. Passes AuthorizationContext to handler on success
 * 5. Logs authentication failures for audit
 *
 * IMPORTANT: This wrapper does NOT bypass the middleware's JWT validation.
 * The auth middleware must still validate the JWT and resolve the context.
 * This wrapper provides explicit route marking and additional rate limiting.
 *
 * @param options - Configuration options (optional)
 * @param handler - The route handler to wrap
 * @returns A wrapped route handler that enforces authentication without permission checks
 *
 * @example
 * ```typescript
 * // In /api/auth/logout/route.ts
 * import { withAuthOnlyRoute } from '@infrastructure/middleware/authorization';
 *
 * async function handleLogout(
 *   request: NextRequest,
 *   authContext: AuthorizationContext,
 * ): Promise<NextResponse> {
 *   // User is guaranteed to be authenticated
 *   await logoutService.logout({ userId: authContext.userId });
 *   return NextResponse.json({ success: true });
 * }
 *
 * export const POST = withAuthOnlyRoute({}, handleLogout);
 * ```
 *
 * @see Requirements 17.3 — Auth routes requiring valid JWT but no specific permission
 * @see Requirements 17.4 — Auth routes SHALL perform rate limiting
 */
export function withAuthOnlyRoute<T = unknown>(
  options: AuthOnlyRouteOptions,
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T>;

/**
 * Creates a route handler that requires valid JWT but no specific permission.
 * Overload without options for simpler usage.
 *
 * @param handler - The route handler to wrap
 * @returns A wrapped route handler that enforces authentication without permission checks
 *
 * @example
 * ```typescript
 * export const POST = withAuthOnlyRoute(handleLogout);
 * ```
 */
export function withAuthOnlyRoute<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T>;

export function withAuthOnlyRoute<T = unknown>(
  optionsOrHandler: AuthOnlyRouteOptions | AuthorizedRouteHandler<T>,
  maybeHandler?: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  // Support both overloads: (options, handler) and (handler)
  const options: AuthOnlyRouteOptions =
    typeof optionsOrHandler === 'function' ? {} : optionsOrHandler;
  const handler: AuthorizedRouteHandler<T> =
    typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler!;

  const { logSuccess = false, rateLimit } = options;
  const maxRequests = rateLimit?.maxRequests ?? AUTH_ONLY_RATE_LIMIT_MAX;
  const windowMs = rateLimit?.windowMs ?? AUTH_ONLY_RATE_LIMIT_WINDOW_MS;

  return async (
    request: NextRequest,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse<T>> => {
    const correlationId =
      request.headers.get(HEADER_CORRELATION_ID) ?? generateCorrelationId();
    const route = request.nextUrl.pathname;
    const method = request.method;

    // Get logger from DI container
    let logger: Logger;
    try {
      logger = container.resolve<Logger>('logger');
    } catch {
      // Fallback to console if logger not available
      logger = {
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
      };
    }

    try {
      // Step 1: Apply rate limiting (Requirements 17.4)
      const ip = getClientIp(request);
      const rateLimitKey = `auth-only:${ip}`;
      const rateLimitResult = checkRateLimit(rateLimitKey, maxRequests, windowMs);

      if (!rateLimitResult.allowed) {
        logger.warn('Auth-only route rate limit exceeded', {
          correlation_id: correlationId,
          route,
          method,
          ip,
          reason: 'Rate limit exceeded',
        });

        return NextResponse.json(
          {
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            correlationId,
          },
          { status: 429 },
        ) as NextResponse<T>;
      }

      // Step 2: Get AuthorizationContext from request
      // The context should be resolved by the authentication middleware
      const authContext = await resolveAuthContextFromRequest(request);

      if (!authContext) {
        // No authorization context available - authentication failed
        logger.warn('Auth-only route: No authorization context', {
          correlation_id: correlationId,
          route,
          method,
          reason: 'No authorization context found in request',
        });

        return NextResponse.json(
          {
            code: 'AUTH_TOKEN_INVALID',
            message: 'Authentication required. Please login again.',
            correlationId,
          },
          { status: 401 },
        ) as NextResponse<T>;
      }

      // Step 3: Log success if configured
      if (logSuccess) {
        logger.info('Auth-only route: Authentication successful', {
          correlation_id: correlationId,
          user_id: authContext.userId,
          tenant_id: authContext.tenantId,
          route,
          method,
        });
      }

      // Step 4: Execute the handler with the authorization context
      // No permission check needed - just valid authentication
      return await handler(request, authContext, context);
    } catch (error) {
      // Step 5: Fail closed on unknown errors (INV-AUTH-002)
      logger.error('Auth-only route: Unexpected error', {
        correlation_id: correlationId,
        route,
        method,
        error_type: error instanceof Error ? error.name : 'Unknown',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return 500 without exposing internal details
      return NextResponse.json(
        {
          code: 'AUTH_UNEXPECTED_ERROR',
          message: 'An authentication error occurred. Please try again.',
          correlationId,
        },
        { status: 500 },
      ) as NextResponse<T>;
    }
  };
}

// ---------------------------------------------------------------------------
// Convenience Wrappers for Common Permission Patterns
// ---------------------------------------------------------------------------

/**
 * Creates a route handler that requires read access to residents.
 *
 * @example
 * export const GET = withResidentRead(handleGetResidents);
 */
export function withResidentRead<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  return withPermission({ permissions: ['resident:read'] }, handler);
}

/**
 * Creates a route handler that requires write access to residents.
 *
 * @example
 * export const POST = withResidentWrite(handleCreateResident);
 */
export function withResidentWrite<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  return withPermission({ permissions: ['resident:write'] }, handler);
}

/**
 * Creates a route handler that requires read access to finances.
 *
 * @example
 * export const GET = withFinanceRead(handleGetBalance);
 */
export function withFinanceRead<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  return withPermission({ permissions: ['finance:read'] }, handler);
}

/**
 * Creates a route handler that requires write access to finances.
 *
 * @example
 * export const POST = withFinanceWrite(handleRecordTransaction);
 */
export function withFinanceWrite<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  return withPermission({ permissions: ['finance:write'] }, handler);
}

// ---------------------------------------------------------------------------
// Safety-Critical Route Wrappers (allowSuspended: true)
// ---------------------------------------------------------------------------

/**
 * Creates a route handler for SAFETY-CRITICAL emergency creation.
 *
 * IMPORTANT: This wrapper uses `allowSuspended: true` because emergency
 * functionality must remain accessible even for users with suspended memberships.
 * This ensures residents can always trigger emergency alerts for safety.
 *
 * @example
 * export const POST = withEmergencyCreate(handleTriggerEmergency);
 *
 * @see Requirements 7.1, 7.2, 7.3 — Safety-Critical Route Preservation
 */
export function withEmergencyCreate<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  return withPermission(
    { permissions: ['emergency:create'], allowSuspended: true },
    handler,
  );
}

/**
 * Creates a route handler for SAFETY-CRITICAL emergency read operations.
 *
 * IMPORTANT: This wrapper uses `allowSuspended: true` because users must
 * be able to view emergency status even with suspended memberships.
 *
 * @example
 * export const GET = withEmergencyRead(handleGetEmergencyStatus);
 *
 * @see Requirements 7.1, 7.2, 7.3 — Safety-Critical Route Preservation
 */
export function withEmergencyRead<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  return withPermission(
    { permissions: ['emergency:read'], allowSuspended: true },
    handler,
  );
}

/**
 * Creates a route handler for emergency management operations (admin only).
 *
 * NOTE: This wrapper does NOT use `allowSuspended` because emergency management
 * (acknowledging, resolving, etc.) is an administrative action that requires
 * an active membership.
 *
 * @example
 * export const POST = withEmergencyManage(handleAcknowledgeEmergency);
 *
 * @see Requirements 7.1 — POST /emergency/[id]/acknowledge uses emergency:manage
 */
export function withEmergencyManage<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  return withPermission({ permissions: ['emergency:manage'] }, handler);
}

/**
 * Creates a route handler that requires tenant management permission.
 *
 * @example
 * export const PUT = withTenantManage(handleUpdateTenantSettings);
 */
export function withTenantManage<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  return withPermission({ permissions: ['tenant:manage'] }, handler);
}

/**
 * Creates a route handler that requires membership delegation permission.
 *
 * @example
 * export const POST = withMembershipDelegate(handleInviteMember);
 */
export function withMembershipDelegate<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): RouteHandler<T> {
  return withPermission({ permissions: ['membership:delegate'] }, handler);
}

// ---------------------------------------------------------------------------
// Public Route Wrapper (No JWT Required)
// ---------------------------------------------------------------------------

/**
 * Default configuration for public routes.
 */
const DEFAULT_PUBLIC_ROUTE_OPTIONS: Required<Omit<PublicRouteOptions, 'validateInput'>> = {
  rateLimit: {
    maxRequests: 10,
    windowMs: 60_000, // 1 minute
  },
  logSuccess: false,
};

/**
 * Creates a wrapper for fully public endpoints that don't require JWT authentication.
 *
 * This wrapper is intended for auth routes like login, register, forgot-password,
 * and reset-password. It provides:
 *
 * 1. Rate limiting (configurable, enabled by default)
 * 2. Input validation hook (optional)
 * 3. Correlation ID tracking for observability
 * 4. Secure error responses
 *
 * IMPORTANT: This wrapper does NOT perform any JWT validation or authorization
 * checks. Use only for endpoints that must be accessible without authentication.
 *
 * @param options - Configuration options for the public route
 * @param handler - The route handler to wrap
 * @returns A wrapped route handler with rate limiting and validation
 *
 * @example
 * ```typescript
 * // Basic usage - login route with default rate limiting
 * export const POST = withPublicRoute(
 *   {},
 *   handleLogin,
 * );
 *
 * // With custom rate limiting
 * export const POST = withPublicRoute(
 *   {
 *     rateLimit: {
 *       maxRequests: 5,    // More restrictive for password reset
 *       windowMs: 300_000, // 5 minutes
 *     },
 *   },
 *   handleForgotPassword,
 * );
 *
 * // With input validation
 * export const POST = withPublicRoute(
 *   {
 *     validateInput: async (request) => {
 *       const body = await request.json();
 *       if (!body.email) {
 *         return NextResponse.json(
 *           { code: 'VALIDATION_ERROR', message: 'Email is required' },
 *           { status: 400 },
 *         );
 *       }
 *       return null; // Proceed with handler
 *     },
 *   },
 *   handleRegister,
 * );
 * ```
 *
 * @see Requirements 17.2 — Auth_Routes SHALL bypass withPermission wrapper
 * @see Requirements 17.3 — Auth_Routes SHALL use dedicated wrapper for explicit marking
 * @see Requirements 17.4 — Auth_Routes SHALL still perform rate limiting and input validation
 */
export function withPublicRoute<T = unknown>(
  options: PublicRouteOptions,
  handler: RouteHandler<T>,
): RouteHandler<T> {
  const mergedOptions = {
    rateLimit: {
      ...DEFAULT_PUBLIC_ROUTE_OPTIONS.rateLimit,
      ...options.rateLimit,
    },
    logSuccess: options.logSuccess ?? DEFAULT_PUBLIC_ROUTE_OPTIONS.logSuccess,
    validateInput: options.validateInput,
  };

  return async (
    request: NextRequest,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse<T>> => {
    const correlationId =
      request.headers.get(HEADER_CORRELATION_ID) ?? generateCorrelationId();
    const route = request.nextUrl.pathname;
    const method = request.method;

    // Get logger from DI container
    let logger: Logger;
    try {
      logger = container.resolve<Logger>('logger');
    } catch {
      // Fallback to console if logger not available
      logger = {
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
      };
    }

    try {
      // Step 1: Apply rate limiting if enabled
      if (mergedOptions.rateLimit) {
        const ip = getClientIp(request);
        const rateLimitResult = checkRateLimit(
          ip,
          mergedOptions.rateLimit.maxRequests,
          mergedOptions.rateLimit.windowMs,
        );

        if (!rateLimitResult.allowed) {
          logger.warn('Public route rate limited', {
            correlation_id: correlationId,
            route,
            method,
            ip,
            remaining: rateLimitResult.remaining,
          });

          return NextResponse.json(
            {
              code: 'AUTH_RATE_LIMITED',
              message: 'Too many requests. Please try again later.',
              correlationId,
            },
            { status: 429 },
          ) as NextResponse<T>;
        }
      }

      // Step 2: Apply input validation if provided
      if (mergedOptions.validateInput) {
        const validationError = await mergedOptions.validateInput(request);
        if (validationError) {
          logger.warn('Public route input validation failed', {
            correlation_id: correlationId,
            route,
            method,
          });

          // Ensure correlationId is in the response
          if (!validationError.headers.has(HEADER_CORRELATION_ID)) {
            validationError.headers.set(HEADER_CORRELATION_ID, correlationId);
          }

          return validationError as NextResponse<T>;
        }
      }

      // Step 3: Log success if configured
      if (mergedOptions.logSuccess) {
        logger.info('Public route access granted', {
          correlation_id: correlationId,
          route,
          method,
        });
      }

      // Step 4: Execute the handler
      return await handler(request, context);
    } catch (error) {
      // Step 5: Handle unexpected errors securely
      logger.error('Public route unexpected error', {
        correlation_id: correlationId,
        route,
        method,
        error_type: error instanceof Error ? error.name : 'Unknown',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return 500 without exposing internal details
      return NextResponse.json(
        {
          code: 'COMMON_UNEXPECTED_ERROR',
          message: 'An unexpected error occurred. Please try again.',
          correlationId,
        },
        { status: 500 },
      ) as NextResponse<T>;
    }
  };
}
