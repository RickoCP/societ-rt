/**
 * PATCH /api/emergency/[id]/status — Update the status of an emergency alert.
 *
 * This is an ADMINISTRATIVE action that requires `emergency:manage` permission
 * and an ACTIVE membership. Suspended users CANNOT manage emergencies.
 *
 * BFF pattern: validate input → check permissions → execute use case → return safe response.
 *
 * @see Requirements 7.1 — POST /emergency/[id]/acknowledge uses emergency:manage WITHOUT allowSuspended
 * @see Requirements 10.3, 10.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { UpdateEmergencyStatusUseCase } from '@core/domains/emergency/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const updateStatusSchema = z.object({
  status: z.enum(['active', 'responding', 'resolved']),
});

// ---------------------------------------------------------------------------
// PATCH handler — Update emergency alert status
// ---------------------------------------------------------------------------

/**
 * Handler for updating emergency alert status.
 *
 * This is an ADMINISTRATIVE action — suspended users cannot manage emergencies.
 * Only users with `emergency:manage` permission and ACTIVE membership can use this.
 */
const handleUpdateEmergencyStatus: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await (routeContext?.params ?? Promise.resolve({ id: '' }));

  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Emergency alert ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

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

  const validation = updateStatusSchema.safeParse(body);
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

  // 2. Execute use case via DI
  const useCase = container.resolve<UpdateEmergencyStatusUseCase>(
    'updateEmergencyStatusUseCase',
  );
  const result = await useCase.execute({
    authContext,
    alertId: id,
    status: validation.data.status,
  });

  // 3. Map result to safe response
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
        updatedAt: alert.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Export wrapped handler
// ---------------------------------------------------------------------------

/**
 * PATCH /api/emergency/[id]/status — Update emergency alert status
 *
 * ADMINISTRATIVE ACTION: Does NOT use `allowSuspended`.
 * Only users with ACTIVE membership and `emergency:manage` permission
 * can acknowledge or resolve emergencies.
 *
 * @see Requirements 7.1 — Admin action without allowSuspended
 */
export const PATCH = withPermission(
  { permissions: ['emergency:manage'] },
  handleUpdateEmergencyStatus,
);
