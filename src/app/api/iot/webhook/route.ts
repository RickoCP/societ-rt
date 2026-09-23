/**
 * POST /api/iot/webhook — Receive Tuya IoT webhook events.
 *
 * This endpoint does NOT require authentication. Security is enforced via
 * HMAC-SHA256 signature validation performed by the ProcessWebhookEventUseCase.
 *
 * @see Requirements 38.4, 38.5, 38.11, 41.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { normalizeTuyaEventType } from '@infrastructure/iot/tuyaEventMapper';
import type { ProcessWebhookEventUseCase } from '@core/domains/iot/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const webhookSchema = z.object({
  payload: z.string().min(1, 'payload is required'),
  signature: z.string().min(1, 'signature is required'),
  timestamp: z.string().min(1, 'timestamp is required'),
  eventType: z.string().min(1, 'eventType is required'),
  tuyaDeviceId: z.string().min(1, 'tuyaDeviceId is required'),
  eventData: z.record(z.string(), z.unknown()).default({}),
});

// ---------------------------------------------------------------------------
// POST handler — Process webhook event
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate input (no auth required — signature validation is in use case)
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

  const validation = webhookSchema.safeParse(body);
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

  // 2. Normalize raw Tuya payloads (e.g. doorcontact_state) into the canonical
  //    domain event type. Non-door events pass through unchanged.
  const normalizedEventType = normalizeTuyaEventType({
    eventType: validation.data.eventType,
    eventData: validation.data.eventData,
  });

  // 3. Execute use case via DI (signature validation happens inside)
  const useCase = container.resolve<ProcessWebhookEventUseCase>(
    'processWebhookEventUseCase',
  );
  const result = await useCase.execute({
    data: {
      ...validation.data,
      eventType: normalizedEventType as Parameters<
        ProcessWebhookEventUseCase['execute']
      >[0]['data']['eventType'],
    },
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const deviceEvent = result.data;

  return NextResponse.json(
    {
      data: {
        id: deviceEvent.id,
        deviceId: deviceEvent.deviceId,
        eventType: deviceEvent.eventType,
        isSharedSecurity: deviceEvent.isSharedSecurity,
        createdAt: deviceEvent.createdAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
