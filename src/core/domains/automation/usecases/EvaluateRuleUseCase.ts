/**
 * EvaluateRuleUseCase — Finds active rules for a given event type,
 * filters by schedule window, evaluates conditions, and executes
 * actions if all conditions are met.
 *
 * Logic:
 * 1. Find active rules for the event type via repository
 * 2. Filter rules by schedule window (scheduleStart/scheduleEnd)
 * 3. For each matching rule, evaluate all conditions
 * 4. If all conditions met, execute actions via AutomationEngineProtocol
 * 5. Log execution results
 *
 * @see Requirements 39.2, 39.3, 39.5, 39.8, 39.10
 */

import type { AutomationEngineProtocol, RuleEvaluationContext } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { AutomationRepository } from '../repositories/AutomationRepository';
import type {
  AutomationRule,
  AutomationCondition,
  AutomationTriggerEventType,
} from '../entities';
import type { RuleExecutionResult } from '@core/protocols';

// ---------------------------------------------------------------------------
// Condition evaluators (pure functions)
// ---------------------------------------------------------------------------

/**
 * Evaluate a single condition against an event payload.
 * Returns true if the condition is satisfied.
 */
export function evaluateCondition(
  condition: AutomationCondition,
  event: Record<string, unknown>,
): boolean {
  const fieldValue = event[condition.field];

  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value;

    case 'not_equals':
      return fieldValue !== condition.value;

    case 'greater_than':
      return Number(fieldValue) > Number(condition.value);

    case 'less_than':
      return Number(fieldValue) < Number(condition.value);

    case 'time_between':
      return isCurrentTimeBetween(String(condition.value));

    case 'duration_exceeds':
      return Number(fieldValue) > Number(condition.value);

    default:
      return false;
  }
}

/**
 * Check if the current time is between two HH:mm values.
 * Value format: "HH:mm-HH:mm" (e.g., "22:00-06:00")
 * Supports overnight ranges (e.g., 22:00-06:00 means 22:00 to next day 06:00).
 */
export function isCurrentTimeBetween(
  value: string,
  now?: Date,
): boolean {
  const parts = value.split('-');
  if (parts.length !== 2) return false;

  const [startStr, endStr] = parts;
  const currentDate = now ?? new Date();
  const currentMinutes =
    currentDate.getHours() * 60 + currentDate.getMinutes();

  const startMinutes = parseTimeToMinutes(startStr!);
  const endMinutes = parseTimeToMinutes(endStr!);

  if (startMinutes === null || endMinutes === null) return false;

  // Handle overnight range (e.g., 22:00-06:00)
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  // Overnight: current is after start OR before end
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

/**
 * Check if the current time is within a rule's schedule window.
 * If no schedule is defined, the rule is always active.
 */
export function isWithinScheduleWindow(
  rule: AutomationRule,
  now?: Date,
): boolean {
  if (!rule.scheduleStart || !rule.scheduleEnd) {
    return true;
  }

  const timeRange = `${rule.scheduleStart}-${rule.scheduleEnd}`;
  return isCurrentTimeBetween(timeRange, now);
}

/**
 * Evaluate all conditions for a rule against an event payload.
 * All conditions must be met (AND logic).
 */
export function evaluateAllConditions(
  conditions: AutomationCondition[],
  event: Record<string, unknown>,
): boolean {
  if (conditions.length === 0) return true;
  return conditions.every(condition => evaluateCondition(condition, event));
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function parseTimeToMinutes(timeStr: string): number | null {
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EvaluateRuleInput {
  readonly tenantId: string;
  readonly eventType: AutomationTriggerEventType;
  readonly event: Record<string, unknown>;
  readonly chainDepth?: number;
}

export interface EvaluateRuleUseCase {
  execute(params: EvaluateRuleInput): Promise<DomainResult<RuleExecutionResult[]>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const EvaluateRuleUseCaseImpl = ({
  automationRepository,
  automationEngineProtocol,
}: {
  automationRepository: AutomationRepository;
  automationEngineProtocol: AutomationEngineProtocol;
}): EvaluateRuleUseCase => ({
  execute: async ({ tenantId, eventType, event, chainDepth = 0 }) => {
    // 1. Find active rules for the event type
    const rulesResult = await automationRepository.findActiveByEventType(
      tenantId,
      eventType,
    );
    if (!rulesResult.success) {
      return fail(rulesResult.error);
    }

    const activeRules = rulesResult.data;
    if (activeRules.length === 0) {
      return ok([]);
    }

    // 2. Filter by schedule window
    const scheduledRules = activeRules.filter(rule =>
      isWithinScheduleWindow(rule),
    );

    if (scheduledRules.length === 0) {
      return ok([]);
    }

    // 3. Evaluate conditions and execute actions for matching rules
    const context: RuleEvaluationContext = {
      event,
      chainDepth,
      tenantId,
    };

    const results: RuleExecutionResult[] = [];

    for (const rule of scheduledRules) {
      // Evaluate conditions
      const conditionsMet = evaluateAllConditions(rule.conditions, event);

      if (conditionsMet) {
        // Execute actions via engine protocol
        const executionResult = await automationEngineProtocol.evaluateRule(
          rule,
          context,
        );

        if (executionResult.success) {
          results.push(executionResult.data);
        } else {
          // Log failed execution but continue with other rules
          results.push({
            ruleId: rule.id,
            conditionsMet: true,
            actionsExecuted: [],
            durationMs: 0,
            status: 'failure',
            error: executionResult.error.message,
          });
        }
      } else {
        results.push({
          ruleId: rule.id,
          conditionsMet: false,
          actionsExecuted: [],
          durationMs: 0,
          status: 'success',
          error: null,
        });
      }
    }

    return ok(results);
  },
});
