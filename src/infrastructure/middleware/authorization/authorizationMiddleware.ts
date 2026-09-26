/**
 * Authorization Middleware — Resolves AuthorizationContext for protected routes.
 *
 * This middleware intercepts all requests to protected routes and:
 * 1. Extracts JWT from Authorization header or cookie
 * 2. Validates JWT structure, signature, and expiration
 * 3. Invokes AuthorizationContextResolver.resolve() to build full context
 * 4. Serializes context to request headers for route handler consumption
 * 5. Logs all resolution attempts with correlationId
 *
 * **Security Constraints:**
 * - Full permission set is NOT serialized to headers
 * - Permissions are derived from role at route level via PermissionRegistry
 * - Fails closed on unknown/invalid states (INV-AUTH-002)
 *
 * **Header Serialization:**
 * - x-authorization-context: JSON (excluding permissions)
 * - x-user-id: string
 * - x-tenant-id: string
 * - x-membership-id: string (server-resolved)
 * - x-org-unit-id: string | null
 * - x-user-role: MembershipRole
 * - x-token-version: number
 *
 * @see Requirements 1.1–1.7
 * @see Design: Middleware AuthorizationContext Resolution
 * @see INV-AUTH-001, INV-AUTH-002
 */

import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import type { DomainResult, AppError } from '@core/utils';
import { isFail } from '@core/utils';
import type {
  AuthorizationContext,
  AuthorizationContextResult,
  PartialJWTClaims,
} from '@core/domains/authorization/types';
import type { IAuthorizationContextResolver } from '@core/domains/authorization/services/AuthorizationContextResolver';
import type { TokenVersionService } from '@infrastructure/auth/TokenVersionService';
import type { Logger, LogContext } from '@infrastructure/logging/Logger';
import type { ITokenValidationLogger, TokenValidationContext } from '@infrastructure/logging/TokenValidationLogger';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cookie name for auth token */
const AUTH_COOKIE_NAME = 'societ_rt_auth_token';

/** Header name for correlation ID */
const HEADER_CORRELATION_ID = 'x-correlation-id';

/** Header prefix for authorization context */
const HEADER_PREFIX = 'x-';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the AuthorizationMiddleware.
 */
export interface AuthorizationMiddlewareConfig {
  /**
   * Routes that bypass authorization (auth routes).
   * These routes do not require authentication.
   */
  readonly bypassRoutes: readonly RegExp[];

  /**
   * Whether to log successful authorization resolutions.
   * Default: false (only log failures).
   */
  readonly logSuccess: boolean;

  /**
   * Header prefix for context serialization.
   * Default: 'x-'
   */
  readonly headerPrefix: string;
}

/**
 * Default configuration for the middleware.
 */
export const DEFAULT_AUTHORIZATION_MIDDLEWARE_CONFIG: AuthorizationMiddlewareConfig = {
  bypassRoutes: [
    /^\/api\/auth\/login$/,
    /^\/api\/auth\/logout$/,
    /^\/api\/auth\/register$/,
    /^\/api\/auth\/refresh$/,
    /^\/api\/auth\/forgot-password$/,
    /^\/api\/auth\/reset-password$/,
    /^\/api\/health$/,
    /^\/api\/tenants\/resolve$/,
    /^\/login$/,
    /^\/register$/,
    /^\/_next/,
    /^\/favicon\.ico$/,
  ],
  logSuccess: false,
  headerPrefix: HEADER_PREFIX,
};

/**
 * Authorization resolution log entry.
 */
export interface AuthorizationResolutionLogEntry {
  readonly correlationId: string;
  readonly timestamp: Date;
  readonly userId: string | null;
  readonly tenantId: string | null;
  readonly endpoint: string;
  readonly method: string;
  readonly result: 'SUCCESS' | 'FAILURE';
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly durationMs: number;
}

/**
 * Error codes for authorization failures.
 */
