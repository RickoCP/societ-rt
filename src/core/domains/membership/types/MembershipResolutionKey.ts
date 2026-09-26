/**
 * MembershipResolutionKey — Composite key used to uniquely identify
 * which membership to resolve for a given authorization request.
 *
 * The combination of (userId, activeTenantId, activeOrgUnitId) determines
 * the specific membership to use for authorization.
 *
 * CRITICAL: This key is derived from JWT claims. The membershipId is NEVER
 * accepted from JWT — it is always resolved server-side using this key.
 *
 * @see Requirements 1, 3, Design Membership Resolution Flow
 */

/**
 * Key used to resolve a specific membership for authorization.
 *
 * @property userId - The authenticated user's ID from JWT.sub
 * @property activeTenantId - The currently active tenant from JWT.activeTenantId
 * @property activeOrgUnitId - The currently active OrgUnit from JWT.activeOrgUnitId
 *   - null is valid ONLY for tenant-level admins (PLATFORM_ADMIN, TENANT_OWNER)
 *   - non-null required for org-scoped roles (INV-MEM-003)
 */
export interface MembershipResolutionKey {
  readonly userId: string;
  readonly activeTenantId: string;
  readonly activeOrgUnitId: string | null;
}

/**
 * Validate that a resolution key has the minimum required fields.
 *
 * Note: This does not validate business rules (e.g., tenant-level role
 * requiring null orgUnitId). Those validations happen during resolution.
 */
export function isValidResolutionKey(
  key: unknown,
): key is MembershipResolutionKey {
  if (typeof key !== 'object' || key === null) {
    return false;
  }

  const candidate = key as Record<string, unknown>;

  return (
    typeof candidate.userId === 'string' &&
    candidate.userId.length > 0 &&
    typeof candidate.activeTenantId === 'string' &&
    candidate.activeTenantId.length > 0 &&
    (candidate.activeOrgUnitId === null ||
      (typeof candidate.activeOrgUnitId === 'string' &&
        candidate.activeOrgUnitId.length > 0))
  );
}

/**
 * Create a resolution key from JWT claims.
 *
 * @throws if required fields are missing or invalid
 */
export function createResolutionKey(claims: {
  sub?: string;
  activeTenantId?: string;
  activeOrgUnitId?: string | null;
}): MembershipResolutionKey {
  if (!claims.sub || typeof claims.sub !== 'string') {
    throw new Error('Invalid resolution key: missing or invalid userId (sub)');
  }

  if (!claims.activeTenantId || typeof claims.activeTenantId !== 'string') {
    throw new Error('Invalid resolution key: missing or invalid activeTenantId');
  }

  // activeOrgUnitId can be null (for tenant-level admins) or a valid string
  const activeOrgUnitId =
    claims.activeOrgUnitId === undefined ? null : claims.activeOrgUnitId;

  if (
    activeOrgUnitId !== null &&
    (typeof activeOrgUnitId !== 'string' || activeOrgUnitId.length === 0)
  ) {
    throw new Error('Invalid resolution key: invalid activeOrgUnitId');
  }

  return {
    userId: claims.sub,
    activeTenantId: claims.activeTenantId,
    activeOrgUnitId,
  };
}
