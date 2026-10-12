/**
 * POST /api/admin/platform/security-events/:id/acknowledge — Acknowledge a
 * single security event (platform admin).
 *
 * Since security events are composed from the `incidents` table (see the list
 * route), "acknowledging" an event marks the underlying incident as
 * `acknowledged`. Cross-tenant by design (platform admin acts on any tenant's
 * incident) and audited.
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

const acknowledgeSchema = z.object({
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
      `[security-events/acknowledge] audit enqueue failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

const handleAcknowledge: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve the event (incident) id from route params.
  const { id } = (await routeContext?.params) ?? { id: '' };
  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Security event ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 2. Validate the optional note.
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty/invalid body is acceptable — note is optional.
  }
  const validation = acknowledgeSchema.safeParse(body ?? {});
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

    // 3. Ensure the incident exists (safe 404 instead of a blind update).
    const incident = await prisma.incident.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!incident) {
      return NextResponse.json(
        {
          code: 'COMMON_NOT_FOUND',
          message: 'Security event not found',
          correlationId,
        },
        { status: 404 },
      );
    }

    // 4. Mark as acknowledged.
    await prisma.incident.update({
      where: { id },
      data: { status: 'acknowledged' },
    });

    // 5. Audit the cross-tenant acknowledgment — FIRE-AND-FORGET.
    // The audit queue is backed by Redis/BullMQ; it must NEVER block or fail
    // the primary user action. We intentionally do NOT await it (a dead queue
    // connection would otherwise hang the request). Failures are logged.
    void enqueueAuditSafely({
      tenantId: incident.tenantId,
      actorUserId: authContext.userId,
      actionType: 'security_event_acknowledged',
      resourceType: 'incident',
      resourceId: incident.id,
      details: { note: validation.data.note ?? null },
      ipAddress: getClientIp(request),
      impersonatorId: authContext.userId,
    });

    return NextResponse.json({ data: { acknowledged: true } }, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[security-events/acknowledge] Error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to acknowledge security event',
        correlationId,
      },
      { status: 500 },
    );
  }
};

export const POST = withPermission(
  { permissions: ['platform:read'] },
  handleAcknowledge,
);
