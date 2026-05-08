/**
 * GET  /api/automation/rules — List automation rules for the tenant.
 * POST /api/automation/rules — Create a new automation rule.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 39.1, 39.7, 39.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { CreateAutomationRuleUseCase } from '@core/domains/automation/usecases';
import type { AutomationRepository } from '@core/domains/automation/repositories/AutomationRepository';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals',
    'not_equals',
    'greater_than',
    'less_than',
    'time_between',
    'duration_exceeds',
  ]),
  value: z.union([z.string(), z.number()]),
});

const actionSchema = z.object({
  type: z.enum([
    'create_incident',
    'notify_security_guard',
    'notify_ketua_rt',
    'notify_emergency_contact',
    'trigger_siren',
    'capture_cctv_snapshot',
    'broadcast_neighborhood_alert',
    'send_push_notification',
  ]),
  params: z.record(z.string(), z.unknown()).default({}),
});

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  triggerEventType: z.enum([
    'panic_button_pressed',
    'gate_open',
    'gate_closed',
    'motion_detected',
    'smoke_detected',
    'alarm_triggered',
    'smart_lock_opened',
    'cctv_motion_detected',
    'device_online',
    'device_offline',
    'battery_low',
    'emergency_alert',
  ]),
  conditions: z.array(conditionSchema).min(1),
  actions: z.array(actionSchema).min(1),
  enabled: z.boolean().optional(),
  scheduleStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  scheduleEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  maxChainDepth: z.number().int().min(1).max(5).optional(),
});

// ---------------------------------------------------------------------------
// GET handler — List automation rules
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

  const automationRepository =
    container.resolve<AutomationRepository>('automationRepository');
  const result = await automationRepository.findByTenant(
    authContext.tenantId,
    page,
    pageSize,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.data.map((rule) => ({
        id: rule.id,
        name: rule.name,
        triggerEventType: rule.triggerEventType,
        conditions: rule.conditions,
        actions: rule.actions,
        enabled: rule.enabled,
        scheduleStart: rule.scheduleStart,
        scheduleEnd: rule.scheduleEnd,
        maxChainDepth: rule.maxChainDepth,
        executionCount: rule.executionCount,
        lastExecutedAt: rule.lastExecutedAt?.toISOString() ?? null,
        createdBy: rule.createdBy,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      })),
      total: result.data.total,
      page: result.data.page,
      pageSize: result.data.pageSize,
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// POST handler — Create automation rule
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

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
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    );
  }

  const validation = createRuleSchema.safeParse(body);
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

  const useCase = container.resolve<CreateAutomationRuleUseCase>(
    'createAutomationRuleUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: {
      name: validation.data.name,
      triggerEventType: validation.data.triggerEventType,
      conditions: validation.data.conditions,
      actions: validation.data.actions,
      enabled: validation.data.enabled,
      scheduleStart: validation.data.scheduleStart ?? null,
      scheduleEnd: validation.data.scheduleEnd ?? null,
      maxChainDepth: validation.data.maxChainDepth,
      createdBy: authContext.userId,
    },
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
        triggerEventType: rule.triggerEventType,
        conditions: rule.conditions,
        actions: rule.actions,
        enabled: rule.enabled,
        scheduleStart: rule.scheduleStart,
        scheduleEnd: rule.scheduleEnd,
        maxChainDepth: rule.maxChainDepth,
        executionCount: rule.executionCount,
        lastExecutedAt: rule.lastExecutedAt?.toISOString() ?? null,
        createdBy: rule.createdBy,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
