/**
 * JWT Service — Multi-tenant access token generation and validation.
 *
 * SECURITY INVARIANTS:
 * - INV-AUTH-001: JWT carries identity and context ONLY
 * - Role and permissions are NEVER stored in JWT
 * - Authorization is resolved server-side from Membership and Permission Registry
 *
 * JWT Claims Structure (per frozen design):
 * - sub: userId
 * - activeTenantId: Current active tenant
 * - activeOrgUnitId: Current active OrgUnit (null for tenant-level admins)
 * - tokenVersion: For forced invalidation
 * - iat: Issued at timestamp
 * - exp: Expiration timestamp (15 minutes)
 *
 * @see Requirements 44 (AC 1-6)
 * @see Design Decision D1: JWT access token expiry: 15 minutes
 * @see Design Decision D3: JWT algorithm: HS256
 */

import jwt from 'jsonwebtoken';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { JWTClaims } from '@core/domains/authorization';
import {
  authTokenInvalid,
  authTokenExpired,
  authTokenVersionMismatch,
} from '@core/domains/authorization';
import { requireJwtSecret } from './secrets';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Access token expiry in seconds.
 *
 * @see Design Decision D1: 15 minutes
 */
export const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes

/**
 * JWT signing algorithm.
 *
 * @see Design Decision D3: HS256
 */
const JWT_ALGORITHM = 'HS256' as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input for creating a new access token.
 *
 * Contains only the required claims per frozen design.
 * Role and permissions are NOT included (INV-AUTH-001).
 */
export interface CreateAccessTokenInput {
  /** User ID (becomes 'sub' claim) */
  readonly userId: string;
  /** Current active tenant ID */
  readonly activeTenantId: string;
  /** Current active OrgUnit ID (null for tenant-level admins) */
  readonly activeOrgUnitId: string | null;
  /** Token version for forced invalidation */
  readonly tokenVersion: number;
}

/**
 * Result of access token creation.
 */
export interface AccessTokenResult {
  /** The signed JWT token */
  readonly token: string;
  /** Token expiration timestamp (Unix epoch seconds) */
  readonly expiresAt: number;
}

/**
 * Input for validating an access token.
 */
export interface ValidateAccessTokenInput {
  /** The JWT token to validate */
  readonly token: string;
  /** Current token version from user record (for exact match validation) */
  readonly expectedTokenVersion?: number;
}

/**
 * Result of successful token validation.
 */
export interface ValidatedTokenResult {
  /** Decoded JWT claims */
  readonly claims: JWTClaims;
}

// ---------------------------------------------------------------------------
// Internal Types (JWT library payload)
// ---------------------------------------------------------------------------

/**
 * Raw JWT payload structure used by jsonwebtoken library.
 */
interface RawJWTPayload {
  sub: string;
  activeTenantId: string;
  activeOrgUnitId: string | null;
  tokenVersion: number;
  iat: number;
  exp: number;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * JWT Service interface for multi-tenant authentication.
 *
 * @see Requirements 44 (JWT Claims Structure Update)
 */
export interface IJWTService {
  /**
   * Create a new access token with the specified claims.
   *
   * The token will:
   * - Use HS256 signing algorithm
   * - Expire in 15 minutes
   * - Contain ONLY identity and context (no role/permissions)
   *
   * @param input - Token creation parameters
   * @returns The signed token and expiration timestamp
   */
  createAccessToken(
    input: CreateAccessTokenInput,
  ): DomainResult<AccessTokenResult>;

  /**
   * Validate and decode an access token.
   *
   * Performs the following validations:
   * 1. Signature verification (HS256)
   * 2. Expiration check (exp claim)
   * 3. Required claims presence
   * 4. Token version match (if expectedTokenVersion provided)
   *
   * @param input - Token and optional version for validation
   * @returns Decoded claims on success, error on failure
   */
  validateAccessToken(
    input: ValidateAccessTokenInput,
  ): DomainResult<ValidatedTokenResult>;

