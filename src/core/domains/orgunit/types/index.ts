/**
 * OrgUnit types barrel export.
 *
 * @see Requirements 6, 21, 46
 * @see Requirements 8.3 (OrgUnit type hierarchy)
 * @see Requirements 10.4 (Move validation)
 */

export {
  OrgUnitType,
  ALL_ORGUNIT_TYPES,
  TYPICAL_ORGUNIT_DEPTH,
  MAX_ORGUNIT_DEPTH,
  ORGUNIT_TYPE_HIERARCHY,
  isValidOrgUnitType,
  getHierarchyIndex,
  canBeParent,
  getValidChildTypes,
  canMoveToParent,
  isLeafType,
  isRootType,
} from './OrgUnitType';
