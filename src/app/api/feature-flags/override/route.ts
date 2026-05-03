/**
 * POST /api/feature-flags/override — Create a per-tenant feature flag override.
 *
 * @see Requirements 19.4, 19.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { OverrideFeatureFlagUseCase } from '@core/domains/featureFlag/usecases';

const overrideSchema = z.object({
  featureName: z.string().min(1, 'Feature name is required'),
  enabled: z.boolean(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = overrideSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', fields: formatZodErrors(validation.error), correlationId },
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
    return mapAppErrorToHttpResponse(result.error, correlationId);
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
}