  /**
   * Decode a token without validation.
   *
   * WARNING: This does NOT verify the signature or expiration.
   * Use only for extracting claims from trusted contexts (e.g., logging).
   *
   * @param token - The JWT token to decode
   * @returns Decoded claims or null if malformed
   */
  decodeAccessToken(token: string): JWTClaims | null;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for creating JWT Service.
 *
 * This implementation uses jsonwebtoken library for Node.js environments.
 * For Edge runtime (middleware), use jose library directly.
 *
 * @see Requirements 44 (AC 1-6)
 */
export function JWTServiceImpl(): IJWTService {
  /**
   * Get the JWT secret from environment.
   * Uses centralized secret resolution with strength enforcement.
   */
  function getSecret(): string {
    return requireJwtSecret();
  }

  /**
   * Validate required claims are present in decoded payload.
   */
  function validateRequiredClaims(
    payload: unknown,
  ): payload is RawJWTPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const p = payload as Record<string, unknown>;

    // Required string claims
    if (typeof p.sub !== 'string' || p.sub.length === 0) {
      return false;
    }
    if (typeof p.activeTenantId !== 'string' || p.activeTenantId.length === 0) {
      return false;
    }

    // activeOrgUnitId can be null or string
    if (p.activeOrgUnitId !== null && typeof p.activeOrgUnitId !== 'string') {
      return false;
    }

    // tokenVersion must be a number
    if (typeof p.tokenVersion !== 'number') {
      return false;
    }

    // iat and exp must be numbers (set by jwt library)
    if (typeof p.iat !== 'number' || typeof p.exp !== 'number') {
      return false;
    }

    return true;
  }

  /**
   * Convert raw JWT payload to JWTClaims type.
   */
  function toJWTClaims(payload: RawJWTPayload): JWTClaims {
    return {
      sub: payload.sub,
      activeTenantId: payload.activeTenantId,
      activeOrgUnitId: payload.activeOrgUnitId,
      tokenVersion: payload.tokenVersion,
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  return {
    createAccessToken(
      input: CreateAccessTokenInput,
    ): DomainResult<AccessTokenResult> {
      try {
        const secret = getSecret();

        // Calculate expiration timestamp
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + ACCESS_TOKEN_EXPIRY_SECONDS;

        // Build JWT payload - NO role or permissions (INV-AUTH-001)
        const payload: Omit<RawJWTPayload, 'iat' | 'exp'> = {
          sub: input.userId,
          activeTenantId: input.activeTenantId,
          activeOrgUnitId: input.activeOrgUnitId,
          tokenVersion: input.tokenVersion,
        };

        // Sign token with HS256 (Design Decision D3)
        const token = jwt.sign(payload, secret, {
          algorithm: JWT_ALGORITHM,
          expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
        });

        return ok({
          token,
          expiresAt,
        });
      } catch (error) {
        // Unexpected error during token creation
        return fail(
          authTokenInvalid(
            error instanceof Error
              ? `Token creation failed: ${error.message}`
              : 'Token creation failed',
          ),
        );
      }
    },

    validateAccessToken(
      input: ValidateAccessTokenInput,
    ): DomainResult<ValidatedTokenResult> {
      try {
        const secret = getSecret();

        // Verify signature and expiration
        const decoded = jwt.verify(input.token, secret, {
          algorithms: [JWT_ALGORITHM],
        });

        // Validate required claims structure
        if (!validateRequiredClaims(decoded)) {
          return fail(authTokenInvalid('Missing or invalid required claims'));
        }

        const claims = toJWTClaims(decoded);

        // Token version validation (if expected version provided)
        // Per Requirements 15.4 and Design Property 7:
        // JWT tokenVersion MUST exactly equal User.tokenVersion
        if (input.expectedTokenVersion !== undefined) {
          if (claims.tokenVersion !== input.expectedTokenVersion) {
            return fail(authTokenVersionMismatch());
          }
        }

        return ok({ claims });
      } catch (error) {
        // Handle specific JWT errors
        if (error instanceof jwt.TokenExpiredError) {
          return fail(authTokenExpired());
        }

        if (error instanceof jwt.JsonWebTokenError) {
          return fail(authTokenInvalid(error.message));
        }

        if (error instanceof jwt.NotBeforeError) {
          return fail(authTokenInvalid('Token not yet valid'));
        }

        // Generic error
        return fail(
          authTokenInvalid(
            error instanceof Error ? error.message : 'Token validation failed',
          ),
        );
      }
    },

    decodeAccessToken(token: string): JWTClaims | null {
      try {
        // Decode without verification - for logging/inspection only
        const decoded = jwt.decode(token);

        if (!validateRequiredClaims(decoded)) {
          return null;
        }

        return toJWTClaims(decoded);
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Export singleton instance for convenience
// ---------------------------------------------------------------------------

/**
 * Default JWT Service instance.
 *
 * For DI-based usage, prefer using JWTServiceImpl factory.
 */
let _defaultInstance: IJWTService | null = null;

export function getJWTService(): IJWTService {
  if (!_defaultInstance) {
    _defaultInstance = JWTServiceImpl();
  }
  return _defaultInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetJWTService(): void {
  _defaultInstance = null;
}
