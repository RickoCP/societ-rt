/**
 * GET /api/tenants — Lists all tenants (paginated).
 * POST /api/tenants — Registers a new tenant (RT/RW community).
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 * This is a protected endpoint — requires platform-level permissions (PLATFORM_ADMIN).
 *
 * @see Requirements 2.1, 2.2, 2.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { RegisterTenantUseCase } from '@core/domains/tenant/usecases';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const createTenantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  rtRwNumber: z.string().min(1, 'RT/RW number is required'),
  region: z.string().min(1, 'Region is required'),
  address: z.string().min(1, 'Address is required'),
  contactPerson: z.string().min(1, 'Contact person is required'),
});

// ---------------------------------------------------------------------------
// GET — List tenants (PLATFORM_ADMIN only)
// ---------------------------------------------------------------------------

const handleGetTenants: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  _authContext: AuthorizationContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1);
  const pageSize = 20;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          subdomain: true,
          status: true,
          rtRwNumber: true,
          region: true,
          sirenDeviceId: true,
          createdAt: true,
        },
      }),
      prisma.tenant.count(),
    ]);

    return NextResponse.json({
      data: tenants.map(t => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

export const GET = withPermission(
  { permissions: ['platform:provision'] },
  handleGetTenants,
);

// ---------------------------------------------------------------------------
// POST — Create tenant (PLATFORM_ADMIN only)
// ---------------------------------------------------------------------------

const handleCreateTenant: AuthorizedRouteHandler<unknown> = async (
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

  const validation = createTenantSchema.safeParse(body);
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

  // 2. Extract client IP for audit
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined;

  // 3. Execute use case via DI
  const registerTenantUseCase =
    container.resolve<RegisterTenantUseCase>('registerTenantUseCase');
  const result = await registerTenantUseCase.execute({
    data: validation.data,
    actorUserId: authContext.userId,
    ipAddress,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const tenant = result.data;

  return NextResponse.json(
    {
      data: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        rtRwNumber: tenant.rtRwNumber,
        region: tenant.region,
        address: tenant.address,
        contactPerson: tenant.contactPerson,
        status: tenant.status,
        createdAt: tenant.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

export const POST = withPermission(
  { permissions: ['platform:provision'] },
  handleCreateTenant,
);
