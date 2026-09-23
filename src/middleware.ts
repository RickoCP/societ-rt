/**
 * Next.js Middleware — Auth, tenant resolution, security headers, and rate limiting.
 *
 * Middleware chain order:
 *   1. Correlation ID (generate or extract)
 *   2. Security headers
 *   3. Rate limiter (login endpoint only)
 *   4. JWT validation (via jose — Edge-compatible)
 *   5. Tenant context resolution (set headers for downstream route handlers)
 *   6. Feature flag check (placeholder)
 *
 * Public paths skip auth: /api/auth/login, /api/auth/register, /api/health,
 * /login, /register, /_next, /favicon.ico
 *
 * @see Requirements 1.3, 1.4, 1.5, 21.3, 21.4, 21.6, 25.2
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
];

/** Prefixes that are always public (static assets, Next.js internals). */
const PUBLIC_PREFIXES = ['/_next', '/favicon.ico'];

/** Login endpoint for rate limiting. */
const LOGIN_PATH = '/api/auth/login';

/** Rate limit: 10 requests per minute per IP for login. */
const LOGIN_RATE_LIMIT_MAX = 10;
const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

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
// JWT payload type (Edge-side — lightweight)
// ---------------------------------------------------------------------------

interface MiddlewareJwtPayload {
  userId: string;
  tenantId: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ------------------------------------------------------------------
  // 1. Correlation ID — extract from header or generate new
  // ------------------------------------------------------------------
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // ------------------------------------------------------------------
  // 2. Public paths — skip auth but still set security headers
  // ------------------------------------------------------------------
  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    setSecurityHeaders(response, correlationId);
    return response;
  }

  // ------------------------------------------------------------------
  // 3. Rate limiter — login endpoint only
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
  // 4. JWT validation — extract from cookie, verify with jose
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

  let payload: MiddlewareJwtPayload;

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
  // 5. Tenant context resolution — set auth headers for route handlers
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
  // 6. Feature flag check — placeholder for future implementation
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
// Matcher — exclude static files and Next.js internals
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
