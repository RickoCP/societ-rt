/**
 * Next.js Proxy - Auth, tenant resolution, security headers, rate limiting,
 * and route protection for admin/platform routes.
 *
 * Proxy chain order:
 *   1. Correlation ID (generate or extract)
 *   2. Security headers
 *   3. Rate limiter (login endpoint only)
 *   4. JWT validation (via jose - Edge-compatible)
 *   5. Route authorization (admin/platform routes)
 *   6. Tenant context resolution (set headers for downstream route handlers)
 *   7. Feature flag check (placeholder)
 *
 * Public paths skip auth: /api/auth/login, /api/auth/register, /api/health,
 * /login, /register, /_next, /favicon.ico
 *
 * Protected routes:
 *   - /admin/* routes require authentication
 *   - /admin/platform/*, /admin/tenants/*, /admin/security/* require PLATFORM_ADMIN role
 *
 * @see Requirements 1.3, 1.4, 1.5, 21.3, 21.4, 21.6, 22.6, 25.2, 25.7, 25.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { checkRateLimit } from '@infrastructure/utils/rateLimiter';
import { requireJwtSecret } from '@infrastructure/utils/secrets';
import { getSecurityHeaders } from '@infrastructure/utils/securityHeaders';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_COOKIE_NAME = 'societ_rt_auth_token';

/** Paths that do not require authentication. */
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/tenants/resolve',
  '/api/health',
  '/login',
  '/register',
  '/unauthorized', // Accessible when redirected for insufficient permissions
  '/api/debug', // Debug endpoint - REMOVE IN PRODUCTION
];

/** Prefixes that are always public (static assets, Next.js internals). */
const PUBLIC_PREFIXES = ['/_next', '/favicon.ico'];

/** Login endpoint for rate limiting. */
const LOGIN_PATH = '/api/auth/login';

/** Rate limit: 10 requests per minute per IP for login. */
const LOGIN_RATE_LIMIT_MAX = 10;
const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

/**
 * Routes that require PLATFORM_ADMIN role.
 * These are platform-level administration routes that should only be accessible
 * by users with the PLATFORM_ADMIN role.
 *
 * @see Requirements 19.1, 19.2, 20.1, 21.1, 22.6, 25.7
 */
const PLATFORM_ADMIN_ROUTES = [
  '/admin/platform',
  '/admin/tenants',
  '/admin/security',
];

/** The role required for platform admin routes */
const PLATFORM_ADMIN_ROLE = 'PLATFORM_ADMIN';

/** Unauthorized page path for redirects when user lacks permission */
const UNAUTHORIZED_PATH = '/unauthorized';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getJwtSecretKey(): Uint8Array {
  // Centralized resolution: enforces presence always, and rejects weak
  // secrets in production (fail-fast). Never logs the secret value.
  return new TextEncoder().encode(requireJwtSecret());
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }
  return PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

function generateCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Check if a path requires PLATFORM_ADMIN role.
 * Routes: /admin/platform/*, /admin/tenants/*, /admin/security/*
 *
 * @see Requirements 19.1, 19.2, 20.1, 21.1, 22.6
 */
