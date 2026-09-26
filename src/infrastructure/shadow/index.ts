/**
 * Shadow Mode Authorization Module — Barrel Export
 *
 * This module provides shadow mode authorization validation for the
 * multi-tenant integration cutover. It enables parallel execution of
 * legacy and new authorization systems to validate the new system
 * before full cutover.
 *
 * **Exports:**
 * - `ShadowAuthExecutorImpl` — Factory function for creating the executor
 * - All types from `./types`
 *
 * **Deprecation Notice:**
 * The legacy authorization types exported from this module (`LegacyAuthResult`,
 * `MismatchLogLegacyResult`) are part of the shadow mode validation system and
 * will be removed 30 days after migration completion validation. After cutover
 * is complete and shadow mode is disabled, this entire module may be archived.
 *
 * @see Requirements 4 (AC 1-8) — Shadow Mode Authorization
 * @see Requirements 18.3 — TSDoc warnings for legacy patterns
 * @see Design Shadow Mode Authorization
 */

// Service
export { ShadowAuthExecutorImpl } from './ShadowAuthExecutor';
export type { ShadowAuthExecutor } from './ShadowAuthExecutor';

// Types
export {
  // Configuration
  type ShadowAuthConfig,
  type ShadowModeThresholds,

  /**
   * @deprecated Legacy authorization result type — will be removed 30 days after
   * migration completion. Use {@link NewAuthResult} for new implementations.
   */
  type LegacyAuthResult,
  type NewAuthResult,
  type ShadowAuthResult,

  // Mismatch Types
  MismatchType,
  type MismatchLogEntry,
  /**
   * @deprecated Legacy log result type — will be removed alongside LegacyAuthResult.
   */
  type MismatchLogLegacyResult,
  type MismatchLogNewResult,

  // Metrics
  type ShadowMetrics,

  // Execution Context
  type ShadowExecutionContext,

  // Service Interface
  type IShadowAuthExecutor,

  // Constants
  DEFAULT_MISMATCH_ALERT_THRESHOLD,
  DEFAULT_LATENCY_WARNING_THRESHOLD_MS,
  DEFAULT_EXCLUDED_ROUTES,
} from './types';
