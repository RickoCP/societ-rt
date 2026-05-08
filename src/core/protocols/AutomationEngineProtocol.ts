/**
 * AutomationEngineProtocol — Core abstraction for the automation rule
 * engine that evaluates rules and executes actions based on device events.
 *
 * Infrastructure layer provides the concrete implementation that
 * orchestrates rule evaluation, condition checking, action execution,
 * and chain depth management.
 *
 * @see Requirements 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.11, 39.12
 */

import type { DomainResult } from '@core/utils';
import type {
  AutomationRule,
  AutomationTriggerEventType,
  CreateAutomationRuleInput,
} from '@core/domains/automation/entities';

// ---------------------------------------------------------------------------
// Rule evaluation context
// ---------------------------------------------------------------------------

/** Context passed through the rule evaluation pipeline. */
export interface RuleEvaluationContext {
  /** The event that triggered the evaluation. */
  readonly event: Record<string, unknown>;
  /** Current chain depth (starts at 0, max 5). */
  readonly chainDepth: number;
  /** Tenant ID for scoping. */
  readonly tenantId: string;
}

/** Result of a single rule evaluation and execution. */
export interface RuleExecutionResult {
  readonly ruleId: string;
  readonly conditionsMet: boolean;
  readonly actionsExecuted: string[];
  readonly durationMs: number;
  readonly status: 'success' | 'partial_failure' | 'failure';
  readonly error: string | null;
}

// ---------------------------------------------------------------------------
// Protocol interface
// ---------------------------------------------------------------------------

export interface AutomationEngineProtocol {
  /**
   * Evaluate a single rule against an event context.
   * Checks schedule window, evaluates conditions, and executes actions
   * if all conditions are met.
   */
  evaluateRule(
    rule: AutomationRule,
    context: RuleEvaluationContext,
  ): Promise<DomainResult<RuleExecutionResult>>;

  /**
   * Execute all configured actions for a rule.
   * Actions execute sequentially; if one fails, remaining actions still
   * execute (partial failure pattern).
   *
   * @see Requirement 39.9
   */
  executeActions(
    rule: AutomationRule,
    context: RuleEvaluationContext,
  ): Promise<DomainResult<RuleExecutionResult>>;

  /**
   * Validate a rule definition at creation time.
   * Ensures trigger events, conditions, and actions reference valid types
   * and parameters.
   *
   * @see Requirement 39.12
   */
  validateRuleDefinition(
    input: CreateAutomationRuleInput,
  ): DomainResult<void>;

  /**
   * Get all active rules for a specific event type within a tenant.
   * Filters by enabled status and optionally by schedule window.
   *
   * @see Requirement 39.5
   */
  getActiveRulesForEvent(
    tenantId: string,
    eventType: AutomationTriggerEventType,
  ): Promise<DomainResult<AutomationRule[]>>;
}
