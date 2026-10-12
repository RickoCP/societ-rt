/**
 * Member item API route.
 *
 * PATCH  /api/admin/members/[id] — Update a member's role and/or status.
 * DELETE /api/admin/members/[id] — Soft-delete (remove) a member.
 *
 * Operates on the `users` table (consistent with the member list route, which
 * reads `users`). The UI sends canonical MembershipRole/MembershipStatus; we
 * denormalize to the legacy UserRole / users.status on write.
 *
 * Tenant-aware: PLATFORM_ADMIN may target another tenant via ?tenantId=.
 * Guard: membership:delegate (held by PLATFORM_ADMIN, TENANT_OWNER, RT_ADMIN).
 *
 * @see Requirements 5 (Change member role / status), 6 (member management)
 * @see 11-bff-pattern.md Steering
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import {
  withPermission,
  resolveTargetTenantFromContainer,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import { mapToLegacyRole } from '@core/domains/membership/types';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import { UserRole } from '@core/protocols';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function toUserRole(role: MembershipRole): UserRole {
  return mapToLegacyRole(role) ?? UserRole.Warga;
}

function toUserStatus(
  status: MembershipStatus,
): 'active' | 'locked' | 'inactive' {
  switch (status) {
    case MembershipStatus.SUSPENDED:
      return 'locked';
    case MembershipStatus.REVOKED:
      return 'inactive';
    case MembershipStatus.ACTIVE:
    case MembershipStatus.INVITED:
    default:
      return 'active';
  }
}

const updateMemberSchema = z
  .object({
    role: z.nativeEnum(MembershipRole).optional(),
    status: z.nativeEnum(MembershipStatus).optional(),
  })
  .refine(data => data.role !== undefined || data.status !== undefined, {
    message: 'At least one of role or status must be provided',
  });

// ---------------------------------------------------------------------------
// PATCH — Update member role and/or status
// ---------------------------------------------------------------------------

const handleUpdateMember: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const memberId = params?.id;
  if (!memberId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Member ID is required', correlationId },
      { status: 400 },
    );
  }

  const targetTenant = await resolveTargetTenantFromContainer(
    request,
    authContext,
    'admin/members:update',
    container,
  );
  if (!targetTenant.ok) {
    return NextResponse.json(
      { code: targetTenant.code, message: targetTenant.message, correlationId },
      { status: targetTenant.status },
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

  const validation = updateMemberSchema.safeParse(body);
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

  const { role, status } = validation.data;

  try {
    // Build a dynamic, parameterized UPDATE scoped to the target tenant.
    const sets: string[] = [];
    const values: (string | number)[] = [];
    let idx = 1;

    if (role !== undefined) {
      sets.push(`role = $${idx}`);
      values.push(toUserRole(role));
      idx++;
    }
    if (status !== undefined) {
      sets.push(`status = $${idx}`);
      values.push(toUserStatus(status));
      idx++;
    }

    // Tenant + id scoping params.
    values.push(targetTenant.tenantId);
    const tenantParam = idx;
    idx++;
    values.push(memberId);
    const idParam = idx;

    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = now()
       WHERE tenant_id = $${tenantParam} AND id = $${idParam} AND deleted_at IS NULL
       RETURNING id`,
      values,
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Member not found', correlationId },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { data: { id: memberId, updated: true } },
      { status: 200 },
    );
  } catch (error) {
    console.error('[admin/members] Update error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to update member',
        correlationId,
      },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// DELETE — Soft-delete a member
// ---------------------------------------------------------------------------

const handleDeleteMember: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const memberId = params?.id;
  if (!memberId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Member ID is required', correlationId },
      { status: 400 },
    );
  }

  const targetTenant = await resolveTargetTenantFromContainer(
    request,
    authContext,
    'admin/members:delete',
    container,
  );
  if (!targetTenant.ok) {
    return NextResponse.json(
      { code: targetTenant.code, message: targetTenant.message, correlationId },
      { status: targetTenant.status },
    );
  }

  // Prevent an actor from deleting their own account via this admin surface.
  if (memberId === authContext.userId) {
    return NextResponse.json(
      {
        code: 'MEMBER_CANNOT_DELETE_SELF',
        message: 'You cannot delete your own account',
        correlationId,
      },
      { status: 409 },
    );
  }

  try {
    const result = await pool.query(
      `UPDATE users SET deleted_at = now(), updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [targetTenant.tenantId, memberId],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Member not found', correlationId },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { data: { id: memberId, deleted: true } },
      { status: 200 },
    );
  } catch (error) {
    console.error('[admin/members] Delete error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to delete member',
        correlationId,
      },
      { status: 500 },
    );
  }
};

export const PATCH = withPermission(
  { permissions: ['membership:delegate'] },
  handleUpdateMember,
);

export const DELETE = withPermission(
  { permissions: ['membership:delegate'] },
  handleDeleteMember,
);
