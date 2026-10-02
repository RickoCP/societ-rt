/**
 * OrgUnit Tree API Route Handler
 *
 * GET /api/admin/orgunit/tree - Fetch OrgUnit hierarchy tree
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * Authorization:
 * - GET: orgunit:read (view OrgUnit hierarchy)
 *
 * @see Requirements 7.4-7.6 (OrgUnit Hierarchy Tree View)
 * @see 11-bff-pattern.md Steering
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GetOrgUnitTreeUseCase } from '@core/domains/orgunit/usecases';

// ---------------------------------------------------------------------------
// GET handler — Fetch OrgUnit hierarchy tree
// ---------------------------------------------------------------------------

const handleGetOrgUnitTree: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse optional query parameters for tree options
  const url = new URL(request.url);
  const includeMemberCounts = url.searchParams.get('includeMemberCounts') === 'true';
  const includeChildCounts = url.searchParams.get('includeChildCounts') === 'true';

  // 2. Execute use case via DI
  const useCase = container.resolve<GetOrgUnitTreeUseCase>('getOrgUnitTreeUseCase');
  const result = await useCase.execute({
    tenantId: authContext.tenantId,
    actorOrgUnitId: authContext.orgUnitId,
    hasReadPermission: authContext.permissions.has('orgunit:read'),
    options: {
      includeMemberCounts,
      includeChildCounts,
    },
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  return NextResponse.json(
    {
      data: result.data,
    },
    { status: 200 },
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// Export route handler with permission wrapper
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/orgunit/tree — Fetch OrgUnit hierarchy tree (requires orgunit:read)
 */
export const GET = withPermission(
  { permissions: ['orgunit:read'] },
  handleGetOrgUnitTree,
);
