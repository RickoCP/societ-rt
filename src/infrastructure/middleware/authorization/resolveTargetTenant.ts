/**
 * resolveTargetTenant — Cross-tenant scoping helper for admin BFF endpoints.
 *
 * Problem: admin endpoints normally scope queries to `authContext.tenantId`
 * (the caller's own tenant). A PLATFORM_ADMIN logs into the platform tenant,
 * so those endpoints return nothing when the admin wants to inspect a specific
 * customer tenant.
 *
 * This helper implements the "Option 2A" cross-tenant access path: a request
 * may carry a `?tenantId=<target>` query parameter which is honored ONLY when:
 *   1. the caller holds the PLATFORM_ADMIN role, AND
 *   2. the target tenant actually exists.
 *
 * Security properties (fail securely, least privilege, auditable):
 *   - A non-platform-admin that supplies `tenantId` is REJECTED (prevents IDOR
 *     / horizontal privilege escalation). It is never silently ignored.
 *   - An unknown target tenant is REJECTED (no enumeration-friendly data leak).
 *   - Every honored cross-tenant access is written to the audit trail with the
 *     real actor id as `impersonatorId` and the target tenant as `tenantId`.
 *   - When no override is supplied, the caller's own tenant is used unchanged
 *     and nothing is audited (normal same-tenant path).
 *
 * @see 05-security-guideline (least privilege, audit sensitive access)
 * @see 11-bff-pattern (validation + auth + observability at the boundary)
 * @see 12-error-handling (classified, safe failures)
 */

import type { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { MembershipRole } from '@core/domains/membership/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { AuditQueueProtocol } from '@core/protocols';

/**
 * Dependencies injected into {@link resolveTargetTenant}.
 *
 * Injecting these (rather than resolving them from the DI container inside the
 * function) keeps the helper decoupled from the composition root and makes it
 * trivially testable with mocks — no real container needed.
 *
 * @see 06-di-pattern (dependency injection, no service locator in helpers)
 */
export interface ResolveTargetTenantDeps {
  /** Prisma client used to validate the target tenant exists. */
  prismaClient: Pick<PrismaClient, 'tenant'>;
  /** Audit queue used to record honored cross-tenant access. */
  auditQueueProtocol: AuditQueueProtocol;
}

/**
 * Discriminated result of target-tenant resolution.
 *
 * `ok: true`  → use `tenantId` for the query. `isCrossTenant` indicates whether
 *                it differs from the caller's own tenant (already audited).
 * `ok: false` → the override was rejected; `code`/`message` are safe to return.
 */
export type ResolveTargetTenantResult =
  | { ok: true; tenantId: string; isCrossTenant: boolean }
  | {
      ok: false;
      status: 403 | 404;
      code: 'AUTH_INSUFFICIENT_PERMISSION' | 'COMMON_NOT_FOUND';
      message: string;
    };

function getClientIp(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined
  );
}

/**
 * Resolve which tenant an admin endpoint should scope to for this request.
 *
 * @param request - the incoming request (reads the `tenantId` query param)
 * @param authContext - the resolved authorization context of the caller
 * @param route - route identifier for the audit entry (e.g. 'admin/members')
 * @param deps - injected dependencies (Prisma client, audit queue)
 */
export async function resolveTargetTenant(
  request: NextRequest,
  authContext: AuthorizationContext,
  route: string,
  deps: ResolveTargetTenantDeps,
): Promise<ResolveTargetTenantResult> {
  const { prismaClient, auditQueueProtocol } = deps;
  const requested = new URL(request.url).searchParams.get('tenantId');

  // No override requested → use the caller's own tenant (normal path).
  if (!requested || requested === authContext.tenantId) {
    return { ok: true, tenantId: authContext.tenantId, isCrossTenant: false };
  }

  // Override requested → ONLY PLATFORM_ADMIN may view another tenant's data.
  if (authContext.role !== MembershipRole.PLATFORM_ADMIN) {
    return {
      ok: false,
      status: 403,
      code: 'AUTH_INSUFFICIENT_PERMISSION',
      message: 'Cross-tenant access requires platform administrator role',
    };
  }

  // Validate the target tenant exists (reject unknown ids).
  const tenant = await prismaClient.tenant.findUnique({
    where: { id: requested },
    select: { id: true },
  });

  if (!tenant) {
    return {
      ok: false,
      status: 404,
      code: 'COMMON_NOT_FOUND',
      message: 'Target tenant not found',
    };
  }

  // Audit the cross-tenant access — FIRE-AND-FORGET.
  // The audit queue is Redis/BullMQ backed and non-critical. We must NEVER
  // block the user's request on it (a dead queue connection would otherwise
  // hang the request). Not awaited; failures are logged, not swallowed.
  void (async () => {
    try {
      await auditQueueProtocol.enqueueAudit({
        tenantId: tenant.id,
        actorUserId: authContext.userId,
        actionType: 'platform_admin_cross_tenant_access',
        resourceType: 'tenant',
        resourceId: tenant.id,
        details: { route, method: request.method },
        ipAddress: getClientIp(request),
        impersonatorId: authContext.userId,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[resolveTargetTenant] failed to enqueue cross-tenant audit for route=${route}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  })();

  return { ok: true, tenantId: tenant.id, isCrossTenant: true };
}

/**
 * Boundary convenience wrapper: resolve {@link ResolveTargetTenantDeps} from the
 * DI container and run {@link resolveTargetTenant}.
 *
 * This keeps the service-locator access at the composition boundary (the route
 * handler) rather than buried inside the pure helper. Route handlers call this;
 * unit tests call {@link resolveTargetTenant} directly with mocked deps.
 *
 * @see 06-di-pattern (resolve dependencies at the composition boundary)
 */
export async function resolveTargetTenantFromContainer(
  request: NextRequest,
  authContext: AuthorizationContext,
  route: string,
  container: {
    resolve<T>(name: string): T;
  },
): Promise<ResolveTargetTenantResult> {
  const deps: ResolveTargetTenantDeps = {
    prismaClient: container.resolve<PrismaClient>('prismaClient'),
    auditQueueProtocol: container.resolve<AuditQueueProtocol>(
      'auditQueueProtocol',
    ),
  };
  return resolveTargetTenant(request, authContext, route, deps);
}
