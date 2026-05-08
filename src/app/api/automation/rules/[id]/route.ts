/**
 * GET    /api/automation/rules/:id — Get a single automation rule.
 * PATCH  /api/automation/rules/:id — Update an automation rule.
 * DELETE /api/automation/rules/:id — Delete an automation rule (disable).
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 39.1, 39.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
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

export async function GET(
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

  const automationRepository =
    container.resolve<AutomationRepository>('automationRepository');
  const result = await automationRepository.findRuleById(
    authContext.tenantId,
    id,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  if (!result.data) {
    return NextResponse.json(
      {
        code: 'COMMON_NOT_FOUND',
        message: 'Automation rule not found',
        correlationId,
      },
      { status: 404 },
    );
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
  );
}

// ---------------------------------------------------------------------------
// PATCH handler — Update rule
// ---------------------------------------------------------------------------

export async function PATCH(
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

  const validation = updateRuleSchema.safeParse(body);
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

  const automationRepository =
    container.resolve<AutomationRepository>('automationRepository');
  const result = await automationRepository.updateRule(
    authContext.tenantId,
    id,
    validation.data,
  );

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
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// DELETE handler — Disable/delete rule
// ---------------------------------------------------------------------------

export async function DELETE(
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

  const automationRepository =
    container.resolve<AutomationRepository>('automationRepository');
  const result = await automationRepository.disableRule(
    authContext.tenantId,
    id,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    { data: { id, disabled: true } },
    { status: 200 },
  );
}
