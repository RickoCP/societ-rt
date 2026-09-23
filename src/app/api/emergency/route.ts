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
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { TriggerEmergencyAlertUseCase } from '@core/domains/emergency/usecases';
import type { PrismaClient } from '@/generated/prisma/client';

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

  // 3. Execute use case via DI. The use case persists the alert, then triggers
  //    the physical alarm/siren (fire-and-forget) and fans out notifications
  //    and audit. Keeping this in the use case (not raw SQL here) is what lets
  //    the SOS button sound the alarm and stays consistent with the BFF pattern.
  const useCase = container.resolve<TriggerEmergencyAlertUseCase>(
    'triggerEmergencyAlertUseCase',
  );

  const result = await useCase.execute({
    authContext,
    data: {
      latitude: validation.data.latitude ?? null,
      longitude: validation.data.longitude ?? null,
    },
  });

  // 4. Map result to a safe UI contract
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const alert = result.data;

  return NextResponse.json(
    {
      data: {
        id: alert.id,
        userId: alert.userId,
        latitude: alert.latitude,
        longitude: alert.longitude,
        locationUnavailable: alert.locationUnavailable,
        status: alert.status,
        createdAt: alert.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
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
    const prismaClient = container.resolve<PrismaClient>('prismaClient');
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
