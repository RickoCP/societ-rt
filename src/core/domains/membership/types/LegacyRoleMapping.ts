/**
 * LegacyRoleMapping — Mapping between legacy UserRole and MembershipRole.
 *
 * This mapping is FROZEN (L5) and used for:
 * - Legacy data remediation (Task 33)
 * - Backward compatibility during migration
 * - Shadow authorization validation
 *
 * IMPORTANT: This file exists for migration purposes only. After migration
 * is complete (post-FASE 1.15), this mapping should be deprecated.
 *
 * @see Requirements 11, Design L5
 */

import { UserRole } from '@core/protocols';
import { MembershipRole } from './MembershipRole';

/**
 * LOCKED (L5) mapping from legacy UserRole to MembershipRole.
 *
 * | Legacy UserRole | Target MembershipRole |
 * |-----------------|----------------------|
 * | Super_Admin     | PLATFORM_ADMIN       |
 * | Ketua_RT        | RT_ADMIN             |
 * | Pengurus        | ORG_ADMIN            |
 * | Warga           | RESIDENT             |
 * | Security_Guard  | SECURITY             |
 */
export const LEGACY_ROLE_MAPPING: ReadonlyMap<UserRole, MembershipRole> =
  new Map([
    [UserRole.Super_Admin, MembershipRole.PLATFORM_ADMIN],
    [UserRole.Ketua_RT, MembershipRole.RT_ADMIN],
    [UserRole.Pengurus, MembershipRole.ORG_ADMIN],
    [UserRole.Warga, MembershipRole.RESIDENT],
    [UserRole.Security_Guard, MembershipRole.SECURITY],
  ]);

/**
 * Reverse mapping from MembershipRole to legacy UserRole.
 * Note: Not all MembershipRoles have a legacy equivalent (TENANT_OWNER is new).
 */
export const MEMBERSHIP_TO_LEGACY_MAPPING: ReadonlyMap<
  MembershipRole,
  UserRole | null
> = new Map([
  [MembershipRole.PLATFORM_ADMIN, UserRole.Super_Admin],
  [MembershipRole.TENANT_OWNER, null], // New role, no legacy equivalent
  [MembershipRole.ORG_ADMIN, UserRole.Pengurus],
  [MembershipRole.RT_ADMIN, UserRole.Ketua_RT],
  [MembershipRole.SECURITY, UserRole.Security_Guard],
  [MembershipRole.RESIDENT, UserRole.Warga],
]);

/**
 * Convert a legacy UserRole to the corresponding MembershipRole.
 *
 * @param legacyRole - The legacy role to convert
 * @returns The corresponding MembershipRole, or null if no mapping exists
 */
export function mapLegacyRole(legacyRole: UserRole): MembershipRole | null {
  return LEGACY_ROLE_MAPPING.get(legacyRole) ?? null;
}

/**
 * Convert a MembershipRole to the corresponding legacy UserRole.
 *
 * @param membershipRole - The membership role to convert
 * @returns The corresponding legacy UserRole, or null if no mapping exists
 *
 * Note: TENANT_OWNER has no legacy equivalent and will return null.
 */
export function mapToLegacyRole(
  membershipRole: MembershipRole,
): UserRole | null {
  return MEMBERSHIP_TO_LEGACY_MAPPING.get(membershipRole) ?? null;
}

/**
 * Check if a legacy role has a membership equivalent.
 */
export function hasLegacyMapping(legacyRole: UserRole): boolean {
  return LEGACY_ROLE_MAPPING.has(legacyRole);
}

/**
 * Check if a membership role has a legacy equivalent.
 */
export function hasMembershipMapping(
  membershipRole: MembershipRole,
): boolean {
  return MEMBERSHIP_TO_LEGACY_MAPPING.get(membershipRole) !== null;
}
