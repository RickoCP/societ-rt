/**
 * POST /api/announcements — Create a new announcement.
 * GET  /api/announcements — List announcements for the tenant.
 *
 * BFF pattern: withPermission → validate input → execute use case / query → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 9.1, 9.2
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { CreateAnnouncementUseCase } from '@core/domains/announcement/usecases';
import type { AnnouncementRepository } from '@core/domains/announcement/repositories/AnnouncementRepository';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  category: z.enum(['umum', 'keamanan', 'keuangan', 'kegiatan', 'darurat']),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/**
 * Response type for creating an announcement.
 */
interface CreateAnnouncementResponse {
  data: {
    id: string;
    title: string;
    content: string;
    category: string;
    createdBy: string;
    publishedAt: string | null;
    createdAt: string;
  };
}

/**
 * Response type for listing announcements.
 */
interface ListAnnouncementsResponse {
  data: Array<{
    id: string;
    title: string;
    content: string;
    category: string;
    createdBy: string;
    authorName: string;
    publishedAt: string | null;
    createdAt: string;
  }>;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
  };
}

/**
 * Standard error response type.
 */
interface ErrorResponse {
  code: string;
  message?: string;
  fields?: Record<string, string>;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// POST handler — Create announcement
// ---------------------------------------------------------------------------

/**
 * Handler for creating a new announcement.
 *
 * AuthorizationContext is guaranteed to have announcement:publish permission
 * after withPermission validation.
 *
 * @see Permission Mapping: POST /api/announcements → announcement:publish
 */
const handleCreateAnnouncement: AuthorizedRouteHandler<
  CreateAnnouncementResponse | ErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<CreateAnnouncementResponse | ErrorResponse>> => {
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

  const validation = createAnnouncementSchema.safeParse(body);
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
  const useCase = container.resolve<CreateAnnouncementUseCase>(
    'createAnnouncementUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: validation.data,
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const announcement = result.data;

  return NextResponse.json(
    {
      data: {
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        category: announcement.category,
        createdBy: announcement.createdBy,
        publishedAt: announcement.publishedAt?.toISOString() ?? null,
        createdAt: announcement.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

// ---------------------------------------------------------------------------
// GET handler — List announcements
// ---------------------------------------------------------------------------

/**
 * Handler for listing announcements for the tenant.
 *
 * AuthorizationContext is guaranteed to have announcement:read permission
 * after withPermission validation.
 *
 * @see Permission Mapping: GET /api/announcements → announcement:read
 */
const handleListAnnouncements: AuthorizedRouteHandler<
  ListAnnouncementsResponse | ErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<ListAnnouncementsResponse | ErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract query params
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') ?? undefined;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

  // 2. Query repository
  const announcementRepository =
    container.resolve<AnnouncementRepository>('announcementRepository');
  const result = await announcementRepository.findByTenant(
    authContext.tenantId,
    {
      category: category as 'umum' | 'keamanan' | 'keuangan' | 'kegiatan' | 'darurat' | undefined,
      page: isNaN(page) || page < 1 ? 1 : page,
      pageSize: isNaN(pageSize) || pageSize < 1 ? 20 : pageSize,
    },
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const paginated = result.data;

  // 3. Resolve author names from user IDs
  const prisma = container.resolve<PrismaClient>('prismaClient');
  const creatorIds = [...new Set(paginated.data.map((a) => a.createdBy))];
  const users = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, name: true },
  });
  const userNameMap = new Map(users.map((u) => [u.id, u.name]));

  return NextResponse.json(
    {
      data: paginated.data.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        category: a.category,
        createdBy: a.createdBy,
        authorName: userNameMap.get(a.createdBy) ?? 'Unknown',
        publishedAt: a.publishedAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      pagination: {
        total: paginated.total,
        page: paginated.page,
        pageSize: paginated.pageSize,
      },
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported route handlers with permission checks
// ---------------------------------------------------------------------------

/**
 * GET handler wrapped with announcement:read permission requirement.
 *
 * Users with announcement:read permission can list announcements for their tenant.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: GET /api/announcements → announcement:read
 */
export const GET = withPermission(
  { permissions: ['announcement:read'] },
  handleListAnnouncements,
);

/**
 * POST handler wrapped with announcement:publish permission requirement.
 *
 * Users with announcement:publish permission can create announcements.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN roles.
 *
 * @see Permission Mapping: POST /api/announcements → announcement:publish
 */
export const POST = withPermission(
  { permissions: ['announcement:publish'] },
  handleCreateAnnouncement,
);
