/**
 * OrgUnit services barrel export.
 *
 * @see FASE 1.6 Task 6: OrgUnit Hierarchy Read Support
 * @see FASE 1.19 Task 57: OrgUnit Management Service
 * @see FASE 1.19 Task 58: OrgUnit CRUD Operations (Req 34)
 * @see Requirements 1 (AC 6), 6 (AC 1-2, 5), 21 (AC 1-9), 46 (AC 1-9)
 */

export type {
  IOrgUnitHierarchyReader,
  OrgUnitHierarchyReader,
} from './OrgUnitHierarchyReader';

export { OrgUnitHierarchyReaderImpl } from './OrgUnitHierarchyReader';

export type {
  IOrgUnitEventEmitter,
  OrgUnitLifecycleEvent,
  OrgUnitEventBase,
  OrgUnitCreatedEvent,
  OrgUnitUpdatedEvent,
  OrgUnitMovedEvent,
  OrgUnitDeletedEvent,
  OrgUnitSubtreeDeletedEvent,
  OrgUnitPathRepairedEvent,
} from './OrgUnitEventEmitter';

export {
  OrgUnitEventType,
  createOrgUnitCreatedEvent,
  createOrgUnitUpdatedEvent,
  createOrgUnitMovedEvent,
  createOrgUnitDeletedEvent,
  createOrgUnitSubtreeDeletedEvent,
  createOrgUnitPathRepairedEvent,
} from './OrgUnitEventEmitter';

export type {
  IOrgUnitManagementService,
  OrgUnitManagementService,
  CreateOrgUnitCommand,
  UpdateOrgUnitCommand,
  MoveOrgUnitCommand,
  DeleteOrgUnitCommand,
  RepairPathsCommand,
  CreateOrgUnitResult,
  UpdateOrgUnitResult,
  MoveOrgUnitResult,
  DeleteOrgUnitResult,
  RepairPathsResult,
  PathRepairDetail,
} from './OrgUnitManagementService';

export { OrgUnitManagementServiceImpl } from './OrgUnitManagementService';

// FASE 1.19 Task 58: OrgUnit CRUD Operations (Req 34)
export type {
  IOrgUnitCrudService,
  OrgUnitCrudService,
  AuthorizedCreateOrgUnitCommand,
  AuthorizedUpdateOrgUnitCommand,
  AuthorizedMoveOrgUnitCommand,
  AuthorizedDeleteOrgUnitCommand,
  ListOrgUnitsQuery,
  ListOrgUnitsResult,
} from './OrgUnitCrudService';

export { OrgUnitCrudServiceImpl, ORGUNIT_PERMISSIONS } from './OrgUnitCrudService';

// FASE 1.19 Task 59: Multi-Cluster Support (Req 58)
export type {
  IMultiClusterService,
  MultiClusterService,
  CreateClusterCommand,
  SwitchClusterCommand,
  DeleteClusterCommand,
  ListClustersResult,
  ClusterDetailsResult,
  ClusterSwitchResult,
  AvailableClustersResult,
} from './MultiClusterService';

export { MultiClusterServiceImpl, CLUSTER_PERMISSIONS } from './MultiClusterService';
