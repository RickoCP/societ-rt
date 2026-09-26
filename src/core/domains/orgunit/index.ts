/**
 * OrgUnit domain barrel export.
 *
 * This domain handles the organizational hierarchy model (ORGANIZATION > CLUSTER > RW > RT)
 * that provides structure for tenant-scoped membership authorization.
 *
 * **POLICY-NEUTRAL (TPR-02):**
 * The OrgUnit domain provides hierarchy primitives only. Authorization policy
 * decisions are made in FASE 1.7+ (OrgUnit Scope Authorizer).
 *
 * @see FASE 1.6 Task 6: OrgUnit Hierarchy Read Support
 * @see Requirements 1 (AC 6), 6 (AC 1-2, 5), 21, 46
 */

// Entity types
export type {
  OrgUnit,
  CreateOrgUnitInput,
  UpdateOrgUnitInput,
  PathValidationResult,
} from './entities';

// Type enums and helpers
export {
  OrgUnitType,
  ALL_ORGUNIT_TYPES,
  TYPICAL_ORGUNIT_DEPTH,
  MAX_ORGUNIT_DEPTH,
  isValidOrgUnitType,
  getHierarchyIndex,
  canBeParent,
} from './types';

// Repository interface
export type {
  IOrgUnitRepository,
  OrgUnitQueryOptions,
} from './repositories';

// Service interface and implementation
export type {
  IOrgUnitHierarchyReader,
  OrgUnitHierarchyReader,
} from './services';

export { OrgUnitHierarchyReaderImpl } from './services';

// Error factory functions
export {
  orgUnitNotFound,
  orgUnitTenantMismatch,
  orgUnitInvariantViolation,
  orgUnitPathDepthMismatch,
  orgUnitRootInvariantViolation,
  orgUnitParentTenantMismatch,
  orgUnitCycleDetected,
} from './errors';
