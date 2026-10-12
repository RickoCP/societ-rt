/**
 * POST /api/admin/platform/security-events/bulk-acknowledge — Acknowledge many
 * security events at once (platform admin).
 *
 * Security events are composed from the `incidents` table (see the list route),
 * so this marks all matching incidents as `acknowledged`. Cross-tenant by design
 * and audited as a single bulk action.
 *
 * Guarded by `platform:read` (PLATFORM_ADMIN only). Returns 200 on success.
 *
 * @see Requirements 21.6, 21.7 (Acknowledgment support + logging)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { PrismaClient } from '@prisma/client';
import type { AuditQueueProtocol } from '@core/protocols';

/** Bounded to avoid an unbounded bulk update (abuse / accidental large writes). */
const MAX_BULK_ACKNOWLEDGE = 100;

const bulkAcknowledgeSchema = z.object({
  eventIds: z
    .array(z.string().min(1))
    .min(1, 'At least one event ID is required')
    .max(MAX_BULK_ACKNOWLEDGE, `Cannot acknowledge more than ${MAX_BULK_ACKNOWLEDGE} at once`),
  note: z.string().max(1000).nullable().optional(),
});

function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined
  );
}

/**
 * Enqueue an audit entry without ever blocking or throwing into the request
 * path. The audit queue is non-critical (Redis/BullMQ backed); a dead queue
 * must degrade gracefully, not hang the user's action.
 */
async function enqueueAuditSafely(
  entry: Parameters<AuditQueueProtocol['enqueueAudit']>[0],
): Promise<void> {
  try {
    const auditQueue =
      container.resolve<AuditQueueProtocol>('auditQueueProtocol');
    await auditQueue.enqueueAudit(entry);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[security-events/bulk-acknowledge] audit enqueue failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

const handleBulkAcknowledge: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate the request body.
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

  const validation = bulkAcknowledgeSchema.safeParse(body);
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

  const { eventIds, note } = validation.data;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    // 2. Mark all matching incidents as acknowledged (cross-tenant).
    const result = await prisma.incident.updateMany({
      where: { id: { in: eventIds } },
      data: { status: 'acknowledged' },
    });

    // 3. Audit the bulk acknowledgment — FIRE-AND-FORGET.
    // The audit queue is Redis/BullMQ backed and non-critical; never block or
    // fail the user's action on it. Not awaited; failures are logged.
    void enqueueAuditSafely({
      // Platform-level bulk action spanning tenants → attribute to the
      // actor's tenant context for the audit record.
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      actionType: 'security_event_bulk_acknowledged',
      resourceType: 'incident',
      resourceId: 'bulk',
      details: {
        requestedCount: eventIds.length,
        updatedCount: result.count,
        note: note ?? null,
      },
      ipAddress: getClientIp(request),
      impersonatorId: authContext.userId,
    });

    return NextResponse.json(
      { data: { updatedCount: result.count } },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[security-events/bulk-acknowledge] Error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to bulk acknowledge security events',
        correlationId,
      },
      { status: 500 },
    );
  }
};

export const POST = withPermission(
  { permissions: ['platform:read'] },
  handleBulkAcknowledge,
);
