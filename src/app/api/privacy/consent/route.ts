/**
 * POST /api/privacy/consent — Record user consent.
 *
 * BFF pattern: resolve auth → validate input → record consent → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 27.3, 27.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrivacyRepository } from '@core/domains/privacy/repositories/PrivacyRepository';

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface ConsentResponse {
  data: {
    userId: string;
    consentVersion: string;
    consentTimestamp: string;
  };
}

// ---------------------------------------------------------------------------
// POST handler — Record consent
// ---------------------------------------------------------------------------

const handleRecordConsent: AuthorizedRouteHandler<ConsentResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<ConsentResponse>> => {
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
      } as unknown as ConsentResponse,
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
      } as unknown as ConsentResponse,
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
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<ConsentResponse>;
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
};

// Export wrapped handler with privacy:manage permission
export const POST = withPermission(
  { permissions: ['privacy:manage'] },
  handleRecordConsent,
);
