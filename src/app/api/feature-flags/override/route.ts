/**
 * POST /api/feature-flags/override — Create a per-tenant feature flag override.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 19.4, 19.5
 * @see Permission Mapping: /api/feature-flags/override POST → tenant:manage
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
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { OverrideFeatureFlagUseCase } from '@core/domains/featureFlag/usecases';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const overrideSchema = z.object({
  featureName: z.string().min(1, 'Feature name is required'),
  enabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface FeatureFlagOverrideResponse {
  data: {
    id: string;
    featureName: string;
    enabled: boolean;
    overriddenBy: string;
    createdAt: string;
  };
}

// ---------------------------------------------------------------------------
// POST handler — Override feature flag
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/feature-flags/override — Create a per-tenant feature flag override.
 *
 * AuthorizationContext is guaranteed to have tenant:manage permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with created override or error
 */
const handleOverrideFeatureFlag: AuthorizedRouteHandler<FeatureFlagOverrideResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<FeatureFlagOverrideResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId } as unknown as FeatureFlagOverrideResponse,
      { status: 400 },
    );
  }

  const validation = overrideSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', fields: formatZodErrors(validation.error), correlationId } as unknown as FeatureFlagOverrideResponse,
      { status: 400 },
    );
  }

  const useCase = container.resolve<OverrideFeatureFlagUseCase>('overrideFeatureFlagUseCase');
  const result = await useCase.execute({
    authContext,
    featureName: validation.data.featureName,
    enabled: validation.data.enabled,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<FeatureFlagOverrideResponse>;
  }

  const override = result.data;
  return NextResponse.json(
    {
      data: {
        id: override.id,
        featureName: override.featureName,
        enabled: override.enabled,
        overriddenBy: override.overriddenBy,
        createdAt: override.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * POST /api/feature-flags/override — Create a per-tenant feature flag override.
 *
 * Permission: tenant:manage (tenant configuration write access)
 *
 * @see Permission Mapping: /api/feature-flags/override POST → tenant:manage
 */
export const POST = withPermission(
  { permissions: ['tenant:manage'] },
  handleOverrideFeatureFlag,
);
