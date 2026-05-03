/**
 * GET /api/feature-flags — List feature flags for the tenant.
 *
 * @see Requirements 19.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { FeatureFlagRepository } from '@core/domains/featureFlag/repositories/FeatureFlagRepository';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const featureFlagRepository = container.resolve<FeatureFlagRepository>('featureFlagRepository');
  const result = await featureFlagRepository.getByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
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
}