function requiresPlatformAdminRole(pathname: string): boolean {
  return PLATFORM_ADMIN_ROUTES.some(
    route => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Create an unauthorized redirect response.
 * Redirects the user to the unauthorized page for insufficient permissions.
 *
 * @see Requirements 25.8
 */
function createUnauthorizedRedirect(
  request: NextRequest,
  correlationId: string,
): NextResponse {
  const unauthorizedUrl = new URL(UNAUTHORIZED_PATH, request.url);
  unauthorizedUrl.searchParams.set('from', request.nextUrl.pathname);
  const redirectResponse = NextResponse.redirect(unauthorizedUrl);
  setSecurityHeaders(redirectResponse, correlationId);
  return redirectResponse;
}

/**
 * Set standard security headers on the response.
 */
function setSecurityHeaders(
  response: NextResponse,
  correlationId: string,
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  for (const { name, value } of getSecurityHeaders(isProduction)) {
    response.headers.set(name, value);
  }
  response.headers.set('X-Correlation-Id', correlationId);
}

// ---------------------------------------------------------------------------
// JWT payload type (Edge-side - lightweight)
// ---------------------------------------------------------------------------

interface ProxyJwtPayload {
  userId: string;
  tenantId: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Proxy (Next.js 16+ - renamed from middleware)
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ------------------------------------------------------------------
  // 1. Correlation ID - extract from header or generate new
  // ------------------------------------------------------------------
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // ------------------------------------------------------------------
  // 2. Public paths - skip auth but still set security headers
  // ------------------------------------------------------------------
  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    setSecurityHeaders(response, correlationId);
    return response;
  }

  // ------------------------------------------------------------------
  // 3. Rate limiter - login endpoint only
  // ------------------------------------------------------------------
  if (pathname === LOGIN_PATH) {
    const ip = getClientIp(request);
    const rateLimitResult = checkRateLimit(
      ip,
      LOGIN_RATE_LIMIT_MAX,
      LOGIN_RATE_LIMIT_WINDOW_MS,
    );

    if (!rateLimitResult.allowed) {
      const errorResponse = NextResponse.json(
        {
          code: 'AUTH_RATE_LIMITED',
          message: 'Too many login attempts. Please try again later.',
          correlationId,
        },
        { status: 429 },
      );
      setSecurityHeaders(errorResponse, correlationId);
      return errorResponse;
    }
  }

  // ------------------------------------------------------------------
  // 4. JWT validation - extract from cookie, verify with jose
  // ------------------------------------------------------------------
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    // For page requests (non-API), redirect to login
    if (!pathname.startsWith('/api/')) {
      const loginUrl = new URL('/login', request.url);
      const redirectResponse = NextResponse.redirect(loginUrl);
      setSecurityHeaders(redirectResponse, correlationId);
      return redirectResponse;
    }

    const errorResponse = NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Authentication is required.',
        correlationId,
      },
      { status: 401 },
    );
    setSecurityHeaders(errorResponse, correlationId);
    return errorResponse;
  }

  let payload: ProxyJwtPayload;

  try {
    const secretKey = getJwtSecretKey();
    const { payload: jwtPayload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    // Validate required claims exist
    const userId = jwtPayload.userId as string | undefined;
    const tenantId = jwtPayload.tenantId as string | undefined;
    const role = jwtPayload.role as string | undefined;

    if (!userId || !tenantId || !role) {
      throw new Error('Missing required JWT claims');
    }

    payload = { userId, tenantId, role };
  } catch {
    // For page requests (non-API), redirect to login
    if (!pathname.startsWith('/api/')) {
      const loginUrl = new URL('/login', request.url);
      const redirectResponse = NextResponse.redirect(loginUrl);
      setSecurityHeaders(redirectResponse, correlationId);
      return redirectResponse;
    }

    const errorResponse = NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Authentication is required.',
        correlationId,
      },
      { status: 401 },
    );
    setSecurityHeaders(errorResponse, correlationId);
    return errorResponse;
  }

  // ------------------------------------------------------------------
  // 5. Route authorization - check role-based access for admin/platform routes
  // ------------------------------------------------------------------

  // Check platform admin routes require PLATFORM_ADMIN role
  if (requiresPlatformAdminRole(pathname)) {
    if (payload.role !== PLATFORM_ADMIN_ROLE) {
      // For page requests, redirect to unauthorized page
      if (!pathname.startsWith('/api/')) {
        return createUnauthorizedRedirect(request, correlationId);
      }

      // For API requests, return 403 Forbidden
      const errorResponse = NextResponse.json(
        {
          code: 'AUTH_UNAUTHORIZED',
          message: 'Access denied. PLATFORM_ADMIN role is required.',
          correlationId,
        },
        { status: 403 },
      );
      setSecurityHeaders(errorResponse, correlationId);
      return errorResponse;
    }
  }

  // Note: All /admin/* routes require authentication (already validated above)
  // Additional permission checks can be added here for specific admin routes

  // ------------------------------------------------------------------
  // 6. Tenant context resolution - set auth headers for route handlers
  // ------------------------------------------------------------------
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-tenant-id', payload.tenantId);
  requestHeaders.set('x-user-role', payload.role);
  requestHeaders.set('x-correlation-id', correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ------------------------------------------------------------------
  // 7. Feature flag check - placeholder for future implementation
  // ------------------------------------------------------------------
  // TODO: Check feature flags based on tenant's subscription plan.
  // This will be implemented when the FeatureFlag domain is built.

  // ------------------------------------------------------------------
  // Set security headers on the final response
  // ------------------------------------------------------------------
  setSecurityHeaders(response, correlationId);

  return response;
}

// ---------------------------------------------------------------------------
// Matcher - exclude static files and Next.js internals
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public folder assets (SVG, PNG, JPG, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