export type AuthErrorCode =
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_VERSION_MISMATCH'
  | 'AUTH_NO_MEMBERSHIP'
  | 'AUTH_MEMBERSHIP_INACTIVE'
  | 'AUTH_USER_QUARANTINED'
  | 'AUTH_CONTEXT_RESOLUTION_FAILED';

/**
 * HTTP status mapping for authorization error codes.
 */
export const AUTH_ERROR_HTTP_STATUS: Record<AuthErrorCode, number> = {
  AUTH_TOKEN_INVALID: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_TOKEN_VERSION_MISMATCH: 401,
  AUTH_NO_MEMBERSHIP: 403,
  AUTH_MEMBERSHIP_INACTIVE: 403,
  AUTH_USER_QUARANTINED: 403,
  AUTH_CONTEXT_RESOLUTION_FAILED: 500,
};

/**
 * User-facing error messages (Indonesian).
 */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  AUTH_TOKEN_INVALID: 'Sesi tidak valid. Silakan login kembali.',
  AUTH_TOKEN_EXPIRED: 'Sesi telah berakhir. Silakan login kembali.',
  AUTH_TOKEN_VERSION_MISMATCH: 'Sesi tidak valid. Silakan login kembali.',
  AUTH_NO_MEMBERSHIP: 'Anda tidak memiliki akses ke tenant ini.',
  AUTH_MEMBERSHIP_INACTIVE: 'Keanggotaan Anda tidak aktif.',
  AUTH_USER_QUARANTINED: 'Akun Anda sedang ditinjau. Hubungi administrator.',
  AUTH_CONTEXT_RESOLUTION_FAILED: 'Terjadi kesalahan autentikasi. Coba lagi.',
};

/**
 * Authorization error response structure.
 */
export interface AuthErrorResponse {
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly correlationId: string;
}

/**
 * Serialized authorization context for headers.
 * Excludes the full permissions set for security (INV-AUTH-001).
 */
export interface SerializedAuthorizationContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly membershipId: string;
  readonly orgUnitId: string | null;
  readonly role: string;
  readonly tokenVersion: number;
  readonly isAuthoritative: boolean;
  readonly isTenantLevel: boolean;
}

/**
 * Result of JWT extraction and validation.
 */
export interface JwtExtractionResult {
  readonly success: boolean;
  readonly claims?: PartialJWTClaims;
  readonly errorCode?: AuthErrorCode;
  readonly errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * AuthorizationMiddleware interface.
 *
 * Processes requests through the authorization pipeline:
 * 1. Check if route is bypassed (auth routes)
 * 2. Extract JWT from Authorization header or cookie
 * 3. Validate JWT structure and signature
 * 4. Invoke AuthorizationContextResolver.resolve()
 * 5. Serialize context to request headers
 * 6. Log resolution attempt with correlationId
 */
export interface IAuthorizationMiddleware {
  /**
   * Process request through authorization pipeline.
   *
   * @param request - The incoming Next.js request
   * @returns NextResponse with authorization headers or error response
   */
  handle(request: NextRequest): Promise<NextResponse>;

  /**
   * Check if a route should bypass authorization.
   *
   * @param pathname - The request pathname
   * @returns true if route should bypass authorization
   */
  shouldBypass(pathname: string): boolean;

  /**
   * Extract and validate JWT from request.
   *
   * @param request - The incoming Next.js request
   * @returns JWT extraction result with claims or error
   */
  extractAndValidateJwt(request: NextRequest): Promise<JwtExtractionResult>;

  /**
   * Serialize AuthorizationContext to request headers.
   *
   * @param context - The resolved authorization context
   * @param headers - The request headers to modify
   * @returns The modified headers
   */
  serializeContextToHeaders(
    context: AuthorizationContext,
    headers: Headers,
  ): Headers;

