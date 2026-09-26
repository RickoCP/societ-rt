/**
 * Resolve Auth Context — Extracts AuthContext from request headers.
 *
 * The Next.js middleware sets `x-user-id`, `x-tenant-id`, and `x-user-role`
 * headers after JWT validation. Route handlers call this function to
 * reconstruct the AuthContext without re-verifying the token.
 *
 * @see Requirements 1.3, 4.1
 *
 * @deprecated **DEPRECATED — Will be removed 30 days after migration completion validation.**
 *
 * This legacy function provides limited authorization context (userId, tenantId, role only).
 * It has been superseded by the full Multi-Tenant SaaS Architecture authorization pipeline
 * that provides complete AuthorizationContext including:
 * - Full membership information (membershipId, orgUnitId, status)
 * - Permission set for fine-grained access control
 * - Token version validation for instant revocation
 * - RLS integration for database-level tenant isolation
 *
 * ## Migration Guide
 *
 * **Use the `withPermission` wrapper** from `@infrastructure/middleware/authorization`
 * instead of calling this function directly:
 *
 * ### Before (Legacy Pattern — DEPRECATED):
 * ```typescript
 * import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
 *
 * export async function GET(request: NextRequest) {
 *   const authContext = resolveAuthContext(request);
 *   if (!authContext) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   // Manual permission checking...
 *   return NextResponse.json(data);
 * }
 * ```
 *
 * ### After (New Pattern — RECOMMENDED):
 * ```typescript
 * import { withPermission } from '@infrastructure/middleware/authorization';
 *
 * export const GET = withPermission(
 *   { permissions: ['resident:read'] },
 *   async (request, { authContext }) => {
 *     // authContext is fully typed AuthorizationContext
 *     // Permission already validated by wrapper
 *     const { userId, tenantId, membershipId, permissions } = authContext;
 *     return NextResponse.json(data);
 *   }
 * );
 * ```
 *
 * ## Alternative Function
 *
 * For advanced use cases requiring direct context resolution:
 * - Use `AuthorizationContextResolver.resolve()` from `@core/domains/authorization/services`
 * - This provides the full `DomainResult<AuthorizationContextResult>` with typed errors
 *
 * ## Removal Timeline
 *
 * - **Deprecation Date**: Current migration phase (FASE 2.15)
 * - **Removal Date**: 30 days after migration completion validation (FASE 2.16)
 * - **Prerequisite for Removal**: All 28+ route directories migrated, shadow mode 0% mismatch
 *
 * @see `.kiro/specs/multi-tenant-integration-cutover/tasks.md` — FASE 2.2 for migration tasks
 * @see `.kiro/specs/multi-tenant-integration-cutover/permission-mapping.md` — Route permission mapping
 * @see `@infrastructure/middleware/authorization` — New authorization wrappers
 * @see `@core/domains/authorization/services/AuthorizationContextResolver` — Full context resolver
 */

import { type NextRequest } from 'next/server';
import { type AuthContext, UserRole } from '@core/protocols';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEADER_USER_ID = 'x-user-id';
const HEADER_TENANT_ID = 'x-tenant-id';
const HEADER_USER_ROLE = 'x-user-role';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set<string>(Object.values(UserRole));

function isValidRole(value: string): value is UserRole {
  return VALID_ROLES.has(value);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads auth-related headers set by middleware and returns an AuthContext.
 *
 * @param request - The incoming NextRequest
 * @returns AuthContext if all required headers are present and valid, null otherwise
 *
 * @deprecated **DEPRECATED — Use `withPermission` wrapper instead.**
 *
 * This function is part of the legacy authorization system and will be removed
 * 30 days after migration completion validation. See the module-level documentation
 * for migration guide and alternative approaches.
 *
 * @example
 * // ❌ DEPRECATED — Do not use in new code
 * const authContext = resolveAuthContext(request);
 *
 * // ✅ RECOMMENDED — Use withPermission wrapper
 * export const GET = withPermission(
 *   { permissions: ['resident:read'] },
 *   async (request, { authContext }) => { ... }
 * );
 */
export function resolveAuthContext(request: NextRequest): AuthContext | null {
  const userId = request.headers.get(HEADER_USER_ID);
  const tenantId = request.headers.get(HEADER_TENANT_ID);
  const role = request.headers.get(HEADER_USER_ROLE);

  if (!userId || !tenantId || !role) {
    return null;
  }

  if (!isValidRole(role)) {
    return null;
  }

  return {
    userId,
    tenantId,
    role,
  };
}
