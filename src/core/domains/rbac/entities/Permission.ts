/**
 * Permission — RBAC domain types and role hierarchy.
 *
 * Defines the role hierarchy for permission checks and role assignment rules.
 * Role levels determine access: higher level = more privileges.
 *
 * Hierarchy (highest to lowest):
 * - Super_Admin (4) — platform-wide admin
 * - Ketua_RT (3) — tenant admin
 * - Pengurus (2) — operational staff
 * - Warga (1) — basic resident
 * - Security_Guard (1) — same level as Warga, different access scope
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { UserRole } from '@core/protocols';

// ---------------------------------------------------------------------------
// Permission type
// ---------------------------------------------------------------------------

export interface Permission {
  /** URL pattern or endpoint identifier (e.g. '/api/finance/*') */
  readonly endpointPattern: string;
  /** Roles that are allowed to access this endpoint */
  readonly requiredRoles: readonly UserRole[];
}

// ---------------------------------------------------------------------------
// Role hierarchy — numeric levels for comparison
// ---------------------------------------------------------------------------

const ROLE_LEVELS: Readonly<Record<UserRole, number>> = {
  [UserRole.Super_Admin]: 4,
  [UserRole.Ketua_RT]: 3,
  [UserRole.Pengurus]: 2,
  [UserRole.Warga]: 1,
  [UserRole.Security_Guard]: 1,
};

// ---------------------------------------------------------------------------
// Role assignment rules — which roles each role can assign
// ---------------------------------------------------------------------------

/**
 * Maps each role to the set of roles it is allowed to assign.
 *
 * - Super_Admin can assign any role
 * - Ketua_RT can assign Pengurus, Warga, Security_Guard (NOT Super_Admin)
 * - No other roles can assign roles
 */
export const ROLE_HIERARCHY: Readonly<Record<UserRole, readonly UserRole[]>> = {
  [UserRole.Super_Admin]: [
    UserRole.Super_Admin,
    UserRole.Ketua_RT,
    UserRole.Pengurus,
    UserRole.Warga,
    UserRole.Security_Guard,
  ],
  [UserRole.Ketua_RT]: [
    UserRole.Pengurus,
    UserRole.Warga,
    UserRole.Security_Guard,
  ],
  [UserRole.Pengurus]: [],
  [UserRole.Warga]: [],
  [UserRole.Security_Guard]: [],
};

// ---------------------------------------------------------------------------
// Helper — minimum role check
// ---------------------------------------------------------------------------

/**
 * Checks whether `userRole` meets or exceeds the `requiredRole` level.
 *
 * Uses numeric levels so that Super_Admin (4) satisfies any requirement,
 * Ketua_RT (3) satisfies Pengurus/Warga/Security_Guard, etc.
 *
 * Security_Guard and Warga are at the same level (1) — they satisfy
 * each other's level requirement but have different access scopes
 * enforced elsewhere.
 */
export function hasMinimumRole(
  userRole: UserRole,
  requiredRole: UserRole,
): boolean {
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[requiredRole];
}
