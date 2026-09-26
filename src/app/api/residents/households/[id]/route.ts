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
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import { UserRole } from '@core/protocols';
import type { PrismaClient } from '@/generated/prisma/client';

const EDIT_ROLES = [UserRole.Super_Admin, UserRole.Ketua_RT, UserRole.Pengurus];

// ---------------------------------------------------------------------------
// GET — Household detail with residents
// ---------------------------------------------------------------------------

async function handleGetHousehold(
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id: householdId } = await context!.params!;

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
}

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

async function handleUpdateHousehold(
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id: householdId } = await context!.params!;

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
    const isAdminRole = EDIT_ROLES.includes(authContext.role as UserRole);
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
}

export const PATCH = withPermission(
  { permissions: ['household:manage'] },
  handleUpdateHousehold,
);

// ---------------------------------------------------------------------------
// DELETE — Remove household
// ---------------------------------------------------------------------------

async function handleDeleteHousehold(
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract route param
  const { id: householdId } = await context!.params!;

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
}

export const DELETE = withPermission(
  { permissions: ['household:manage'] },
  handleDeleteHousehold,
);
