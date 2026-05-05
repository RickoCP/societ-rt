/**
 * POST /api/emergency — Trigger a new emergency alert.
 * GET  /api/emergency — List active emergency alerts for the tenant.
 *
 * BFF pattern: validate input → resolve auth context → execute use case / query → return safe response.
 *
 * @see Requirements 10.1, 10.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const triggerAlertSchema = z.object({
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

// ---------------------------------------------------------------------------
// POST handler — Trigger emergency alert
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Parse and validate input
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

  const validation = triggerAlertSchema.safeParse(body);
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

  // 3. Create emergency alert directly via raw SQL for reliability
  try {
    const { prismaClient } = container.cradle;
    const lat = validation.data.latitude ?? null;
    const lng = validation.data.longitude ?? null;
    const locationUnavailable = lat == null || lng == null;
    const id = crypto.randomUUID();
    const now = new Date();

    await prismaClient.$executeRawUnsafe(
      `INSERT INTO emergency_alerts (id, tenant_id, user_id, latitude, longitude, location_unavailable, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7)`,
      id,
      authContext.tenantId,
      authContext.userId,
      lat,
      lng,
      locationUnavailable,
      now,
    );

    return NextResponse.json(
      {
        data: {
          id,
          userId: authContext.userId,
          latitude: lat,
          longitude: lng,
          locationUnavailable,
          status: 'active',
          createdAt: now.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
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

// ---------------------------------------------------------------------------
// GET handler — List active emergency alerts
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Query emergency alerts directly via raw SQL for reliability
  try {
    const { prismaClient } = container.cradle;
    const alerts = await prismaClient.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string;
        latitude: number | null;
        longitude: number | null;
        location_unavailable: boolean;
        status: string;
        created_at: Date;
      }>
    >(
      `SELECT id, user_id, latitude, longitude, location_unavailable, status, created_at
       FROM emergency_alerts
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      authContext.tenantId,
    );

    return NextResponse.json(
      {
        data: alerts.map((alert) => ({
          id: alert.id,
          userId: alert.user_id,
          reportedBy: alert.user_id,
          latitude: alert.latitude,
          longitude: alert.longitude,
          locationUnavailable: alert.location_unavailable,
          status: alert.status,
          createdAt: new Date(alert.created_at).toISOString(),
        })),
      },
      { status: 200 },
    );
  } catch (error) {
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
