/**
 * GET    /api/automation/rules/:id — Get a single automation rule.
 * PATCH  /api/automation/rules/:id — Update an automation rule.
 * DELETE /api/automation/rules/:id — Delete an automation rule (disable).
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * Authorization:
 * - GET: iot:read (view automation rule details)
 * - PATCH: iot:manage (update automation rule)
 * - DELETE: iot:manage (delete automation rule)
 *
 * @see Requirements 39.1, 39.7
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
import type { AutomationRepository } from '@core/domains/automation/repositories/AutomationRepository';

// ---------------------------------------------------------------------------
// Input schema for PATCH
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

const updateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  triggerEventType: z
    .enum([
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
    ])
    .optional(),
  conditions: z.array(conditionSchema).min(1).optional(),
  actions: z.array(actionSchema).min(1).optional(),
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
// GET handler — Get single rule
// ---------------------------------------------------------------------------

/**
 * Gets a single automation rule by ID.
 *
 * AuthorizationContext is guaranteed to have iot:read permission
 * after withPermission validation.
 *
 * @see Permission Mapping: GET /api/automation/rules/:id → iot:read
 */
const handleGetRule: AuthorizedRouteHandler<void> = async (
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

  const automationRepository =
    container.resolve<AutomationRepository>('automationRepository');
  const result = await automationRepository.findRuleById(
    authContext.tenantId,
    id,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  if (!result.data) {
    return NextResponse.json(
      {
        code: 'COMMON_NOT_FOUND',
        message: 'Automation rule not found',
        correlationId,
      },
      { status: 404 },
    ) as NextResponse<void>;
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
    { status: 200 },
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// PATCH handler — Update rule
// ---------------------------------------------------------------------------

/**
 * Updates an automation rule.
 *
 * AuthorizationContext is guaranteed to have iot:manage permission
 * after withPermission validation.
 *
 * @see Permission Mapping: PATCH /api/automation/rules/:id → iot:manage
 */
const handleUpdateRule: AuthorizedRouteHandler<void> = async (
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

  const validation = updateRuleSchema.safeParse(body);
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

  const automationRepository =
    container.resolve<AutomationRepository>('automationRepository');
  const result = await automationRepository.updateRule(
    authContext.tenantId,
    id,
    validation.data,
  );

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
    { status: 200 },
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// DELETE handler — Disable/delete rule
// ---------------------------------------------------------------------------

/**
 * Deletes (disables) an automation rule.
 *
 * AuthorizationContext is guaranteed to have iot:manage permission
 * after withPermission validation.
 *
 * @see Permission Mapping: DELETE /api/automation/rules/:id → iot:manage
 */
const handleDeleteRule: AuthorizedRouteHandler<void> = async (
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

  const automationRepository =
    container.resolve<AutomationRepository>('automationRepository');
  const result = await automationRepository.disableRule(
    authContext.tenantId,
    id,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  return NextResponse.json(
    { data: { id, disabled: true } },
    { status: 200 },
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// Export route handlers with permission wrappers
// ---------------------------------------------------------------------------

/**
 * GET /api/automation/rules/:id — Get automation rule detail (requires iot:read)
 *
 * @see Permission Mapping: GET /api/automation/rules/:id → iot:read
 */
export const GET = withPermission(
  { permissions: ['iot:read'] },
  handleGetRule,
);

/**
 * PATCH /api/automation/rules/:id — Update automation rule (requires iot:manage)
 *
 * @see Permission Mapping: PATCH /api/automation/rules/:id → iot:manage
 */
export const PATCH = withPermission(
  { permissions: ['iot:manage'] },
  handleUpdateRule,
);

/**
 * DELETE /api/automation/rules/:id — Delete automation rule (requires iot:manage)
 *
 * @see Permission Mapping: DELETE /api/automation/rules/:id → iot:manage
 */
export const DELETE = withPermission(
  { permissions: ['iot:manage'] },
  handleDeleteRule,
);
