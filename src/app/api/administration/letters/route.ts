/**
 * POST /api/administration/letters — Submit a new letter request.
 * GET  /api/administration/letters — List letter requests for the tenant.
 *
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 13.1
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler withPermission Migration
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

/**
 * Handler for POST /api/administration/letters
 * Creates a new letter request.
 *
 * Permission: admin:write (create letter request)
 */
const handlePostLetterRequest: AuthorizedRouteHandler = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

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

  // 2. Execute use case via DI
  const useCase = container.resolve<SubmitLetterRequestUseCase>(
    'submitLetterRequestUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: validation.data,
  });

  // 3. Map result to safe response
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
};

// ---------------------------------------------------------------------------
// GET handler — List letter requests
// ---------------------------------------------------------------------------

/**
 * Handler for GET /api/administration/letters
 * Lists letter requests for the tenant.
 *
 * Permission: admin:read (list letters)
 */
const handleGetLetterRequests: AuthorizedRouteHandler = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract pagination params
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get('pageSize') ?? '20')),
  );

  // 2. Query repository — admins see all, regular users see only their own
  const administrationRepository =
    container.resolve<AdministrationRepository>('administrationRepository');

  const ADMIN_ROLES = ['Super_Admin', 'Ketua_RT', 'PLATFORM_ADMIN', 'RT_ADMIN'];
  const isAdmin = ADMIN_ROLES.includes(authContext.role);

  if (isAdmin) {
    // Admin sees all letters in the tenant
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

  // Regular users only see their own letters
  const result = await administrationRepository.findByUser(
    authContext.tenantId,
    authContext.userId,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.map((lr) => ({
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
        total: result.data.length,
        page: 1,
        pageSize: result.data.length,
      },
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exports with withPermission wrapper
// ---------------------------------------------------------------------------

/**
 * POST /api/administration/letters
 * Permission: admin:write — Create new letter request
 */
export const POST = withPermission(
  { permissions: ['admin:write'] },
  handlePostLetterRequest,
);

/**
 * GET /api/administration/letters
 * Permission: admin:read — List letter requests
 */
export const GET = withPermission(
  { permissions: ['admin:read'] },
  handleGetLetterRequests,
);
