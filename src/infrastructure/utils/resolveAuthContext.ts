/**
 * Resolve Auth Context — Extracts AuthContext from request headers.
 *
 * The Next.js middleware sets `x-user-id`, `x-tenant-id`, and `x-user-role`
 * headers after JWT validation. Route handlers call this function to
 * reconstruct the AuthContext without re-verifying the token.
 *
 * @see Requirements 1.3, 4.1
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
