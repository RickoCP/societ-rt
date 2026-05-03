/**
 * POST /api/privacy/consent — Record user consent.
 *
 * @see Requirements 27.3, 27.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { PrivacyRepository } from '@core/domains/privacy/repositories/PrivacyRepository';

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

  const { version } = body as { version?: string };
  if (!version || typeof version !== 'string') {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Consent version is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  const repo = container.resolve<PrivacyRepository>('privacyRepository');
  const result = await repo.recordConsent(
    authContext.tenantId,
    authContext.userId,
    version,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: {
        userId: result.data.userId,
        consentVersion: result.data.consentVersion,
        consentTimestamp: result.data.consentTimestamp.toISOString(),
      },
    },
    { status: 200 },
  );
}
