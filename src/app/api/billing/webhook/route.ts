/**
 * POST /api/billing/webhook — Handle payment gateway webhook.
 *
 * Webhook endpoints validate the gateway signature instead of JWT auth.
 *
 * @see Requirements 29.4, 29.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import type { HandlePaymentWebhookUseCase } from '@core/domains/billing/usecases';

const webhookSchema = z.object({
  gatewayTransactionId: z.string().min(1),
  invoiceId: z.string().min(1),
  tenantId: z.string().min(1),
  status: z.enum(['pending', 'paid', 'failed']),
  amount: z.number().positive(),
  signature: z.string().min(1),
  gatewayResponse: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = request.headers.get('x-correlation-id') ?? generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = webhookSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', fields: formatZodErrors(validation.error), correlationId },
      { status: 400 },
    );
  }

  const useCase = container.resolve<HandlePaymentWebhookUseCase>('handlePaymentWebhookUseCase');
  const result = await useCase.execute({ payload: validation.data });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ message: 'Webhook processed' }, { status: 200 });
}
