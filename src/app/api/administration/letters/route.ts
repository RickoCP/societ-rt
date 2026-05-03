/**
 * POST /api/administration/letters — Submit a new letter request.
 * GET  /api/administration/letters — List letter requests for the tenant.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 13.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { SubmitLetterRequestUseCase } from '@core/domains/administration/usecases';
import type { AdministrationRepository } from '@core/domains/administration/repositories/AdministrationRepository';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const submitLetterSchema = z.object({
  letterType: z.enum(['surat_pengantar', 'domisili', 'SKTM']),
  purpose: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST handler — Submit letter request
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Parse and validate input
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

  const validation = submitLetterSchema.safeParse(body);
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

  // 3. Execute use case via DI
  const useCase = container.resolve<SubmitLetterRequestUseCase>(
    'submitLetterRequestUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: validation.data,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const letterRequest = result.data;

  return NextResponse.json(
    {
      data: {
        id: letterRequest.id,
        userId: letterRequest.userId,
        letterType: letterRequest.letterType,
        purpose: letterRequest.purpose,
        status: letterRequest.status,
        createdAt: letterRequest.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET handler — List letter requests
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Extract pagination params
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get('pageSize') ?? '20')),
  );

  // 3. Query repository for letter requests
  const administrationRepository =
    container.resolve<AdministrationRepository>('administrationRepository');
  const result = await administrationRepository.findByTenant(
    authContext.tenantId,
    page,
    pageSize,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.data.map((lr) => ({
        id: lr.id,
        userId: lr.userId,
        letterType: lr.letterType,
        purpose: lr.purpose,
        status: lr.status,
        rejectionReason: lr.rejectionReason,
        documentUrl: lr.documentUrl,
        decidedBy: lr.decidedBy,
        decidedAt: lr.decidedAt?.toISOString() ?? null,
        createdAt: lr.createdAt.toISOString(),
      })),
      pagination: {
        total: result.data.total,
        page: result.data.page,
        pageSize: result.data.pageSize,
      },
    },
    { status: 200 },
  );
}
