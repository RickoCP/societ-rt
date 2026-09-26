/**
 * Compatibility Module Barrel Export
 *
 * This module provides write compatibility infrastructure for the authorization
 * migration from legacy User.role/tenantId to Membership-based authorization.
 *
 * **PRIMARY EXPORTS:**
 *
 * PRE-CUTOVER (Task 24):
 * - `createWritePathInventoryService()` — Factory for write path inventory
 * - `createAuthorizationWriteCompatibilityService()` — Factory for dual-write operations
 * - `createPreCutoverGateService()` — Factory for pre-cutover gate verification
 *
 * POST-CUTOVER (Task 28):
 * - `createWritePathRetirementPolicyService()` — Factory for retirement policy rules
 * - `createWritePathFinalizationService()` — Factory for write path retirement orchestration
 *
 * **PURPOSE:**
 *
 * PRE-CUTOVER (Task 24 - TPR-05-FINAL):
 * Ensure ALL authorization-affecting writes synchronize Membership BEFORE cutover.
 * - All auth-affecting write paths inventoried
 * - Every writer classified
 * - ZERO legacy-only writers remain
 * - Every required compatibility writer active
 * - Pre-cutover gate passes
 *
 * POST-CUTOVER (Task 28):
 * Finalize write path migration AFTER cutover is stable.
 * - Verify Membership-authoritative write path operational
 * - Migrate remaining non-critical compatibility write paths
 * - Progressively retire temporary dual-write mechanisms
 * - Remove obsolete legacy-only writes when safe
 * - Preserve quarantine rules (PNA-01..PNA-05 unchanged)
 *
 * @see Task 24: Pre-Cutover Authorization Write Compatibility
 * @see Task 28: Post-Cutover Write Path Finalization
 * @see Requirements 8, 9, 45, 48
 *
 * @example
 * ```typescript
 * import {
 *   createWritePathInventoryService,
 *   createPreCutoverGateService,
 *   createWritePathRetirementPolicyService,
 *   createWritePathFinalizationService,
 * } from '@infrastructure/compatibility';
 *
 * // Pre-cutover: Check if cutover can proceed
 * const inventoryService = createWritePathInventoryService();
 * const gateService = createPreCutoverGateService({
 *   inventoryService,
 *   quarantineService,
 * });
 * const gateResult = await gateService.runGateCheck();
 *
 * // Post-cutover: Finalize write paths
 * const policyService = createWritePathRetirementPolicyService({ inventoryService });
 * const finalizationService = createWritePathFinalizationService({
 *   inventoryService,
 *   policyService,
 *   quarantineService,
 *   cutoverTimestamp: new Date(),
 * });
 * const finalizationResult = await finalizationService.evaluateAllWritePaths();
 * ```
 */

// Types — Pre-Cutover
export type {
  WritePathEntry,
  WritePathInventorySummary,
  GateCriterion,
  PreCutoverGateResult,
  DualWriteResult,
  DualWriteContext,
  CreateUserWithMembershipParams,
  UpdateRoleWithMembershipParams,
  UserMembershipPair,
  IWritePathInventoryService,
  IAuthorizationWriteCompatibilityService,
  IPreCutoverGateService,
} from './types';

// Types — Post-Cutover (Task 28)
export type {
  WritePathRetirementPolicyConfig,
  WritePathRetirementEvaluation,
  WritePathStabilityMetrics,
  RetirementCondition,
  WritePathFinalizationResult,
  InitiateRetirementParams,
  RetirementOperationResult,
  WritePathRetirementAuditEntry,
  IWritePathRetirementPolicyService,
  IWritePathFinalizationService,
} from './types';

// Enums — Pre-Cutover
export {
  WritePathClassification,
  AuthWriteCategory,
  WritePathStatus,
} from './types';

// Enums — Post-Cutover (Task 28)
export {
  WritePathRetirementStatus,
} from './types';

// Write Path Inventory Service
export {
  createWritePathInventoryService,
  getWritePathInventory,
  WRITE_PATH_COUNT,
} from './WritePathInventory';

// Authorization Write Compatibility Service
export {
  createAuthorizationWriteCompatibilityService,
  generateCorrelationId,
  DualWriteErrorCodes,
} from './AuthorizationWriteCompatibilityService';

// Pre-Cutover Gate Service
export {
  createPreCutoverGateService,
  getGateCheckVersion,
  formatGateResult,
} from './PreCutoverGateService';

// Write Path Retirement Policy Service (Task 28)
export {
  createWritePathRetirementPolicyService,
  getDefaultRetirementPolicy,
  getRollbackWindowHours,
  DEFAULT_RETIREMENT_POLICY,
  ROLLBACK_WINDOW_HOURS,
} from './WritePathRetirementPolicy';

// Write Path Finalization Service (Task 28)
export {
  createWritePathFinalizationService,
} from './WritePathFinalizationService';
export type { WritePathFinalizationService } from './WritePathFinalizationService';
