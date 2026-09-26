/**
 * GET  /api/automation/rules — List automation rules for the tenant.
 * POST /api/automation/rules — Create a new automation rule.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * Authorization:
 * - GET: iot:read (list automation rules)
 * - POST: iot:manage (create automation rules)
 *
 * @see Requirements 39.1, 39.7, 39.8
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
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

/**
 * Lists all automation rules for the current tenant.
 *
 * AuthorizationContext is guaranteed to have iot:read permission
 * after withPermission validation.
 *
 * @see Permission Mapping: GET /api/automation/rules → iot:read
 */
const handleListRules: AuthorizedRouteHandler<void> = async (
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

  const automationRepository =
    container.resolve<AutomationRepository>('automationRepository');
  const result = await automationRepository.findByTenant(
    authContext.tenantId,
    page,
    pageSize,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
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
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// POST handler — Create automation rule
// ---------------------------------------------------------------------------

/**
 * Creates a new automation rule.
 *
 * AuthorizationContext is guaranteed to have iot:manage permission
 * after withPermission validation.
 *
 * @see Permission Mapping: POST /api/automation/rules → iot:manage
 */
const handleCreateRule: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

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
    ) as NextResponse<void>;
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
    ) as NextResponse<void>;
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
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
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
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// Export route handlers with permission wrappers
// ---------------------------------------------------------------------------

/**
 * GET /api/automation/rules — List automation rules (requires iot:read)
 *
 * @see Permission Mapping: GET /api/automation/rules → iot:read
 */
export const GET = withPermission(
  { permissions: ['iot:read'] },
  handleListRules,
);

/**
 * POST /api/automation/rules — Create automation rule (requires iot:manage)
 *
 * @see Permission Mapping: POST /api/automation/rules → iot:manage
 */
export const POST = withPermission(
  { permissions: ['iot:manage'] },
  handleCreateRule,
);
