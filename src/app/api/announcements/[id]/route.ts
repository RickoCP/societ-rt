/**
 * GET /api/announcements/:id — Get announcement detail.
 * PATCH /api/announcements/:id — Update an announcement.
 * DELETE /api/announcements/:id — Delete an announcement.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * Only admins (TENANT_OWNER, ORG_ADMIN, RT_ADMIN) or the creator can edit/delete.
 *
 * @see Requirements 9.1, 9.2
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import { MembershipRole } from '@core/domains/membership/types';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Roles that can edit/delete any announcement (not just their own).
 */
const ADMIN_ROLES: MembershipRole[] = [
  MembershipRole.TENANT_OWNER,
  MembershipRole.ORG_ADMIN,
  MembershipRole.RT_ADMIN,
];

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  category: z.enum(['umum', 'keamanan', 'keuangan', 'kegiatan', 'darurat']).optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/**
 * Response type for getting announcement detail.
 */
interface GetAnnouncementResponse {
  data: {
    id: string;
    title: string;
    content: string;
    category: string;
    createdBy: string;
    authorName: string;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Response type for updating an announcement.
 */
interface UpdateAnnouncementResponse {
  data: {
    id: string;
    title: string;
    content: string;
    category: string;
  };
}

/**
 * Response type for deleting an announcement.
 */
interface DeleteAnnouncementResponse {
  data: {
    id: string;
    deleted: boolean;
  };
}

/**
 * Standard error response type.
 */
interface ErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// GET — Get announcement detail
// ---------------------------------------------------------------------------

/**
 * Handler for getting announcement detail.
 *
 * AuthorizationContext is guaranteed to have announcement:read permission
 * after withPermission validation.
 *
 * @see Permission Mapping: GET /api/announcements/:id → announcement:read
 */
const handleGetAnnouncement: AuthorizedRouteHandler<
  GetAnnouncementResponse | ErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse<GetAnnouncementResponse | ErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await routeContext!.params!;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const announcement = await prisma.announcement.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!announcement) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Announcement not found', correlationId },
        { status: 404 },
      );
    }

    // Resolve author name
    const author = await prisma.user.findUnique({
      where: { id: announcement.createdBy },
      select: { name: true },
    });

    return NextResponse.json({
      data: {
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        category: announcement.category,
        createdBy: announcement.createdBy,
        authorName: author?.name ?? 'Unknown',
        publishedAt: announcement.publishedAt?.toISOString() ?? null,
        createdAt: announcement.createdAt.toISOString(),
        updatedAt: announcement.updatedAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// PATCH — Update announcement
// ---------------------------------------------------------------------------

/**
 * Handler for updating an announcement.
 *
 * AuthorizationContext is guaranteed to have announcement:publish permission
 * after withPermission validation.
 *
 * Additional authorization: only admins or the creator can update.
 *
 * @see Permission Mapping: PATCH /api/announcements/:id → announcement:publish
 */
const handleUpdateAnnouncement: AuthorizedRouteHandler<
  UpdateAnnouncementResponse | ErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse<UpdateAnnouncementResponse | ErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await routeContext!.params!;

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

    const announcement = await prisma.announcement.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!announcement) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Announcement not found', correlationId },
        { status: 404 },
      );
    }

    // Authorization: only admin roles or the creator can edit
    const isAdminRole = ADMIN_ROLES.includes(authContext.role);
    const isCreator = announcement.createdBy === authContext.userId;

    if (!isAdminRole && !isCreator) {
      return NextResponse.json(
        { code: 'AUTH_INSUFFICIENT_PERMISSION', message: 'You do not have permission to update this announcement.', correlationId },
        { status: 403 },
      );
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        title: updated.title,
        content: updated.content,
        category: updated.category,
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// DELETE — Delete announcement
// ---------------------------------------------------------------------------

/**
 * Handler for deleting an announcement.
 *
 * AuthorizationContext is guaranteed to have announcement:publish permission
 * after withPermission validation.
 *
 * Additional authorization: only admins or the creator can delete.
 *
 * @see Permission Mapping: DELETE /api/announcements/:id → announcement:publish
 */
const handleDeleteAnnouncement: AuthorizedRouteHandler<
  DeleteAnnouncementResponse | ErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse<DeleteAnnouncementResponse | ErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await routeContext!.params!;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const announcement = await prisma.announcement.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!announcement) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Announcement not found', correlationId },
        { status: 404 },
      );
    }

    // Authorization: only admin roles or the creator can delete
    const isAdminRole = ADMIN_ROLES.includes(authContext.role);
    const isCreator = announcement.createdBy === authContext.userId;

    if (!isAdminRole && !isCreator) {
      return NextResponse.json(
        { code: 'AUTH_INSUFFICIENT_PERMISSION', message: 'You do not have permission to delete this announcement.', correlationId },
        { status: 403 },
      );
    }

    await prisma.announcement.delete({ where: { id } });

    return NextResponse.json({ data: { id, deleted: true } });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Exported route handlers with permission checks
// ---------------------------------------------------------------------------

/**
 * GET handler wrapped with announcement:read permission requirement.
 *
 * Users with announcement:read permission can view announcement details.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: GET /api/announcements/:id → announcement:read
 */
export const GET = withPermission(
  { permissions: ['announcement:read'] },
  handleGetAnnouncement,
);

/**
 * PATCH handler wrapped with announcement:publish permission requirement.
 *
 * Users with announcement:publish permission can update announcements.
 * Additional check: only admins or the creator can update.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN roles.
 *
 * @see Permission Mapping: PATCH /api/announcements/:id → announcement:publish
 */
export const PATCH = withPermission(
  { permissions: ['announcement:publish'] },
  handleUpdateAnnouncement,
);

/**
 * DELETE handler wrapped with announcement:publish permission requirement.
 *
 * Users with announcement:publish permission can delete announcements.
 * Additional check: only admins or the creator can delete.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN roles.
 *
 * @see Permission Mapping: DELETE /api/announcements/:id → announcement:publish
 */
export const DELETE = withPermission(
  { permissions: ['announcement:publish'] },
  handleDeleteAnnouncement,
);
