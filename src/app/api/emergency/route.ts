/**
 * POST /api/emergency — Trigger a new emergency alert.
 * GET  /api/emergency — List active emergency alerts for the tenant.
 *
 * SAFETY-CRITICAL ROUTES: These endpoints use `allowSuspended: true` to ensure
 * residents can access emergency functionality even with suspended memberships.
 *
 * BFF pattern: validate input → check permissions → execute use case / query → return safe response.
 *
 * @see Requirements 7.1, 7.2, 7.3 — Safety-Critical Route Preservation
 * @see Requirements 10.1, 10.3
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { TriggerEmergencyAlertUseCase } from '@core/domains/emergency/usecases';
import type { PrismaClient } from '@prisma/client';

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

/**
 * Handler for creating a new emergency alert.
 *
 * SAFETY-CRITICAL: This endpoint is wrapped with `allowSuspended: true`
 * to ensure suspended users can still trigger emergencies.
 */
const handleTriggerEmergency: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
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

  // 2. Execute use case via DI. The use case persists the alert, then triggers
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

  // 3. Map result to a safe UI contract
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
};

// ---------------------------------------------------------------------------
// GET handler — List active emergency alerts
// ---------------------------------------------------------------------------

/**
 * Handler for listing emergency alerts.
 *
 * SAFETY-CRITICAL: This endpoint is wrapped with `allowSuspended: true`
 * to ensure suspended users can view emergency status.
 */
const handleListEmergencies: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Query emergency alerts directly via raw SQL for reliability
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
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Internal server error',
        correlationId,
      },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Export wrapped handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/emergency — Trigger emergency alert
 *
 * SAFETY-CRITICAL: Uses `allowSuspended: true` so suspended users
 * can still trigger emergencies for safety.
 *
 * @see Requirements 7.1, 7.2, 7.3 — Safety-Critical Route Preservation
 */
export const POST = withPermission(
  { permissions: ['emergency:create'], allowSuspended: true },
  handleTriggerEmergency,
);

/**
 * GET /api/emergency — List emergency alerts
 *
 * SAFETY-CRITICAL: Uses `allowSuspended: true` so suspended users
 * can view emergency status.
 *
 * @see Requirements 7.1, 7.2, 7.3 — Safety-Critical Route Preservation
 */
export const GET = withPermission(
  { permissions: ['emergency:read'], allowSuspended: true },
  handleListEmergencies,
);
