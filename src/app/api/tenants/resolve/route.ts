/**
 * GET /api/tenants/resolve?subdomain=xxx — Resolve tenant by subdomain.
 *
 * Public endpoint (no auth required) — used by login page to get tenantId
 * from the subdomain before authentication.
 *
 * TEMPORARY: Using raw pg instead of Prisma due to Node.js 24 + Prisma 7.x
 * CodeFrameColorMode bug.
 *
 * @see Requirements 1.3, 2.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const subdomain = request.nextUrl.searchParams.get('subdomain');

  if (!subdomain) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'subdomain query parameter is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query(
      'SELECT id, name, subdomain FROM tenants WHERE subdomain = $1 AND status = $2 LIMIT 1',
      [subdomain, 'active']
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
          correlationId,
        },
        { status: 404 },
      );
    }

    const tenant = result.rows[0];

    return NextResponse.json(
      {
        data: {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[tenant-resolve] Database error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to resolve tenant',
        correlationId,
      },
      { status: 500 },
    );
  }
}
