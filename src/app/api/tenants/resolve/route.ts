/**
 * GET /api/tenants/resolve?subdomain=xxx — Resolve tenant by subdomain.
 *
 * Public endpoint (no auth required) — used by login page to get tenantId
 * from the subdomain before authentication.
 *
 * @see Requirements 1.3, 2.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import type { TenantRepository } from '@core/domains/tenant/repositories/TenantRepository';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const subdomain = request.nextUrl.searchParams.get('subdomain');

  if (!subdomain) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'subdomain query parameter is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  const tenantRepository =
    container.resolve<TenantRepository>('tenantRepository');
  const result = await tenantRepository.findBySubdomain(subdomain);

  if (!result.success) {
    return NextResponse.json(
      {
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
        correlationId,
      },
      { status: 404 },
    );
  }

  if (!result.data) {
    return NextResponse.json(
      {
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
        correlationId,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      data: {
        id: result.data.id,
        name: result.data.name,
        subdomain: result.data.subdomain,
      },
    },
    { status: 200 },
  );
}
