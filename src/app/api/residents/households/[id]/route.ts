/**
 * GET /api/residents/households/:id — Get household detail with residents.
 * PATCH /api/residents/households/:id — Update household data.
 * DELETE /api/residents/households/:id — Remove a household and its residents.
 *
 * Permissions:
 * - GET: household:read
 * - PATCH: household:manage
 * - DELETE: household:manage
 *
 * BFF pattern: withPermission wrapper → verify ownership → execute → return safe response.
 *
 * @see Requirements 5.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import { MembershipRole } from '@core/domains/membership/types';
import type { PrismaClient } from '@prisma/client';

const EDIT_ROLES: readonly MembershipRole[] = [
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
  MembershipRole.RT_ADMIN,
];

// ---------------------------------------------------------------------------
// GET — Household detail with residents
// ---------------------------------------------------------------------------

const handleGetHousehold: AuthorizedRouteHandler = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const householdId = params?.id;

  if (!householdId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Missing household ID', correlationId },
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const household = await prisma.household.findFirst({
      where: { id: householdId, tenantId: authContext.tenantId },
      include: {
        residents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            nik: true,
            dateOfBirth: true,
            gender: true,
            phone: true,
            status: true,
            categories: true,
            emergencyContactName: true,
            emergencyContactPhone: true,
            emergencyContactRelationship: true,
          },
        },
      },
    });

    if (!household) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Household not found', correlationId },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        id: household.id,
        householdNumber: household.householdNumber,
        address: household.address,
        block: household.block,
        latitude: household.latitude,
        longitude: household.longitude,
        residents: household.residents.map(r => ({
          ...r,
          dateOfBirth: r.dateOfBirth.toISOString().slice(0, 10),
        })),
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

export const GET = withPermission(
  { permissions: ['household:read'] },
  handleGetHousehold,
);

// ---------------------------------------------------------------------------
// PATCH — Update household
// ---------------------------------------------------------------------------

const updateHouseholdSchema = z.object({
  householdNumber: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  block: z.string().optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

const handleUpdateHousehold: AuthorizedRouteHandler = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const householdId = params?.id;

  if (!householdId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Missing household ID', correlationId },
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

  const validation = updateHouseholdSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid input', correlationId },
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const household = await prisma.household.findFirst({
      where: { id: householdId, tenantId: authContext.tenantId },
    });

    if (!household) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Household not found', correlationId },
        { status: 404 },
      );
    }

    // Check permission: admin roles OR warga in this household
    const isAdminRole = EDIT_ROLES.includes(authContext.role);
    const isHouseholdMember = await prisma.resident.findFirst({
      where: { householdId, tenantId: authContext.tenantId },
      select: { id: true },
    });

    if (!isAdminRole && !isHouseholdMember) {
      return NextResponse.json(
        { code: 'AUTH_INSUFFICIENT_ROLE', message: 'You do not have permission to edit this household.', correlationId },
        { status: 403 },
      );
    }

    const updated = await prisma.household.update({
      where: { id: householdId },
      data: validation.data,
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        householdNumber: updated.householdNumber,
        address: updated.address,
        block: updated.block,
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

export const PATCH = withPermission(
  { permissions: ['household:manage'] },
  handleUpdateHousehold,
);

// ---------------------------------------------------------------------------
// DELETE — Remove household
// ---------------------------------------------------------------------------

const handleDeleteHousehold: AuthorizedRouteHandler = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract route param
  const params = await routeContext?.params;
  const householdId = params?.id;

  if (!householdId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Missing household ID', correlationId },
      { status: 400 },
    );
  }

  // 2. Delete household (cascade deletes residents via DB constraint)
  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    // Verify household belongs to the same tenant
    const household = await prisma.household.findFirst({
      where: { id: householdId, tenantId: authContext.tenantId },
    });

    if (!household) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Household not found', correlationId },
        { status: 404 },
      );
    }

    // Delete residents first, then household
    await prisma.resident.deleteMany({ where: { householdId } });
    await prisma.household.delete({ where: { id: householdId } });

    return NextResponse.json(
      { data: { id: householdId, deleted: true } },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

export const DELETE = withPermission(
  { permissions: ['household:manage'] },
  handleDeleteHousehold,
);
