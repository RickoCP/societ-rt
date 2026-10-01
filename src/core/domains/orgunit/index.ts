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
 * @see Requirements 7.2-7.12, 8.1-8.11, 10.1-10.11 (Multi-Tenant Admin UI)
 */

// Entity types
export type {
  OrgUnit,
  CreateOrgUnitInput,
  UpdateOrgUnitInput,
  PathValidationResult,
  OrgUnitNode,
  OrgUnitListItem,
  OrgUnitSummary,
} from './entities';

// Entity helper functions
export {
  hasChildren,
  isLeafNode,
  getDisplayPath,
} from './entities';

// Type enums and helpers
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
} from './types';

// Repository interfaces
export type {
  IOrgUnitRepository,
  OrgUnitQueryOptions,
  OrgUnitRepository,
  OrgUnitFilters,
  TreeQueryOptions,
  MoveValidationResult,
  CreateOrgUnitRequest,
  UpdateOrgUnitRequest,
  MoveOrgUnitRequest,
} from './repositories';

// Service interface and implementation
export type {
  IOrgUnitHierarchyReader,
  OrgUnitHierarchyReader,
} from './services';

export { OrgUnitHierarchyReaderImpl } from './services';

// Use cases (Multi-Tenant Admin UI - Task 10.2)
export type {
  GetOrgUnitTreeInput,
  GetOrgUnitTreeUseCase,
  GetOrgUnitTreeUseCaseType,
} from './usecases';

export { GetOrgUnitTreeUseCaseImpl } from './usecases';

// Use cases (Multi-Tenant Admin UI - Task 11.1)
export type {
  CreateOrgUnitUseCaseInput,
  CreateOrgUnitUseCase,
  CreateOrgUnitUseCaseType,
  UpdateOrgUnitUseCaseInput,
  UpdateOrgUnitUseCase,
  UpdateOrgUnitUseCaseType,
  DeleteOrgUnitUseCaseInput,
  DeleteOrgUnitUseCase,
  DeleteOrgUnitUseCaseType,
} from './usecases';

export {
  CreateOrgUnitUseCaseImpl,
  UpdateOrgUnitUseCaseImpl,
  DeleteOrgUnitUseCaseImpl,
} from './usecases';

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