  /**
   * Create an error response for authorization failure.
   *
   * @param errorCode - The authorization error code
   * @param correlationId - The request correlation ID
   * @returns NextResponse with error details
   */
  createErrorResponse(
    errorCode: AuthErrorCode,
    correlationId: string,
  ): NextResponse;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an AuthorizationMiddleware instance.
 *
 * @param config - Middleware configuration
 * @param authorizationContextResolver - Service for resolving authorization context
 * @param tokenVersionService - Service for token version validation
 * @param logger - Logger instance
 * @param tokenValidationLogger - Token validation audit logger
 * @param jwtSecret - JWT secret key for verification
 * @returns An implementation of IAuthorizationMiddleware
 */
export function AuthorizationMiddlewareImpl({
  config = DEFAULT_AUTHORIZATION_MIDDLEWARE_CONFIG,
  authorizationContextResolver,
  tokenVersionService,
  logger,
  tokenValidationLogger,
  jwtSecret,
}: {
  config?: AuthorizationMiddlewareConfig;
  authorizationContextResolver: IAuthorizationContextResolver;
  tokenVersionService: TokenVersionService;
  logger: Logger;
  tokenValidationLogger: ITokenValidationLogger;
  jwtSecret: string;
}): IAuthorizationMiddleware {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Get JWT secret as Uint8Array for jose library.
   */
  const getSecretKey = (): Uint8Array => {
    return new TextEncoder().encode(jwtSecret);
  };

  /**
   * Map AppError to AuthErrorCode.
   */
  const mapErrorToCode = (error: AppError): AuthErrorCode => {
    const errorCode = error.code as string;

    // Direct mapping for known error codes
    if (errorCode in AUTH_ERROR_HTTP_STATUS) {
      return errorCode as AuthErrorCode;
    }

    // Map specific error codes
    switch (errorCode) {
      case 'AUTH_TOKEN_INVALID':
      case 'AUTH_TOKEN_MALFORMED':
        return 'AUTH_TOKEN_INVALID';
      case 'AUTH_TOKEN_EXPIRED':
        return 'AUTH_TOKEN_EXPIRED';
      case 'AUTH_TOKEN_VERSION_MISMATCH':
      case 'AUTH_TOKEN_REVOKED':
        return 'AUTH_TOKEN_VERSION_MISMATCH';
      case 'AUTH_NO_MEMBERSHIP':
        return 'AUTH_NO_MEMBERSHIP';
      case 'AUTH_MEMBERSHIP_INACTIVE':
        return 'AUTH_MEMBERSHIP_INACTIVE';
      case 'AUTH_USER_QUARANTINED':
        return 'AUTH_USER_QUARANTINED';
      default:
        return 'AUTH_CONTEXT_RESOLUTION_FAILED';
    }
  };

  /**
   * Log authorization resolution attempt.
   */
  const logResolutionAttempt = (
    entry: AuthorizationResolutionLogEntry,
    logContext?: LogContext,
  ): void => {
    const baseContext: LogContext = {
      correlation_id: entry.correlationId,
      user_id: entry.userId ?? undefined,
      tenant_id: entry.tenantId ?? undefined,
      route: entry.endpoint,
      duration_ms: entry.durationMs,
      ...logContext,
    };

    if (entry.result === 'SUCCESS') {
      if (config.logSuccess) {
        logger.info('Authorization context resolved successfully', baseContext);
      }
    } else {
      logger.warn('Authorization context resolution failed', {
        ...baseContext,
        error_code: entry.errorCode,
        error_message: entry.errorMessage,
      });
    }
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    /**
     * Check if a route should bypass authorization.
     */
    shouldBypass(pathname: string): boolean {
      return config.bypassRoutes.some((pattern) => pattern.test(pathname));
    },

    /**
     * Extract and validate JWT from request.
     */
    async extractAndValidateJwt(
      request: NextRequest,
    ): Promise<JwtExtractionResult> {
      // Try to get JWT from Authorization header first
      const authHeader = request.headers.get('authorization');
      let token: string | undefined;

      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }

      // Fall back to cookie if no header
      if (!token) {
        token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
      }

      // No token found
      if (!token) {
        return {
          success: false,
          errorCode: 'AUTH_TOKEN_INVALID',
          errorMessage: 'No authentication token provided',
        };
      }

      try {
        // Verify JWT signature and expiration using jose (Edge-compatible)
        const secretKey = getSecretKey();
        const { payload } = await jwtVerify(token, secretKey, {
          algorithms: ['HS256'],
        });

        // Validate required claims
        const userId = (payload.sub ?? payload.userId) as string | undefined;
        const activeTenantId = payload.activeTenantId as string | undefined;
        const activeOrgUnitId = payload.activeOrgUnitId as string | null | undefined;
        const tokenVersion = payload.tokenVersion as number | undefined;

        if (!userId || typeof userId !== 'string') {
          return {
            success: false,
            errorCode: 'AUTH_TOKEN_INVALID',
            errorMessage: 'Missing or invalid user ID in token',
          };
        }

        if (!activeTenantId || typeof activeTenantId !== 'string') {
          return {
            success: false,
            errorCode: 'AUTH_TOKEN_INVALID',
            errorMessage: 'Missing or invalid tenant ID in token',
          };
        }

        if (tokenVersion === undefined || typeof tokenVersion !== 'number') {
          return {
            success: false,
            errorCode: 'AUTH_TOKEN_INVALID',
            errorMessage: 'Missing or invalid token version',
          };
        }

        // Return validated claims
        return {
          success: true,
          claims: {
            userId,
            activeTenantId,
            activeOrgUnitId: activeOrgUnitId ?? null,
            tokenVersion,
          },
        };
      } catch (error) {
        // Handle jose-specific errors
        if (error instanceof Error) {
          if (error.name === 'JWTExpired') {
            return {
              success: false,
              errorCode: 'AUTH_TOKEN_EXPIRED',
              errorMessage: 'Token has expired',
            };
          }
          if (
            error.name === 'JWSSignatureVerificationFailed' ||
            error.name === 'JWSInvalid'
          ) {
            return {
              success: false,
              errorCode: 'AUTH_TOKEN_INVALID',
              errorMessage: 'Invalid token signature',
            };
          }
        }

        return {
          success: false,
          errorCode: 'AUTH_TOKEN_INVALID',
          errorMessage: 'Token validation failed',
        };
      }
    },

    /**
     * Serialize AuthorizationContext to request headers.
     *
     * SECURITY: The full permissions set is NOT included in headers.
     * Permissions are derived from role at route level.
     */
    serializeContextToHeaders(
      context: AuthorizationContext,
      headers: Headers,
    ): Headers {
      const prefix = config.headerPrefix;

      // Build serialized context (excluding permissions)
      const serialized: SerializedAuthorizationContext = {
        userId: context.userId,
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        orgUnitId: context.orgUnitId,
        role: context.role,
        tokenVersion: context.tokenVersion,
        isAuthoritative: context.isAuthoritative,
        isTenantLevel: context.isTenantLevel,
      };

      // Set x-authorization-context (JSON, excluding permissions)
      headers.set(
        `${prefix}authorization-context`,
        JSON.stringify(serialized),
      );

      // Set individual headers for backward compatibility and easy access
      headers.set(`${prefix}user-id`, context.userId);
      headers.set(`${prefix}tenant-id`, context.tenantId);
      headers.set(`${prefix}membership-id`, context.membershipId);
      headers.set(`${prefix}org-unit-id`, context.orgUnitId ?? '');
      headers.set(`${prefix}user-role`, context.role);
      headers.set(`${prefix}token-version`, String(context.tokenVersion));

      return headers;
    },

    /**
     * Create an error response for authorization failure.
     */
    createErrorResponse(
      errorCode: AuthErrorCode,
      correlationId: string,
    ): NextResponse {
      const status = AUTH_ERROR_HTTP_STATUS[errorCode];
      const message = AUTH_ERROR_MESSAGES[errorCode];

      const response: AuthErrorResponse = {
        code: errorCode,
        message,
        correlationId,
      };

      return NextResponse.json(response, { status });
    },

    /**
     * Process request through authorization pipeline.
     */
    async handle(request: NextRequest): Promise<NextResponse> {
      const pathname = request.nextUrl.pathname;
      const method = request.method;
      const startTime = Date.now();

      // Get or generate correlation ID
      const correlationId =
        request.headers.get(HEADER_CORRELATION_ID) ?? generateCorrelationId();

      // Build token validation context for logging
      const tokenValidationContext: TokenValidationContext = {
        route: pathname,
        method,
      };

      // Check if route should bypass authorization
      if (this.shouldBypass(pathname)) {
        const response = NextResponse.next();
        response.headers.set(HEADER_CORRELATION_ID, correlationId);
        return response;
      }

      // For page requests (non-API), redirect to login if auth fails
      const isPageRequest = !pathname.startsWith('/api/');

      // Extract and validate JWT
      const jwtResult = await this.extractAndValidateJwt(request);

      if (!jwtResult.success || !jwtResult.claims) {
        const errorCode = jwtResult.errorCode ?? 'AUTH_TOKEN_INVALID';
        const durationMs = Date.now() - startTime;

        // Log token validation failure (Requirement 15.3)
        if (errorCode === 'AUTH_TOKEN_EXPIRED') {
          tokenValidationLogger.logExpired(
            correlationId,
            null,
            null,
            tokenValidationContext,
          );
        } else {
          tokenValidationLogger.logInvalid(correlationId, tokenValidationContext);
        }

        // Log the resolution failure
        logResolutionAttempt({
          correlationId,
          timestamp: new Date(),
          userId: null,
          tenantId: null,
          endpoint: pathname,
          method,
          result: 'FAILURE',
          errorCode,
          errorMessage: jwtResult.errorMessage,
          durationMs,
        });

        // Redirect to login for page requests
        if (isPageRequest) {
          const loginUrl = new URL('/login', request.url);
          return NextResponse.redirect(loginUrl);
        }

        return this.createErrorResponse(errorCode, correlationId);
      }

      const claims = jwtResult.claims;

      // Update context with available tenant info
      const tokenValidationContextWithTenant: TokenValidationContext = {
        ...tokenValidationContext,
        tenantId: claims.activeTenantId,
      };

      // Validate token version against database
      const tokenVersionResult = await tokenVersionService.validateTokenVersion(
        claims.userId,
        claims.tokenVersion,
      );

      if (isFail(tokenVersionResult)) {
        const durationMs = Date.now() - startTime;

        // Log token validation failure (Requirement 15.3)
        tokenValidationLogger.log({
          correlationId,
          userId: claims.userId,
          claimedTokenVersion: claims.tokenVersion,
          currentTokenVersion: null,
          validationResult: 'VERSION_MISMATCH',
          failureReason: 'AUTH_TOKEN_VERSION_MISMATCH',
          context: tokenValidationContextWithTenant,
        });

        // Log the resolution failure
        logResolutionAttempt({
          correlationId,
          timestamp: new Date(),
          userId: claims.userId,
          tenantId: claims.activeTenantId,
          endpoint: pathname,
          method,
          result: 'FAILURE',
          errorCode: 'AUTH_TOKEN_VERSION_MISMATCH',
          errorMessage: 'Token version validation failed',
          durationMs,
        });

        if (isPageRequest) {
          const loginUrl = new URL('/login', request.url);
          return NextResponse.redirect(loginUrl);
        }

        return this.createErrorResponse('AUTH_TOKEN_VERSION_MISMATCH', correlationId);
      }

      // Check if token version matches
      if (!tokenVersionResult.data) {
        const durationMs = Date.now() - startTime;

        // Get the current token version for logging
        const currentVersionForLog = await tokenVersionService.getTokenVersion(claims.userId);
        const currentVersion = isFail(currentVersionForLog) ? null : currentVersionForLog.data;

        // Log token validation failure with version mismatch details (Requirement 15.3)
        tokenValidationLogger.logVersionMismatch(
          correlationId,
          claims.userId,
          claims.tokenVersion,
          currentVersion ?? -1, // Use -1 if we couldn't get current version
          tokenValidationContextWithTenant,
        );

        // Log the resolution failure
        logResolutionAttempt({
          correlationId,
          timestamp: new Date(),
          userId: claims.userId,
          tenantId: claims.activeTenantId,
          endpoint: pathname,
          method,
          result: 'FAILURE',
          errorCode: 'AUTH_TOKEN_VERSION_MISMATCH',
          errorMessage: 'Token version does not match current version',
          durationMs,
        });

        if (isPageRequest) {
          const loginUrl = new URL('/login', request.url);
          return NextResponse.redirect(loginUrl);
        }

        return this.createErrorResponse('AUTH_TOKEN_VERSION_MISMATCH', correlationId);
      }

      // Get current token version for context resolution
      const currentTokenVersionResult = await tokenVersionService.getTokenVersion(
        claims.userId,
      );

      if (isFail(currentTokenVersionResult)) {
        const durationMs = Date.now() - startTime;

        // Log token validation failure (Requirement 15.3)
        tokenValidationLogger.log({
          correlationId,
          userId: claims.userId,
          claimedTokenVersion: claims.tokenVersion,
          currentTokenVersion: null,
          validationResult: 'INVALID',
          failureReason: 'AUTH_TOKEN_INVALID',
          context: tokenValidationContextWithTenant,
        });

        // Log the resolution failure
        logResolutionAttempt({
          correlationId,
          timestamp: new Date(),
          userId: claims.userId,
          tenantId: claims.activeTenantId,
          endpoint: pathname,
          method,
          result: 'FAILURE',
          errorCode: 'AUTH_CONTEXT_RESOLUTION_FAILED',
          errorMessage: 'Failed to get token version',
          durationMs,
        });

        if (isPageRequest) {
          const loginUrl = new URL('/login', request.url);
          return NextResponse.redirect(loginUrl);
        }

        return this.createErrorResponse('AUTH_CONTEXT_RESOLUTION_FAILED', correlationId);
      }

      // Token validation successful - log success (Requirement 15.3)
      tokenValidationLogger.logSuccess(
        correlationId,
        claims.userId,
        claims.tokenVersion,
        tokenValidationContextWithTenant,
      );

      // Resolve full AuthorizationContext
      const contextResult: DomainResult<AuthorizationContextResult> =
        await authorizationContextResolver.resolve({
          jwtClaims: claims,
          currentTokenVersion: currentTokenVersionResult.data,
        });

      if (isFail(contextResult)) {
        const errorCode = mapErrorToCode(contextResult.error);
        const durationMs = Date.now() - startTime;

        // Log the resolution failure
        logResolutionAttempt({
          correlationId,
          timestamp: new Date(),
          userId: claims.userId,
          tenantId: claims.activeTenantId,
          endpoint: pathname,
          method,
          result: 'FAILURE',
          errorCode,
          errorMessage: contextResult.error.message,
          durationMs,
        });

        if (isPageRequest) {
          const loginUrl = new URL('/login', request.url);
          return NextResponse.redirect(loginUrl);
        }

        return this.createErrorResponse(errorCode, correlationId);
      }

      // Success - serialize context to headers
      const authContext = contextResult.data.context;
      const requestHeaders = new Headers(request.headers);

      // Add correlation ID
      requestHeaders.set(HEADER_CORRELATION_ID, correlationId);

      // Serialize authorization context to headers
      this.serializeContextToHeaders(authContext, requestHeaders);

      // Log success (if configured)
      const durationMs = Date.now() - startTime;
      logResolutionAttempt({
        correlationId,
        timestamp: new Date(),
        userId: authContext.userId,
        tenantId: authContext.tenantId,
        endpoint: pathname,
        method,
        result: 'SUCCESS',
        durationMs,
      });

      // Continue to route handler with modified headers
      return NextResponse.next({
        request: { headers: requestHeaders },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Export Types
// ---------------------------------------------------------------------------

export type AuthorizationMiddleware = IAuthorizationMiddleware;
