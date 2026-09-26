/**
 * POST /api/billing/invoices — Generate a new invoice.
 * GET  /api/billing/invoices — List invoices for the tenant.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * @see Requirements 29.1
 * @see Multi-Tenant Integration Cutover — Task 4.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GenerateInvoiceUseCase } from '@core/domains/billing/usecases';
import type { BillingRepository } from '@core/domains/billing/repositories/BillingRepository';

const createInvoiceSchema = z.object({
  planName: z.string().min(1, 'Plan name is required'),
  amount: z.number().positive('Amount must be positive'),
  billingPeriodStart: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'Invalid date'),
  billingPeriodEnd: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'Invalid date'),
  dueDate: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'Invalid date'),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
});

interface InvoiceCreateResponse {
  data: {
    id: string;
    planName: string;
    amount: number;
    status: string;
    dueDate: string;
    idempotencyKey: string;
    createdAt: string;
  };
}

interface InvoiceListResponse {
  data: Array<{
    id: string;
    planName: string;
    amount: number;
    status: string;
    dueDate: string;
    paidAt: string | null;
    retryCount: number;
    createdAt: string;
  }>;
}

const handleCreateInvoice: AuthorizedRouteHandler<InvoiceCreateResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<InvoiceCreateResponse>> => {
  const correlationId = request.headers.get('x-correlation-id') ?? generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    ) as NextResponse<InvoiceCreateResponse>;
  }

  const validation = createInvoiceSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', fields: formatZodErrors(validation.error), correlationId },
      { status: 400 },
    ) as NextResponse<InvoiceCreateResponse>;
  }

  const useCase = container.resolve<GenerateInvoiceUseCase>('generateInvoiceUseCase');
  const result = await useCase.execute({
    authContext,
    data: {
      ...validation.data,
      billingPeriodStart: new Date(validation.data.billingPeriodStart),
      billingPeriodEnd: new Date(validation.data.billingPeriodEnd),
      dueDate: new Date(validation.data.dueDate),
    },
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<InvoiceCreateResponse>;
  }

  const inv = result.data;
  return NextResponse.json(
    {
      data: {
        id: inv.id,
        planName: inv.planName,
        amount: inv.amount,
        status: inv.status,
        dueDate: inv.dueDate.toISOString(),
        idempotencyKey: inv.idempotencyKey,
        createdAt: inv.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

const handleGetInvoices: AuthorizedRouteHandler<InvoiceListResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<InvoiceListResponse>> => {
  const correlationId = request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const statusParam = request.nextUrl.searchParams.get('status') as 'pending' | 'paid' | 'failed' | null;

  const billingRepository = container.resolve<BillingRepository>('billingRepository');
  const result = await billingRepository.findInvoicesByTenant(authContext.tenantId, statusParam ?? undefined);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<InvoiceListResponse>;
  }

  return NextResponse.json(
    {
      data: result.data.map((inv) => ({
        id: inv.id,
        planName: inv.planName,
        amount: inv.amount,
        status: inv.status,
        dueDate: inv.dueDate.toISOString(),
        paidAt: inv.paidAt?.toISOString() ?? null,
        retryCount: inv.retryCount,
        createdAt: inv.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
};

export const POST = withPermission(
  { permissions: ['finance:write'] },
  handleCreateInvoice,
);

export const GET = withPermission(
  { permissions: ['finance:read'] },
  handleGetInvoices,
);
