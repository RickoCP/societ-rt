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
 * 
 * STRICT HIERARCHY ENFORCEMENT:
 * - ORGANIZATION → CLUSTER (only)
 * - CLUSTER → RW (only)
 * - RW → RT (only)
 * 
 * Child type must be exactly one level below parent type in the hierarchy.
 * Skipping levels (e.g., RT directly under ORGANIZATION) is NOT allowed.
 *
 * @param parentType - The potential parent type
 * @param childType - The potential child type
 * @returns true if parentType can be a direct parent of childType
 *
 * @example
 * canBeParent(OrgUnitType.CLUSTER, OrgUnitType.RW) // true
 * canBeParent(OrgUnitType.ORGANIZATION, OrgUnitType.RT) // false (skips levels)
 * canBeParent(OrgUnitType.RT, OrgUnitType.CLUSTER) // false (wrong direction)
 */
export function canBeParent(
  parentType: OrgUnitType,
  childType: OrgUnitType,
): boolean {
  const parentIndex = getHierarchyIndex(parentType);
  const childIndex = getHierarchyIndex(childType);
  // Child must be exactly one level below parent (strict adjacency)
  return childIndex === parentIndex + 1;
}

/**
 * ORGUNIT_TYPE_HIERARCHY — Valid parent-child type relationships.
 *
 * Maps each OrgUnit type to an array of valid child types.
 * Used for:
 * - Type dropdown filtering in Create OrgUnit form
 * - Move/reparent validation
 * - Drag-and-drop target validation in OrgUnit Tree
 *
 * STRICT HIERARCHY:
 * - ORGANIZATION can only have CLUSTER children
 * - CLUSTER can only have RW children
 * - RW can only have RT children
 * - RT cannot have children (leaf node)
 *
 * @see Requirements 8.3 (OrgUnit CRUD Operations)
 * @see Requirements 10.4 (OrgUnit Reparenting validation)
 * @see Design Property 15, Property 18
 */
export const ORGUNIT_TYPE_HIERARCHY: Readonly<Record<OrgUnitType, readonly OrgUnitType[]>> = {
  [OrgUnitType.ORGANIZATION]: [OrgUnitType.CLUSTER] as const,
  [OrgUnitType.CLUSTER]: [OrgUnitType.RW] as const,
  [OrgUnitType.RW]: [OrgUnitType.RT] as const,
  [OrgUnitType.RT]: [] as const, // Leaf node - no children allowed
} as const;

/**
 * Get valid child types for a given parent type.
 *
 * Used by the Create OrgUnit form to filter type dropdown options.
 *
 * @param parentType - The parent OrgUnit type
 * @returns Array of valid child types (empty array for RT)
 *
 * @example
 * getValidChildTypes(OrgUnitType.RW) // [OrgUnitType.RT]
 * getValidChildTypes(OrgUnitType.RT) // [] (no children)
 */
export function getValidChildTypes(parentType: OrgUnitType): readonly OrgUnitType[] {
  return ORGUNIT_TYPE_HIERARCHY[parentType] ?? [];
}

/**
 * Check if a source type can be moved to a target parent type.
 *
 * Used for drag-and-drop validation and move operation validation.
 *
 * @param sourceType - The type of OrgUnit being moved
 * @param targetParentType - The type of the target parent OrgUnit
 * @returns true if the move is valid (source can be a child of target)
 *
 * @example
 * canMoveToParent(OrgUnitType.RT, OrgUnitType.RW) // true
 * canMoveToParent(OrgUnitType.RT, OrgUnitType.CLUSTER) // false (wrong level)
 */
export function canMoveToParent(
  sourceType: OrgUnitType,
  targetParentType: OrgUnitType,
): boolean {
  const validChildren = ORGUNIT_TYPE_HIERARCHY[targetParentType];
  return validChildren?.includes(sourceType) ?? false;
}

/**
 * Check if an OrgUnit type is a leaf type (cannot have children).
 *
 * @param type - The OrgUnit type to check
 * @returns true if the type cannot have children
 */
export function isLeafType(type: OrgUnitType): boolean {
  return ORGUNIT_TYPE_HIERARCHY[type].length === 0;
}

/**
 * Check if an OrgUnit type is a root type (typically ORGANIZATION).
 * Root types are at the top of the hierarchy.
 *
 * @param type - The OrgUnit type to check
 * @returns true if the type is at the top of hierarchy
 */
export function isRootType(type: OrgUnitType): boolean {
  return getHierarchyIndex(type) === 0;
}
