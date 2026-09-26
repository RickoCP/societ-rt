/**
 * Authorization Cutover Module — Atomic switching from legacy to new authorization.
 *
 * This module provides the infrastructure for managing the cutover from legacy
 * (User.tenantId + UserRole) to new (Membership-based) authorization.
 *
 * **Key Components:**
 * - AuthorizationCutoverService: Main service for cutover operations
 * - CutoverPlanService: Cutover plan configuration with route ordering
 * - CutoverMonitoringService: Stability monitoring for cutover
 * - CutoverExecutionService: Route-by-route cutover execution workflow
 * - CutoverFlagResolver: Granular feature flag control for cutover
 *
 * **Prerequisites for Cutover:**
 * - Pre-cutover write compatibility gate PASS (Task 24)
 * - Mismatch rate < 0.1% (cutover eligibility threshold)
 * - Observation window >= 7 days
 * - Sample size >= 10,000 requests
 * - Zero legacy-only authorization writers
 *
 * @see Task 25: Authorization Cutover Service
 * @see Task 26: Cutover Execution and Monitoring
 * @see Task 12.1-12.6: Cutover Flag System
 * @see Requirements 5 (AC 1-8) — Cutover Feature Flags
 * @see Requirements 8 (AC 1-7)
 * @see TPR-06: Warning vs Cutover threshold semantics
 */

// ============================================================================
// Types
// ============================================================================

export type {
  RouteCutoverConfig,
  MutableRouteCutoverConfig,
  CutoverAuditEntry,
  CutoverPrerequisitesResult,
  PrerequisiteCheckResult,
  InitiateRouteCutoverParams,
  RollbackRouteCutoverParams,
  CutoverStatusResponse,
  CutoverOperationResult,
  RollbackOperationResult,
  AuditLogOptions,
  IAuthorizationCutoverService,
  ICutoverAlertEmitter,
  CriticalAlertParams,
  InfoAlertParams,
} from './types';

export {
  CutoverStatus,
  CutoverAuditAction,
  CUTOVER_MISMATCH_THRESHOLD,
  CUTOVER_MIN_SAMPLE_SIZE,
} from './types';

// ============================================================================
// Cutover Plan Types & Service (Task 26)
// ============================================================================

export type {
  CutoverRouteConfig,
  CutoverPhaseConfig,
  CutoverPlanConfig,
  CutoverPlanValidationResult,
  OrderedCutoverRoute,
  ICutoverPlanService,
} from './CutoverPlan';

export {
  CutoverPriority,
  DEFAULT_CUTOVER_PLAN,
  createCutoverPlanService,
} from './CutoverPlan';

export type { CutoverPlanService } from './CutoverPlan';

// ============================================================================
// Cutover Monitoring Types & Service (Task 26)
// ============================================================================

export type {
  StabilityCriteria,
  RouteStabilityMetrics,
  SystemStabilityMetrics,
  StabilityCheckResult,
  StabilityCheckItem,
  StabilityChangeEvent,
  StabilityChangeCallback,
  ICutoverMonitoringService,
} from './CutoverMonitoringService';

export {
  HealthStatus,
  DEFAULT_STABILITY_CRITERIA,
  createCutoverMonitoringService,
} from './CutoverMonitoringService';

export type { CutoverMonitoringService } from './CutoverMonitoringService';

// ============================================================================
// Cutover Execution Types & Service (Task 26)
// ============================================================================

export type {
  RouteExecutionResult,
  RollbackTestResult,
  ExecutionPlan,
  ExecutionPhase,
  ExecutionProgress,
  ExecuteCutoverOptions,
  ExecutionResult,
  ICutoverExecutionService,
} from './CutoverExecutionService';

export {
  ExecutionStatus,
  ExecutionMode,
  ExecutionErrorCodes,
  createCutoverExecutionService,
} from './CutoverExecutionService';

export type { CutoverExecutionService } from './CutoverExecutionService';

// ============================================================================
// Services
// ============================================================================

export type { AuthorizationCutoverService } from './AuthorizationCutoverService';
export { AuthorizationCutoverServiceImpl } from './AuthorizationCutoverService';

// ============================================================================
// Cutover Flag Resolver (Tasks 12.1-12.6)
// ============================================================================

export type {
  CutoverPrerequisitesConfig,
  CutoverFlagPrerequisitesResult,
  CutoverFlagAuditEntry,
  CutoverFlagState,
  UpdateFlagParams,
  RollbackParams,
  RollbackResult,
  ICutoverFlagResolver,
  CutoverFlagResolver,
} from './CutoverFlagResolver';

export {
  CUTOVER_FLAG_NAMES,
  DEFAULT_PREREQUISITES_CONFIG,
  CutoverFlagErrorCode,
  CutoverFlagError,
  CutoverFlagResolverImpl,
} from './CutoverFlagResolver';
