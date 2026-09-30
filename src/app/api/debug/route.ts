/**
 * Debug endpoint to test database connectivity.
 * TEMPORARY: Using raw pg instead of Prisma.
 */

import { NextResponse } from 'next/server';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(): Promise<NextResponse> {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM tenants');
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      tenantCount: result.rows[0]?.count ?? 0,
    });
  } catch (error) {
    console.error('[debug] Database error:', error);
    return NextResponse.json(
      {
        status: 'error',
        database: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
