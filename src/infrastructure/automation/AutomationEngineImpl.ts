/**
 * AutomationEngineImpl — Infrastructure implementation of AutomationEngineProtocol.
 *
 * Orchestrates rule evaluation, condition checking, action execution,
 * and chain depth management for the automation rule engine.
 *
 * @see Requirements 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.9, 39.11, 39.12
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, validationError } from '@core/utils';
import type {
  AutomationEngineProtocol,
  RuleEvaluationContext,
  RuleExecutionResult,
} from '@core/protocols/AutomationEngineProtocol';
import type {
  AutomationRule,
  AutomationTriggerEventType,
  CreateAutomationRuleInput,
} from '@core/domains/automation/entities';
import {
  isValidTriggerEventType,
  isValidConditionOperator,
  isValidActionType,
  AUTOMATION_MAX_CHAIN_DEPTH,
} from '@core/domains/automation/entities';
import type { AutomationRepository } from '@core/domains/automation/repositories/AutomationRepository';

// ---------------------------------------------------------------------------
// Helper: evaluate a single condition
// ---------------------------------------------------------------------------

function evaluateSingleCondition(
  condition: { field: string; operator: string; value: string | number },
  event: Record<string, unknown>,
): boolean {
  const fieldValue = event[condition.field];

  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value;
    case 'not_equals':
      return fieldValue !== condition.value;
    case 'greater_than':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue > condition.value
      );
    case 'less_than':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue < condition.value
      );
    case 'time_between': {
      // value format: "HH:mm-HH:mm"
      if (typeof condition.value !== 'string') return false;
      const parts = condition.value.split('-');
      if (parts.length !== 2) return false;
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = (parts[0] ?? '0:0').split(':').map(Number);
      const [endH, endM] = (parts[1] ?? '0:0').split(':').map(Number);
      const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
      const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);
      if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      }
      // Overnight range (e.g., 22:00-06:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
    case 'duration_exceeds':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue > condition.value
      );
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Helper: check schedule window
// ---------------------------------------------------------------------------

function isWithinScheduleWindow(rule: AutomationRule): boolean {
  if (!rule.scheduleStart || !rule.scheduleEnd) {
    return true; // No schedule restriction
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = rule.scheduleStart.split(':').map(Number);
  const [endH, endM] = rule.scheduleEnd.split(':').map(Number);
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  // Overnight range
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AutomationEngineImpl = ({
  automationRepository,
}: {
  automationRepository: AutomationRepository;
}): AutomationEngineProtocol => ({
  // -------------------------------------------------------------------------
  // evaluateRule
  // -------------------------------------------------------------------------
  async evaluateRule(
    rule: AutomationRule,
    context: RuleEvaluationContext,
  ): Promise<DomainResult<RuleExecutionResult>> {
    const startTime = Date.now();

    // Check chain depth limit
    if (context.chainDepth >= AUTOMATION_MAX_CHAIN_DEPTH) {
      const result: RuleExecutionResult = {
        ruleId: rule.id,
        conditionsMet: false,
        actionsExecuted: [],
        durationMs: Date.now() - startTime,
        status: 'failure',
        error: `Chain depth limit exceeded (max: ${AUTOMATION_MAX_CHAIN_DEPTH})`,
      };
      return ok(result);
    }

    // Check schedule window
    if (!isWithinScheduleWindow(rule)) {
      const result: RuleExecutionResult = {
        ruleId: rule.id,
        conditionsMet: false,
        actionsExecuted: [],
        durationMs: Date.now() - startTime,
        status: 'success',
        error: null,
      };
      return ok(result);
    }

    // Evaluate all conditions (AND logic)
    const allConditionsMet = rule.conditions.every((condition) =>
      evaluateSingleCondition(condition, context.event),
    );

    if (!allConditionsMet) {
      const result: RuleExecutionResult = {
        ruleId: rule.id,
        conditionsMet: false,
        actionsExecuted: [],
        durationMs: Date.now() - startTime,
        status: 'success',
        error: null,
      };
      return ok(result);
    }

    // Execute actions (partial failure pattern)
    const actionsExecuted: string[] = [];
    let hasFailure = false;

    for (const action of rule.actions) {
      try {
        // In a full implementation, each action type would dispatch to
        // the appropriate service. For now, we record the action type.
        actionsExecuted.push(action.type);
      } catch {
        hasFailure = true;
      }
    }

    const durationMs = Date.now() - startTime;
    let status: 'success' | 'partial_failure' | 'failure';
    if (hasFailure && actionsExecuted.length > 0) {
      status = 'partial_failure';
    } else if (hasFailure) {
      status = 'failure';
    } else {
      status = 'success';
    }

    const result: RuleExecutionResult = {
      ruleId: rule.id,
      conditionsMet: true,
      actionsExecuted,
      durationMs,
      status,
      error: hasFailure ? 'Some actions failed during execution' : null,
    };

    return ok(result);
  },

  // -------------------------------------------------------------------------
  // executeActions
  // -------------------------------------------------------------------------
  async executeActions(
    rule: AutomationRule,
    context: RuleEvaluationContext,
  ): Promise<DomainResult<RuleExecutionResult>> {
    const startTime = Date.now();
    const actionsExecuted: string[] = [];
    let hasFailure = false;
    let errorMessage: string | null = null;

    // Execute actions sequentially; continue on failure (partial failure pattern)
    for (const action of rule.actions) {
      try {
        // Each action type would dispatch to the appropriate service
        actionsExecuted.push(action.type);
      } catch (error) {
        hasFailure = true;
        errorMessage =
          error instanceof Error ? error.message : 'Unknown action error';
      }
    }

    const durationMs = Date.now() - startTime;
    let status: 'success' | 'partial_failure' | 'failure';
    if (hasFailure && actionsExecuted.length > 0) {
      status = 'partial_failure';
    } else if (hasFailure && actionsExecuted.length === 0) {
      status = 'failure';
    } else {
      status = 'success';
    }

    const result: RuleExecutionResult = {
      ruleId: rule.id,
      conditionsMet: true,
      actionsExecuted,
      durationMs,
      status,
      error: errorMessage,
    };

    return ok(result);
  },

  // -------------------------------------------------------------------------
  // validateRuleDefinition
  // -------------------------------------------------------------------------
  validateRuleDefinition(
    input: CreateAutomationRuleInput,
  ): DomainResult<void> {
    // Validate trigger event type
    if (!isValidTriggerEventType(input.triggerEventType)) {
      return fail(
        validationError(
          'AUTOMATION_INVALID_TRIGGER_EVENT',
          `Invalid trigger event type: ${input.triggerEventType}`,
        ),
      );
    }

    // Validate conditions
    if (!input.conditions || input.conditions.length === 0) {
      return fail(
        validationError(
          'AUTOMATION_NO_CONDITIONS',
          'At least one condition is required',
        ),
      );
    }

    for (const condition of input.conditions) {
      if (!condition.field || condition.field.trim() === '') {
        return fail(
          validationError(
            'AUTOMATION_INVALID_CONDITION_FIELD',
            'Condition field must not be empty',
          ),
        );
      }
      if (!isValidConditionOperator(condition.operator)) {
        return fail(
          validationError(
            'AUTOMATION_INVALID_CONDITION_OPERATOR',
            `Invalid condition operator: ${condition.operator}`,
          ),
        );
      }
    }

    // Validate actions
    if (!input.actions || input.actions.length === 0) {
      return fail(
        validationError(
          'AUTOMATION_NO_ACTIONS',
          'At least one action is required',
        ),
      );
    }

    for (const action of input.actions) {
      if (!isValidActionType(action.type)) {
        return fail(
          validationError(
            'AUTOMATION_INVALID_ACTION_TYPE',
            `Invalid action type: ${action.type}`,
          ),
        );
      }
    }

    // Validate maxChainDepth if provided
    if (
      input.maxChainDepth !== undefined &&
      (input.maxChainDepth < 1 || input.maxChainDepth > AUTOMATION_MAX_CHAIN_DEPTH)
    ) {
      return fail(
        validationError(
          'AUTOMATION_INVALID_CHAIN_DEPTH',
          `Max chain depth must be between 1 and ${AUTOMATION_MAX_CHAIN_DEPTH}`,
        ),
      );
    }

    return ok(undefined);
  },

  // -------------------------------------------------------------------------
  // getActiveRulesForEvent
  // -------------------------------------------------------------------------
  async getActiveRulesForEvent(
    tenantId: string,
    eventType: AutomationTriggerEventType,
  ): Promise<DomainResult<AutomationRule[]>> {
    const result = await automationRepository.findActiveByEventType(
      tenantId,
      eventType,
    );

    if (!result.success) {
      return fail(result.error);
    }

    // Filter by schedule window
    const activeRules = result.data.filter(isWithinScheduleWindow);

    return ok(activeRules);
  },
});
