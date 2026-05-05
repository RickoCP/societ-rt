/**
 * PATCH /api/security/incidents/:id — Update an incident report.
 * DELETE /api/security/incidents/:id — Delete an incident report.
 *
 * Only admin roles can edit/delete.
 *
 * @see Requirements 12.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import { UserRole } from '@core/protocols';
import type { PrismaClient } from '@prisma/client';

const ADMIN_ROLES = [UserRole.Super_Admin, UserRole.Ketua_RT, UserRole.Pengurus, UserRole.Security_Guard];

const updateSchema = z.object({
  description: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  severityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  if (!ADMIN_ROLES.includes(authContext.role as UserRole)) {
    return NextResponse.json(
      { code: 'AUTH_INSUFFICIENT_ROLE', message: 'You do not have permission.', correlationId },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = updateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid input', correlationId },
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const incident = await prisma.incidentReport.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!incident) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Incident not found', correlationId },
        { status: 404 },
      );
    }

    const updated = await prisma.incidentReport.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json({
      data: { id: updated.id, description: updated.description, location: updated.location, severityLevel: updated.severityLevel },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  if (!ADMIN_ROLES.includes(authContext.role as UserRole)) {
    return NextResponse.json(
      { code: 'AUTH_INSUFFICIENT_ROLE', message: 'You do not have permission.', correlationId },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const incident = await prisma.incidentReport.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!incident) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Incident not found', correlationId },
        { status: 404 },
      );
    }

    await prisma.incidentReport.delete({ where: { id } });

    return NextResponse.json({ data: { id, deleted: true } });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
