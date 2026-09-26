/**
 * CookieHelper — Infrastructure utility for secure cookie management.
 *
 * Implements secure cookie handling for refresh tokens:
 * - HttpOnly: Prevents XSS access to token
 * - Secure: Only sent over HTTPS (in production)
 * - SameSite=Strict: Prevents CSRF attacks
 *
 * @see Requirement 14 AC 7: Store refresh tokens as HttpOnly, Secure, SameSite=Strict cookies
 * @see Design D2: 30-day expiry
 */

import { cookies } from 'next/headers';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Cookie name for the refresh token.
 */
export const REFRESH_TOKEN_COOKIE_NAME = 'societ_refresh_token';

/**
 * Cookie name for the access token (if stored in cookie).
 */
export const ACCESS_TOKEN_COOKIE_NAME = 'societ_access_token';

/**
 * Default refresh token expiry in seconds (30 days).
 */
export const DEFAULT_REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60;

/**
 * Default access token cookie expiry in seconds (15 minutes).
 */
export const DEFAULT_ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for setting a refresh token cookie.
 */
export interface RefreshTokenCookieOptions {
  /** Override default expiry in seconds */
  readonly maxAge?: number;
  /** Cookie domain (optional, defaults to current domain) */
  readonly domain?: string;
  /** Cookie path (defaults to '/') */
  readonly path?: string;
  /** Force Secure flag (auto-detected from env if not specified) */
  readonly secure?: boolean;
}

/**
 * Options for setting an access token cookie.
 */
export interface AccessTokenCookieOptions {
  /** Override default expiry in seconds */
  readonly maxAge?: number;
  /** Cookie domain (optional) */
  readonly domain?: string;
  /** Cookie path (defaults to '/') */
  readonly path?: string;
  /** Force Secure flag */
  readonly secure?: boolean;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Determine if we're in production environment.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get base path from environment.
 */
function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASEPATH || '/';
}

// ---------------------------------------------------------------------------
// Cookie Helper Interface
// ---------------------------------------------------------------------------

export interface CookieHelper {
  /**
   * Set refresh token cookie with secure settings.
   * @see Requirement 14 AC 7: HttpOnly, Secure, SameSite=Strict
   */
  setRefreshTokenCookie(
    token: string,
    options?: RefreshTokenCookieOptions,
  ): Promise<void>;

  /**
   * Clear the refresh token cookie.
   * @see Requirement 16 AC 2: Clear access token cookie on logout
   */
  clearRefreshTokenCookie(): Promise<void>;

  /**
   * Get the current refresh token from cookie.
   * Returns null if not present.
   */
  getRefreshTokenCookie(): Promise<string | null>;

  /**
   * Set access token cookie.
   * Note: Access tokens may also be sent in headers; this is for cookie-based auth.
   */
  setAccessTokenCookie(
    token: string,
    options?: AccessTokenCookieOptions,
  ): Promise<void>;

  /**
   * Clear the access token cookie.
   */
  clearAccessTokenCookie(): Promise<void>;

  /**
   * Get the current access token from cookie.
   */
  getAccessTokenCookie(): Promise<string | null>;

  /**
   * Clear both access and refresh token cookies.
   * Used during logout.
   */
  clearAllAuthCookies(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Cookie Helper Implementation
// ---------------------------------------------------------------------------

/**
 * Create a CookieHelper instance.
 * This implementation uses Next.js cookies() function.
 */
export function createCookieHelper(): CookieHelper {
  async function setRefreshTokenCookie(
    token: string,
    options?: RefreshTokenCookieOptions,
  ): Promise<void> {
    const cookieStore = await cookies();
    
    const cookieOptions: ResponseCookie = {
      name: REFRESH_TOKEN_COOKIE_NAME,
      value: token,
      httpOnly: true, // Prevents XSS access
      secure: options?.secure ?? isProduction(), // HTTPS only in production
      sameSite: 'strict', // Prevents CSRF
      path: options?.path ?? getBasePath(),
      maxAge: options?.maxAge ?? DEFAULT_REFRESH_TOKEN_EXPIRY_SECONDS,
    };

    if (options?.domain) {
      cookieOptions.domain = options.domain;
    }

    cookieStore.set(cookieOptions);
  }

  async function clearRefreshTokenCookie(): Promise<void> {
    const cookieStore = await cookies();
    
    cookieStore.set({
      name: REFRESH_TOKEN_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: isProduction(),
      sameSite: 'strict',
      path: getBasePath(),
      maxAge: 0, // Immediately expire
    });
  }

  async function getRefreshTokenCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME);
    return cookie?.value ?? null;
  }

  async function setAccessTokenCookie(
    token: string,
    options?: AccessTokenCookieOptions,
  ): Promise<void> {
    const cookieStore = await cookies();
    
    const cookieOptions: ResponseCookie = {
      name: ACCESS_TOKEN_COOKIE_NAME,
      value: token,
      httpOnly: true, // Also HttpOnly for security
      secure: options?.secure ?? isProduction(),
      sameSite: 'strict',
      path: options?.path ?? getBasePath(),
      maxAge: options?.maxAge ?? DEFAULT_ACCESS_TOKEN_EXPIRY_SECONDS,
    };

    if (options?.domain) {
      cookieOptions.domain = options.domain;
    }

    cookieStore.set(cookieOptions);
  }

  async function clearAccessTokenCookie(): Promise<void> {
    const cookieStore = await cookies();
    
    cookieStore.set({
      name: ACCESS_TOKEN_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: isProduction(),
      sameSite: 'strict',
      path: getBasePath(),
      maxAge: 0,
    });
  }

  async function getAccessTokenCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME);
    return cookie?.value ?? null;
  }

  async function clearAllAuthCookies(): Promise<void> {
    await clearRefreshTokenCookie();
    await clearAccessTokenCookie();
  }

  return {
    setRefreshTokenCookie,
    clearRefreshTokenCookie,
    getRefreshTokenCookie,
    setAccessTokenCookie,
    clearAccessTokenCookie,
    getAccessTokenCookie,
    clearAllAuthCookies,
  };
}

/**
 * Singleton instance for use in server components and actions.
 */
export const cookieHelper = createCookieHelper();
