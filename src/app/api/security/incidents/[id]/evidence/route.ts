/**
 * POST /api/security/incidents/:id/evidence — Attach evidence URLs to an incident.
 *
 * Permission: security:manage
 * Validates evidence URLs and delegates to AttachEvidenceUseCase which
 * enforces the maximum evidence file limit (5 total).
 *
 * BFF pattern: withPermission wrapper → validate input → execute use case → return safe response.
 *
 * @see Requirements 32.6, 32.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { AttachEvidenceUseCase } from '@core/domains/incident/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const attachEvidenceSchema = z.object({
  evidenceUrls: z
    .array(z.string().url().max(2048))
    .min(1, 'At least one evidence URL is required')
    .max(5, 'Maximum 5 evidence URLs per request'),
});

// ---------------------------------------------------------------------------
// POST handler — Attach evidence
// ---------------------------------------------------------------------------

async function handleAttachEvidence(
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await context!.params!;

  // 1. Parse and validate input
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

  const validation = attachEvidenceSchema.safeParse(body);
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

  // 2. Execute use case via DI
  const useCase = container.resolve<AttachEvidenceUseCase>('attachEvidenceUseCase');
  const result = await useCase.execute({
    authContext,
    incidentId: id,
    evidenceUrls: validation.data.evidenceUrls,
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const incident = result.data;

  return NextResponse.json(
    {
      data: {
        id: incident.id,
        title: incident.title,
        evidenceUrls: incident.evidenceUrls,
        updatedAt: incident.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}

export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleAttachEvidence,
);
