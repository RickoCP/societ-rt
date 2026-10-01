/**
 * GET /api/automation/executions — List automation execution history for the tenant.
 *
 * BFF pattern: withPermission → query repository → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * Authorization:
 * - GET: iot:read (view automation execution history)
 *
 * @see Requirements 39.8
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// GET handler — List execution history
// ---------------------------------------------------------------------------

/**
 * Lists automation execution history for the current tenant.
 *
 * AuthorizationContext is guaranteed to have iot:read permission
 * after withPermission validation.
 *
 * @see Permission Mapping: GET /api/automation/executions → iot:read
 */
const handleListExecutions: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get('pageSize') ?? '20')),
  );
  const ruleId = searchParams.get('ruleId');

  try {
    const prismaClient = container.resolve<PrismaClient>('prismaClient');

    const where: Record<string, unknown> = {
      tenantId: authContext.tenantId,
    };
    if (ruleId) {
      where.ruleId = ruleId;
    }

    const [executions, total] = await Promise.all([
      prismaClient.automationExecution.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prismaClient.automationExecution.count({ where }),
    ]);

    return NextResponse.json(
      {
        data: executions.map((exec) => ({
          id: exec.id,
          ruleId: exec.ruleId,
          triggerEvent: exec.triggerEvent,
          conditionsEvaluated: exec.conditionsEvaluated,
          actionsExecuted: exec.actionsExecuted,
          durationMs: exec.durationMs,
          status: exec.status,
          error: exec.error,
          executedAt: exec.executedAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      },
      { status: 200 },
    ) as NextResponse<void>;
  } catch {
    return mapAppErrorToHttpResponse(
      {
        type: 'technical',
        code: 'AUTOMATION_EXECUTIONS_FETCH_FAILED',
        message: 'Failed to fetch automation executions',
      },
      correlationId,
    ) as NextResponse<void>;
  }
};

// ---------------------------------------------------------------------------
// Export route handler with permission wrapper
// ---------------------------------------------------------------------------

/**
 * GET /api/automation/executions — List automation executions (requires iot:read)
 *
 * @see Permission Mapping: GET /api/automation/executions → iot:read
 */
export const GET = withPermission(
  { permissions: ['iot:read'] },
  handleListExecutions,
);
