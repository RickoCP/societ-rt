/**
 * Context domain barrel export.
 *
 * This domain handles the active tenant and OrgUnit context management,
 * allowing users to switch between tenants and organizational units.
 *
 * **SECURITY RULES:**
 * - Context switch validates membership exists in target tenant
 * - Target OrgUnit must belong to target tenant
 * - User's membership scope must include target OrgUnit
 * - Only tenant-level admin roles can have null activeOrgUnitId
 *
 * @see FASE 1.8 Task 18: Context Switch Service
 * @see Requirements 4 (AC 1-8)
 */

// Types
export type {
  ContextSwitchParams,
  ContextSwitchResult,
  ActiveContext,
  AvailableContexts,
  TenantContext,
  MembershipContext,
  ContextSwitchValidationResult,
} from './types';

export {
  isValidContextSwitchParams,
  createContextSwitchParams,
} from './types';

// Services
export type {
  IContextSwitchService,
  ContextSwitchService,
  ContextSwitchServiceDependencies,
  ITenantNameResolver,
  IOrgUnitNameResolver,
} from './services';

export { ContextSwitchServiceImpl } from './services';

// Errors
export {
  contextSwitchInvalid,
  contextSwitchNoMembership,
  contextSwitchOrgUnitNotFound,
  contextSwitchOrgUnitTenantMismatch,
  contextSwitchOutOfScope,
  contextSwitchInvalidScope,
  contextSwitchUserQuarantined,
  contextSwitchMembershipInactive,
  contextSwitchAmbiguousMembership,
} from './errors';
