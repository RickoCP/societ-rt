/**
 * GET /api/auth/me — Returns the current authenticated user's basic info.
 *
 * TEMPORARY: Using raw pg instead of Prisma due to Node.js 24 + Prisma 7.x bug.
 * Also handles JWT verification directly due to middleware Edge runtime issues.
 *
 * @see Requirements 1.3, 17.1, 17.3, 17.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { jwtVerify } from 'jose';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const AUTH_COOKIE_NAME = 'societ_rt_auth_token';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Get token from cookie
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Not authenticated',
        correlationId,
      },
      { status: 401 },
    );
  }

  // Verify JWT
  let userId: string;
  let tenantId: string;
  let role: string;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    
    userId = payload.userId as string;
    tenantId = payload.tenantId as string;
    role = payload.role as string;

    if (!userId || !tenantId || !role) {
      throw new Error('Missing JWT claims');
    }
  } catch {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or expired token',
        correlationId,
      },
      { status: 401 },
    );
  }

  try {
    const userResult = await pool.query(
      `SELECT id, name, email, role FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        {
          code: 'COMMON_NOT_FOUND',
          message: 'User not found',
          correlationId,
        },
        { status: 404 },
      );
    }

    const user = userResult.rows[0];

    return NextResponse.json(
      {
        data: {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: role,
          tenantId: tenantId,
          membershipId: '',
          orgUnitId: null,
          permissions: [],
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[auth/me] Database error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Internal server error',
        correlationId,
      },
      { status: 500 },
    );
  }
}
