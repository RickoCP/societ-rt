/**
 * GET /api/security/incidents/:id — Get incident detail.
 * PATCH /api/security/incidents/:id — Update an incident report.
 * DELETE /api/security/incidents/:id — Delete an incident report.
 *
 * @see Requirements 32.1, 32.2, 32.7
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { IncidentRepository } from '@core/domains/incident/repositories/IncidentRepository';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// GET handler — Get incident detail
// ---------------------------------------------------------------------------

const handleGetIncident: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract incident ID from route params
  const { id } = await routeContext?.params ?? { id: '' };

  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Incident ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 2. Query repository for incident detail
  const incidentRepository =
    container.resolve<IncidentRepository>('incidentRepository');
  const result = await incidentRepository.findById(authContext.tenantId, id);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  if (!result.data) {
    return NextResponse.json(
      { code: 'COMMON_NOT_FOUND', message: 'Incident not found', correlationId },
      { status: 404 },
    );
  }

  const incident = result.data;

  return NextResponse.json(
    {
      data: {
        id: incident.id,
        title: incident.title,
        description: incident.description,
        location: incident.location,
        latitude: incident.latitude,
        longitude: incident.longitude,
        severity: incident.severity,
        category: incident.category,
        status: incident.status,
        reportedBy: incident.reportedBy,
        assignedTo: incident.assignedTo,
        evidenceUrls: incident.evidenceUrls,
        escalatedAt: incident.escalatedAt?.toISOString() ?? null,
        resolvedAt: incident.resolvedAt?.toISOString() ?? null,
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
};

export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetIncident,
);

// ---------------------------------------------------------------------------
// PATCH handler — Update incident report
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  description: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  severityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

const handleUpdateIncident: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract incident ID from route params
  const { id } = await routeContext?.params ?? { id: '' };

  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Incident ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 2. Parse and validate input
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

  const validation = updateSchema.safeParse(body);
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
      data: {
        id: updated.id,
        description: updated.description,
        location: updated.location,
        severityLevel: updated.severityLevel,
      },
    });
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

export const PATCH = withPermission(
  { permissions: ['security:write'] },
  handleUpdateIncident,
);

// ---------------------------------------------------------------------------
// DELETE handler — Delete incident report
// ---------------------------------------------------------------------------

const handleDeleteIncident: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract incident ID from route params
  const { id } = await routeContext?.params ?? { id: '' };

  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Incident ID is required',
        correlationId,
      },
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

    await prisma.incidentReport.delete({ where: { id } });

    return NextResponse.json({ data: { id, deleted: true } });
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

export const DELETE = withPermission(
  { permissions: ['security:write'] },
  handleDeleteIncident,
);
