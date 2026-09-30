/**
 * GET /api/dashboard — Dashboard metrics for the current tenant.
 *
 * TEMPORARY: Using raw pg instead of Prisma due to Node.js 24 + Prisma 7.x bug.
 * Also handles JWT verification directly due to middleware Edge runtime issues.
 *
 * @see Requirements 28.1
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
  let tenantId: string;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    
    tenantId = payload.tenantId as string;

    if (!tenantId) {
      throw new Error('Missing tenantId claim');
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
    // Run all counts in parallel with safe fallbacks
    const [
      residentsResult,
      householdsResult,
      lettersResult,
      emergenciesResult,
      eventsResult,
      iuranResult,
      incomeResult,
      expenseResult,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM residents WHERE tenant_id = $1 AND deleted_at IS NULL', [tenantId]),
      pool.query('SELECT COUNT(*) as count FROM households WHERE tenant_id = $1', [tenantId]),
      pool.query("SELECT COUNT(*) as count FROM letter_requests WHERE tenant_id = $1 AND status = 'pending'", [tenantId]).catch(() => ({ rows: [{ count: '0' }] })),
      pool.query("SELECT COUNT(*) as count FROM emergency_alerts WHERE tenant_id = $1 AND status = 'active'", [tenantId]).catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) as count FROM community_events WHERE tenant_id = $1 AND date >= NOW()', [tenantId]).catch(() => ({ rows: [{ count: '0' }] })),
      pool.query("SELECT COUNT(*) as count FROM iuran_statuses WHERE tenant_id = $1 AND status = 'unpaid'", [tenantId]).catch(() => ({ rows: [{ count: '0' }] })),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM financial_transactions WHERE tenant_id = $1 AND type = 'income'", [tenantId]).catch(() => ({ rows: [{ total: '0' }] })),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM financial_transactions WHERE tenant_id = $1 AND type = 'expense'", [tenantId]).catch(() => ({ rows: [{ total: '0' }] })),
    ]);

    const currentBalance = 
      (Number(incomeResult.rows[0]?.total) || 0) - 
      (Number(expenseResult.rows[0]?.total) || 0);

    return NextResponse.json({
      data: {
        totalResidents: parseInt(residentsResult.rows[0]?.count || '0', 10),
        totalHouseholds: parseInt(householdsResult.rows[0]?.count || '0', 10),
        pendingLetters: parseInt(lettersResult.rows[0]?.count || '0', 10),
        activeEmergencies: parseInt(emergenciesResult.rows[0]?.count || '0', 10),
        upcomingEvents: parseInt(eventsResult.rows[0]?.count || '0', 10),
        unpaidIuran: parseInt(iuranResult.rows[0]?.count || '0', 10),
        currentBalance,
      },
    });
  } catch (error) {
    console.error('[dashboard] Database error:', error);
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
