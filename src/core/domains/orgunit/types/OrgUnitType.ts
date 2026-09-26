/**
 * OrgUnitType — Enum representing the type of organizational unit in the hierarchy.
 *
 * Hierarchy order: ORGANIZATION > CLUSTER > RW > RT
 *
 * This enum matches the Prisma schema OrgUnitType enum.
 *
 * @see Design OrgUnit Hierarchy Model
 * @see prisma/schema.prisma enum OrgUnitType
 */

/**
 * Type of an organizational unit in the tenant hierarchy.
 *
 * HIERARCHY ORDER (parent → child):
 * ORGANIZATION → CLUSTER → RW → RT
 *
 * M1/M2 FROZEN STATE:
 * - 2 OrgUnits exist: rt01 root and rt02 root (both type RT)
 * - No ORGANIZATION, CLUSTER, or RW units exist yet
 */
export enum OrgUnitType {
  /** Top-level organization (e.g., Housing Complex A) */
  ORGANIZATION = 'ORGANIZATION',

  /** Cluster within an organization (e.g., Tower North) */
  CLUSTER = 'CLUSTER',

  /** RW (Rukun Warga) unit within a cluster */
  RW = 'RW',

  /** RT (Rukun Tetangga) unit within an RW */
  RT = 'RT',
}

/**
 * Array of all OrgUnitType values in hierarchy order (parent → child).
 * Useful for iteration and validation.
 */
export const ALL_ORGUNIT_TYPES: readonly OrgUnitType[] = [
  OrgUnitType.ORGANIZATION,
  OrgUnitType.CLUSTER,
  OrgUnitType.RW,
  OrgUnitType.RT,
] as const;

/**
 * Map of OrgUnitType to its depth in a typical hierarchy.
 * Note: Actual depth depends on the hierarchy structure; this is just typical depth.
 *
 * ORGANIZATION: depth 0 (root)
 * CLUSTER: depth 1
 * RW: depth 2
 * RT: depth 3
 *
 * M1/M2 EXCEPTION: RT roots exist at depth 0.
 */
export const TYPICAL_ORGUNIT_DEPTH: Readonly<Record<OrgUnitType, number>> = {
  [OrgUnitType.ORGANIZATION]: 0,
  [OrgUnitType.CLUSTER]: 1,
  [OrgUnitType.RW]: 2,
  [OrgUnitType.RT]: 3,
} as const;

/**
 * Maximum hierarchy depth supported (5 levels as per design D4).
 */
export const MAX_ORGUNIT_DEPTH = 5;

/**
 * Check if a value is a valid OrgUnitType.
 *
 * @param value - The value to check
 * @returns true if the value is a valid OrgUnitType
 */
export function isValidOrgUnitType(value: unknown): value is OrgUnitType {
  return (
    typeof value === 'string' &&
    Object.values(OrgUnitType).includes(value as OrgUnitType)
  );
}

/**
 * Get the hierarchy level index for an OrgUnitType (0-3).
 * Useful for comparing hierarchy positions.
 *
 * @param type - The OrgUnitType
 * @returns The hierarchy index (0 = ORGANIZATION, 3 = RT)
 */
export function getHierarchyIndex(type: OrgUnitType): number {
  return ALL_ORGUNIT_TYPES.indexOf(type);
}

/**
 * Check if one OrgUnitType can be a parent of another.
 * Parent types have lower hierarchy index than child types.
 *
 * @param parentType - The potential parent type
 * @param childType - The potential child type
 * @returns true if parentType can be a parent of childType
 *
 * @example
 * canBeParent(OrgUnitType.CLUSTER, OrgUnitType.RW) // true
 * canBeParent(OrgUnitType.RT, OrgUnitType.CLUSTER) // false
 */
export function canBeParent(
  parentType: OrgUnitType,
  childType: OrgUnitType,
): boolean {
  return getHierarchyIndex(parentType) < getHierarchyIndex(childType);
}
