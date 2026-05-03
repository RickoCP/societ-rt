/**
 * JWT Utilities — Sign and verify JSON Web Tokens.
 *
 * JWT_SECRET is read from environment variables at call time.
 * NEVER hardcode the secret.
 *
 * @see Requirements 3.1, 3.7
 */

import jwt from 'jsonwebtoken';
import type { UserRole } from '@core/protocols';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JwtPayload {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: UserRole;
  readonly iat?: number;
  readonly exp?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is not set. Authentication cannot proceed.',
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Signs a JWT with the given payload and configurable expiry.
 *
 * @param payload - The claims to include in the token
 * @param expirySeconds - Token lifetime in seconds (default: 24h)
 * @returns The signed JWT string
 */
export function signJwt(
  payload: Pick<JwtPayload, 'userId' | 'tenantId' | 'role'>,
  expirySeconds: number = DEFAULT_EXPIRY_SECONDS,
): string {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    },
    secret,
    { expiresIn: expirySeconds },
  );
}

/**
 * Verifies and decodes a JWT token.
 *
 * @param token - The JWT string to verify
 * @returns The decoded payload, or null if the token is invalid/expired
 */
export function verifyJwt(token: string): JwtPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}
