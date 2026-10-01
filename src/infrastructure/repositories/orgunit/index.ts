/**
 * OrgUnit Repository Exports — Infrastructure layer.
 */

export {
  PrismaOrgUnitRepositoryImpl,
  PrismaOrgUnitWriteRepositoryImpl,
  type PrismaOrgUnitRepositoryDeps,
} from './PrismaOrgUnitRepository';

// Admin UI Repository (Multi-Tenant Admin UI - Task 10.2)
export {
  OrgUnitRepositoryImpl,
  type OrgUnitRepositoryImplDeps,
} from './OrgUnitRepositoryImpl';
