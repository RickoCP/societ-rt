/**
 * POST /api/admin/members/bulk — Bulk member operations.
 *
 * Applies a status change (activate/suspend/revoke) or soft-delete to many
 * members at once. Operates on the `users` table (consistent with the member
 * list + item routes). Tenant-aware; guard membership:delegate.
 *
 * Bounded to MAX_BULK members to avoid unbounded writes.
 *
 * @see Requirements 6.6-6.8 (Bulk member operations)
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
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const MAX_BULK = 100;

const bulkSchema = z.object({
  action: z.enum(['activate', 'suspend', 'revoke', 'delete']),
  memberIds: z
    .array(z.string().min(1))
    .min(1, 'At least one member ID is required')
    .max(MAX_BULK, `Cannot operate on more than ${MAX_BULK} members at once`),
});

const handleBulk: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const targetTenant = await resolveTargetTenantFromContainer(
    request,
    authContext,
    'admin/members:bulk',
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

  const validation = bulkSchema.safeParse(body);
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

  const { action, memberIds } = validation.data;

  // Never allow the actor to affect their own account in a bulk op.
  const ids = memberIds.filter(id => id !== authContext.userId);
  if (ids.length === 0) {
    return NextResponse.json(
      { data: { updatedCount: 0 } },
      { status: 200 },
    );
  }

  try {
    let result;
    if (action === 'delete') {
      result = await pool.query(
        `UPDATE users SET deleted_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL`,
        [targetTenant.tenantId, ids],
      );
    } else {
      const status =
        action === 'suspend'
          ? 'locked'
          : action === 'revoke'
            ? 'inactive'
            : 'active';
      result = await pool.query(
        `UPDATE users SET status = $3, updated_at = now()
         WHERE tenant_id = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL`,
        [targetTenant.tenantId, ids, status],
      );
    }

    return NextResponse.json(
      { data: { updatedCount: result.rowCount ?? 0 } },
      { status: 200 },
    );
  } catch (error) {
    console.error('[admin/members] Bulk error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to perform bulk operation',
        correlationId,
      },
      { status: 500 },
    );
  }
};

export const POST = withPermission(
  { permissions: ['membership:delegate'] },
  handleBulk,
);
