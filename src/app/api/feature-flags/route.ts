/**
 * GET /api/feature-flags — List feature flags for the tenant.
 *
 * BFF pattern: withPermission → execute repository query → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 19.1
 * @see Permission Mapping: /api/feature-flags GET → tenant:manage
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { FeatureFlagRepository } from '@core/domains/featureFlag/repositories/FeatureFlagRepository';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface FeatureFlagsListResponse {
  data: Array<{
    id: string;
    featureName: string;
    enabled: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// GET handler — List feature flags
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/feature-flags — List feature flags for the tenant.
 *
 * AuthorizationContext is guaranteed to have tenant:manage permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with feature flags list or error
 */
const handleListFeatureFlags: AuthorizedRouteHandler<FeatureFlagsListResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<FeatureFlagsListResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const featureFlagRepository = container.resolve<FeatureFlagRepository>('featureFlagRepository');
  const result = await featureFlagRepository.getByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<FeatureFlagsListResponse>;
  }

  return NextResponse.json(
    {
      data: result.data.map((flag) => ({
        id: flag.id,
        featureName: flag.featureName,
        enabled: flag.enabled,
      })),
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/feature-flags — List feature flags for the tenant.
 *
 * Permission: tenant:manage (tenant configuration read access)
 *
 * @see Permission Mapping: /api/feature-flags GET → tenant:manage
 */
export const GET = withPermission(
  { permissions: ['tenant:manage'] },
  handleListFeatureFlags,
);
