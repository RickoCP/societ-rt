/**
 * OrgUnit entities barrel export.
 *
 * @see Requirements 6, 21, 46
 * @see Requirements 7.2, 7.3 (OrgUnit Hierarchy Tree View)
 */

export type {
  OrgUnit,
  CreateOrgUnitInput,
  UpdateOrgUnitInput,
  PathValidationResult,
} from './OrgUnit';

export type {
  OrgUnitNode,
  OrgUnitListItem,
  OrgUnitSummary,
} from './OrgUnitNode';

export {
  hasChildren,
  isLeafNode,
  getDisplayPath,
} from './OrgUnitNode';
