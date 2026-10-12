/**
 * POST /api/security/incidents — Create a new security incident.
 * GET  /api/security/incidents — List incidents for the tenant (paginated, filterable).
 *
 * Permissions:
 * - GET: security:read
 * - POST: security:manage
 *
 * BFF pattern: withPermission wrapper → validate input → execute use case → return safe response.
 *
 * @see Requirements 32.1, 32.2, 32.4, 32.7, 32.8
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { uuidLike } from '@infrastructure/utils/uuidLike';
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { CreateIncidentUseCase } from '@core/domains/incident/usecases';
import type { IncidentRepository } from '@core/domains/incident/repositories/IncidentRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const createIncidentSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  location: z.string().min(1).max(500),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.enum([
    'theft',
    'vandalism',
    'trespassing',
    'fire',
    'flood',
    'suspicious_activity',
    'noise_complaint',
    'device_alert',
    'other',
  ]),
  assignedTo: uuidLike().nullable().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['open', 'acknowledged', 'in_progress', 'escalated', 'resolved', 'closed'])
    .optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z
    .enum([
      'theft',
      'vandalism',
      'trespassing',
      'fire',
      'flood',
      'suspicious_activity',
      'noise_complaint',
      'device_alert',
      'other',
    ])
    .optional(),
});

// ---------------------------------------------------------------------------
// POST handler — Create incident
// ---------------------------------------------------------------------------

const handleCreateIncident: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
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

  const validation = createIncidentSchema.safeParse(body);
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
  const useCase = container.resolve<CreateIncidentUseCase>('createIncidentUseCase');
  const result = await useCase.execute({
    authContext,
    data: {
      title: validation.data.title,
      description: validation.data.description,
      location: validation.data.location,
      latitude: validation.data.latitude ?? null,
      longitude: validation.data.longitude ?? null,
      severity: validation.data.severity,
      category: validation.data.category,
      reportedBy: authContext.userId,
      assignedTo: validation.data.assignedTo ?? null,
    },
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
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
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleCreateIncident,
);

// ---------------------------------------------------------------------------
// GET handler — List incidents (paginated)
// ---------------------------------------------------------------------------

const handleListIncidents: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse query parameters
  const { searchParams } = new URL(request.url);
  const queryValidation = listQuerySchema.safeParse({
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    severity: searchParams.get('severity') ?? undefined,
    category: searchParams.get('category') ?? undefined,
  });

  if (!queryValidation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(queryValidation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  const { page, pageSize, status, severity, category } = queryValidation.data;

  // 2. Query repository for incidents
  const incidentRepository =
    container.resolve<IncidentRepository>('incidentRepository');
  const result = await incidentRepository.findByTenant(
    authContext.tenantId,
    page,
    pageSize,
    { status, severity, category },
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const { data: incidents, total } = result.data;

  return NextResponse.json(
    {
      data: incidents.map((incident) => ({
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
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
    { status: 200 },
  );
};

export const GET = withPermission(
  { permissions: ['security:read'] },
  handleListIncidents,
);
