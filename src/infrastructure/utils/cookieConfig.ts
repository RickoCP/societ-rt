/**
 * Cookie Configuration — Auth cookie settings for JWT storage.
 *
 * The auth token is stored in an HTTP-only cookie with secure defaults:
 * - HttpOnly: true (prevents JavaScript access)
 * - Secure: true in production (HTTPS only)
 * - SameSite: Lax (CSRF protection while allowing top-level navigations)
 * - Path: '/' (available across the entire application)
 *
 * @see Requirements 3.7, 3.8
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTH_TOKEN_COOKIE = 'societ_rt_auth_token';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthCookieOptions {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: 'lax' | 'strict' | 'none';
  readonly path: string;
  readonly expires: Date;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the cookie configuration for setting the auth token.
 *
 * @param token - The JWT token string to store
 * @param expiresAt - When the cookie should expire
 * @returns Cookie options object ready for use with response headers
 */
export function getAuthCookieConfig(
  token: string,
  expiresAt: Date,
): AuthCookieOptions {
  return {
    name: AUTH_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}
