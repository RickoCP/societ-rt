/**
 * POST /api/residents — Add a new resident to a household.
 * GET  /api/residents — List residents with filters and pagination.
 *
 * BFF pattern: validate input → resolve auth context → execute use case / query → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 5.2, 5.3, 5.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse, type ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { AddResidentUseCase } from '@core/domains/resident/usecases';
import type { ResidentRepository } from '@core/domains/resident/repositories/ResidentRepository';
import type { ResidentCategory, ResidencyStatus } from '@core/domains/resident/entities';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

// Custom UUID validation that accepts any UUID format including nil-variant UUIDs
// Standard Zod .uuid() rejects UUIDs with version digit = 0 (like seed data)
const uuidLike = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'Invalid UUID format'
);

const addResidentSchema = z.object({
  householdId: uuidLike,
  name: z.string().min(1, 'Name is required'),
  nik: z.string().length(16, 'NIK must be exactly 16 characters'),
  dateOfBirth: z.string().refine(
    (val) => !isNaN(new Date(val).getTime()),
    'Invalid date format',
  ),
  gender: z.enum(['male', 'female']),
  phone: z.string().optional(),
  status: z.enum(['tetap', 'kontrak', 'kos', 'pindah']),
  categories: z
    .array(z.enum(['lansia', 'balita', 'disabilitas']))
    .optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface ResidentResponse {
  data: {
    id: string;
    householdId: string;
    name: string;
    nik: string;
    dateOfBirth: string;
    gender: string;
    phone: string | null;
    status: string;
    categories: string[];
    createdAt: string;
  };
}

interface ResidentListResponse {
  data: Array<{
    id: string;
    householdId: string;
    name: string;
    nik: string;
    dateOfBirth: string;
    gender: string;
    phone: string | null;
    status: string;
    categories: string[];
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// POST handler — Add resident
// ---------------------------------------------------------------------------

const handleAddResident: AuthorizedRouteHandler<ResidentResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<ResidentResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Parse and validate input
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

  const validation = addResidentSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Validation failed',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  // Execute use case via DI
  const useCase = container.resolve<AddResidentUseCase>('addResidentUseCase');
  const result = await useCase.execute({
    authContext,
    data: {
      ...validation.data,
      dateOfBirth: new Date(validation.data.dateOfBirth),
    },
  });

  // Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const resident = result.data;

  return NextResponse.json(
    {
      data: {
        id: resident.id,
        householdId: resident.householdId,
        name: resident.name,
        nik: resident.nik,
        dateOfBirth: resident.dateOfBirth.toISOString(),
        gender: resident.gender,
        phone: resident.phone,
        status: resident.status,
        categories: resident.categories,
        createdAt: resident.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

// ---------------------------------------------------------------------------
// GET handler — List residents
// ---------------------------------------------------------------------------

const handleListResidents: AuthorizedRouteHandler<ResidentListResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<ResidentListResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Parse query params
  const searchParams = request.nextUrl.searchParams;

  const householdId = searchParams.get('householdId') ?? undefined;
  const status = searchParams.get('status') as ResidencyStatus | undefined;
  const search = searchParams.get('search') ?? undefined;
  const pageParam = searchParams.get('page');
  const pageSizeParam = searchParams.get('pageSize');

  const page = pageParam ? parseInt(pageParam, 10) : undefined;
  const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : undefined;

  // Parse categories from comma-separated query param
  const categoriesParam = searchParams.get('categories');
  const categories: ResidentCategory[] | undefined = categoriesParam
    ? (categoriesParam.split(',').filter((c) => c.trim().length > 0) as ResidentCategory[])
    : undefined;

  // Query repository directly for read operations
  const residentRepository = container.resolve<ResidentRepository>(
    'residentRepository',
  );
  const result = await residentRepository.findByTenant(
    authContext.tenantId,
    {
      householdId,
      status,
      categories,
      search,
      page,
      pageSize,
    },
  );

  // Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const paginated = result.data;

  return NextResponse.json(
    {
      data: paginated.data.map((r) => ({
        id: r.id,
        householdId: r.householdId,
        name: r.name,
        nik: r.nik,
        dateOfBirth: r.dateOfBirth.toISOString(),
        gender: r.gender,
        phone: r.phone,
        status: r.status,
        categories: r.categories,
        createdAt: r.createdAt.toISOString(),
      })),
      total: paginated.total,
      page: paginated.page,
      pageSize: paginated.pageSize,
    },
    { status: 200 },
  );
};

// Export wrapped handlers with required permissions
export const POST = withPermission(
  { permissions: ['resident:write'] },
  handleAddResident,
);

export const GET = withPermission(
  { permissions: ['resident:read'] },
  handleListResidents,
);
