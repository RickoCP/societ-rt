/**
 * AutomationExecution — Domain entity representing a single execution
 * record of an automation rule.
 *
 * Every time a rule is triggered and evaluated, an execution record is
 * created regardless of whether actions succeeded or failed.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 39.5, 39.8, 39.9
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type AutomationExecutionStatus =
  | 'success'
  | 'partial_failure'
  | 'failure';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface AutomationExecution {
  readonly id: string;
  readonly ruleId: string;
  readonly tenantId: string;
  readonly triggerEvent: Record<string, unknown>;
  readonly conditionsEvaluated: boolean;
  readonly actionsExecuted: string[];
  readonly durationMs: number;
  readonly status: AutomationExecutionStatus;
  readonly error: string | null;
  readonly executedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to log an automation execution. */
export interface CreateAutomationExecutionInput {
  readonly ruleId: string;
  readonly tenantId: string;
  readonly triggerEvent: Record<string, unknown>;
  readonly conditionsEvaluated: boolean;
  readonly actionsExecuted: string[];
  readonly durationMs: number;
  readonly status: AutomationExecutionStatus;
  readonly error?: string | null;
}
