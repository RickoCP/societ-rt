/**
 * PATCH /api/residents/:id — Update a resident's residency status.
 * PUT   /api/residents/:id — Edit resident data.
 * DELETE /api/residents/:id — Remove a resident.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 5.3, 5.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse, type ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { UpdateResidentStatusUseCase } from '@core/domains/resident/usecases';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const updateStatusSchema = z.object({
  status: z.enum(['tetap', 'kontrak', 'kos', 'pindah']),
});

const updateResidentSchema = z.object({
  name: z.string().min(1).optional(),
  nik: z.string().length(16).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female']).optional(),
  phone: z.string().optional().nullable(),
  status: z.enum(['tetap', 'kontrak', 'kos', 'pindah']).optional(),
  categories: z.array(z.string()).optional(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  emergencyContactRelationship: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface UpdateStatusResponse {
  data: {
    id: string;
    name: string;
    status: string;
    updatedAt: string;
  };
}

interface DeleteResponse {
  data: {
    id: string;
    deleted: boolean;
  };
}

interface UpdateResidentResponse {
  data: {
    id: string;
    name: string;
    nik: string;
    dateOfBirth: string;
    gender: string;
    phone: string | null;
    status: string;
    categories: string[];
  };
}

// ---------------------------------------------------------------------------
// PATCH handler — Update resident status
// ---------------------------------------------------------------------------

const handlePatchStatus: AuthorizedRouteHandler<UpdateStatusResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<UpdateStatusResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Extract route param
  const params = await routeContext?.params;
  const residentId = params?.id;

  if (!residentId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Resident ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

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

  const validation = updateStatusSchema.safeParse(body);
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
  const useCase = container.resolve<UpdateResidentStatusUseCase>(
    'updateResidentStatusUseCase',
  );
  const result = await useCase.execute({
    authContext,
    residentId,
    status: validation.data.status,
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
        name: resident.name,
        status: resident.status,
        updatedAt: resident.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// DELETE handler — Remove a resident
// ---------------------------------------------------------------------------

const handleDeleteResident: AuthorizedRouteHandler<DeleteResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<DeleteResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Extract route param
  const params = await routeContext?.params;
  const residentId = params?.id;

  if (!residentId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Resident ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  // Delete resident via Prisma
  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    // Verify resident belongs to the same tenant
    const resident = await prisma.resident.findFirst({
      where: {
        id: residentId,
        household: { tenantId: authContext.tenantId },
      },
    });

    if (!resident) {
      return NextResponse.json(
        {
          code: 'COMMON_NOT_FOUND',
          message: 'Resident not found',
          correlationId,
        },
        { status: 404 },
      );
    }

    await prisma.resident.delete({ where: { id: residentId } });

    return NextResponse.json(
      { data: { id: residentId, deleted: true } },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Internal server error',
        correlationId,
      },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// PUT handler — Edit resident data
// ---------------------------------------------------------------------------

const handlePutResident: AuthorizedRouteHandler<UpdateResidentResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<UpdateResidentResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Extract route param
  const params = await routeContext?.params;
  const residentId = params?.id;

  if (!residentId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Resident ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = updateResidentSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Validation failed', fields: formatZodErrors(validation.error), correlationId },
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    // Find resident and verify tenant
    const resident = await prisma.resident.findFirst({
      where: { id: residentId, tenantId: authContext.tenantId, deletedAt: null },
      select: { id: true, householdId: true },
    });

    if (!resident) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Resident not found', correlationId },
        { status: 404 },
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    const d = validation.data;
    if (d.name !== undefined) updateData.name = d.name;
    if (d.nik !== undefined) updateData.nik = d.nik;
    if (d.dateOfBirth !== undefined) updateData.dateOfBirth = new Date(d.dateOfBirth);
    if (d.gender !== undefined) updateData.gender = d.gender;
    if (d.phone !== undefined) updateData.phone = d.phone;
    if (d.status !== undefined) updateData.status = d.status;
    if (d.categories !== undefined) updateData.categories = d.categories;
    if (d.emergencyContactName !== undefined) updateData.emergencyContactName = d.emergencyContactName;
    if (d.emergencyContactPhone !== undefined) updateData.emergencyContactPhone = d.emergencyContactPhone;
    if (d.emergencyContactRelationship !== undefined) updateData.emergencyContactRelationship = d.emergencyContactRelationship;

    const updated = await prisma.resident.update({
      where: { id: residentId },
      data: updateData,
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        name: updated.name,
        nik: updated.nik,
        dateOfBirth: updated.dateOfBirth.toISOString().slice(0, 10),
        gender: updated.gender,
        phone: updated.phone,
        status: updated.status,
        categories: updated.categories,
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

// Export wrapped handlers with required permissions
export const PATCH = withPermission(
  { permissions: ['resident:write'] },
  handlePatchStatus,
);

export const DELETE = withPermission(
  { permissions: ['resident:write'] },
  handleDeleteResident,
);

export const PUT = withPermission(
  { permissions: ['resident:write'] },
  handlePutResident,
);
