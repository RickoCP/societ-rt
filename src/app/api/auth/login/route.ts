/**
 * POST /api/auth/login - Authenticates a user and issues a session cookie.
 *
 * TEMPORARY: Using raw pg instead of Prisma due to Node.js 24 + Prisma 7.x bug.
 *
 * @see Requirements 3.1, 3.4, 3.5, 3.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import {
  getAuthCookieConfig,
  AUTH_TOKEN_COOKIE,
} from '@infrastructure/utils/cookieConfig';
import { SignJWT } from 'jose';
import { mapLegacyRole } from '@core/domains/membership/types';
import { MembershipRole } from '@core/domains/membership/types';
import { UserRole } from '@core/protocols';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Normalizes a stored (possibly legacy) role string into the canonical
 * MembershipRole value used across the authorization system.
 *
 * The DB may still hold legacy roles (e.g. "Super_Admin"); the edge proxy and
 * API-layer guards compare against MembershipRole values (e.g. "PLATFORM_ADMIN").
 * Minting the canonical value into the JWT keeps proxy and API views consistent
 * and avoids role-string mismatches (e.g. the /admin/security guard).
 */
function normalizeRole(storedRole: string): string {
  // Already a canonical MembershipRole → use as-is.
  if ((Object.values(MembershipRole) as string[]).includes(storedRole)) {
    return storedRole;
  }
  // Legacy role → map to canonical, falling back to the original if no mapping.
  if ((Object.values(UserRole) as string[]).includes(storedRole)) {
    const mapped = mapLegacyRole(storedRole as UserRole);
    if (mapped) {
      return mapped;
    }
  }
  return storedRole;
}

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  tenantId: z.string().min(1, 'Tenant ID is required'),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    );
  }

  const validation = loginSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  const { email, password, tenantId } = validation.data;

  try {
    // 2. Find user by email and tenant
    const userResult = await pool.query(
      `SELECT id, name, email, password_hash, role, status, failed_login_attempts, locked_until
       FROM users 
       WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [tenantId, email]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          correlationId,
        },
        { status: 401 },
      );
    }

    const user = userResult.rows[0];

    // 3. Check if account is locked
    if (user.status === 'locked' || (user.locked_until && new Date(user.locked_until) > new Date())) {
      return NextResponse.json(
        {
          code: 'AUTH_ACCOUNT_LOCKED',
          message: 'Account is locked. Please try again later.',
          correlationId,
        },
        { status: 403 },
      );
    }

    // 4. Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      // Increment failed attempts
      await pool.query(
        `UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1`,
        [user.id]
      );
      return NextResponse.json(
        {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          correlationId,
        },
        { status: 401 },
      );
    }

    // 5. Reset failed attempts on successful login
    await pool.query(
      `UPDATE users SET failed_login_attempts = 0 WHERE id = $1`,
      [user.id]
    );

    // 6. Generate JWT token
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const normalizedRole = normalizeRole(user.role);

    const token = await new SignJWT({
      sub: user.id,
      userId: user.id,
      tenantId,
      email: user.email,
      role: normalizedRole,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(secret);

    // 7. Set cookie and return response
    const cookieConfig = getAuthCookieConfig(token, expiresAt);
    const response = NextResponse.json(
      {
        data: {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 200 },
    );

    response.cookies.set(AUTH_TOKEN_COOKIE, cookieConfig.value, {
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: cookieConfig.path,
      expires: cookieConfig.expires,
    });

    return response;
  } catch (error) {
    console.error('[login] Database error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Login failed',
        correlationId,
      },
      { status: 500 },
    );
  }
}
