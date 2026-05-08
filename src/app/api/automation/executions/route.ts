/**
 * GET /api/automation/executions — List automation execution history for the tenant.
 *
 * BFF pattern: resolve auth context → query repository → return safe response.
 *
 * @see Requirements 39.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// GET handler — List execution history
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

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
    );
  } catch {
    return mapAppErrorToHttpResponse(
      {
        type: 'technical',
        code: 'AUTOMATION_EXECUTIONS_FETCH_FAILED',
        message: 'Failed to fetch automation executions',
      },
      correlationId,
    );
  }
}
