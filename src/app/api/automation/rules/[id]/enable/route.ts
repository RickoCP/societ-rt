/**
 * POST /api/automation/rules/:id/enable — Enable an automation rule.
 *
 * BFF pattern: withPermission → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * Authorization:
 * - POST: iot:manage (enable automation rule)
 *
 * @see Requirements 39.7
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { EnableDisableRuleUseCase } from '@core/domains/automation/usecases';

// ---------------------------------------------------------------------------
// POST handler — Enable rule
// ---------------------------------------------------------------------------

/**
 * Enables an automation rule.
 *
 * AuthorizationContext is guaranteed to have iot:manage permission
 * after withPermission validation.
 *
 * @see Permission Mapping: POST /api/automation/rules/:id/enable → iot:manage
 */
const handleEnableRule: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await context?.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Missing id parameter',
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<void>;
  }

  const useCase = container.resolve<EnableDisableRuleUseCase>(
    'enableDisableRuleUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: { ruleId: id, enabled: true },
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  const rule = result.data;

  return NextResponse.json(
    {
      data: {
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        updatedAt: rule.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// Export route handler with permission wrapper
// ---------------------------------------------------------------------------

/**
 * POST /api/automation/rules/:id/enable — Enable automation rule (requires iot:manage)
 *
 * @see Permission Mapping: POST /api/automation/rules/:id/enable → iot:manage
 */
export const POST = withPermission(
  { permissions: ['iot:manage'] },
  handleEnableRule,
);
