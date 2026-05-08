/**
 * POST /api/automation/rules/:id/enable — Enable an automation rule.
 *
 * BFF pattern: resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 39.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { EnableDisableRuleUseCase } from '@core/domains/automation/usecases';

// ---------------------------------------------------------------------------
// POST handler — Enable rule
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const { id } = await params;

  const useCase = container.resolve<EnableDisableRuleUseCase>(
    'enableDisableRuleUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: { ruleId: id, enabled: true },
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
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
  );
}
