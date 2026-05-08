/**
 * ExecuteAutomationActionsUseCase — Executes all actions for a triggered
 * automation rule sequentially. Continues on individual failure (partial
 * failure pattern) and logs execution with duration_ms.
 *
 * Logic:
 * 1. Record start time
 * 2. Execute each action sequentially via AutomationEngineProtocol
 * 3. Continue on individual action failure (partial failure)
 * 4. Record end time and calculate duration_ms
 * 5. Log execution via AutomationRepository
 * 6. Return execution result
 *
 * @see Requirements 39.5, 39.8, 39.9
 */

import type { AutomationEngineProtocol, RuleEvaluationContext } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { AutomationRepository } from '../repositories/AutomationRepository';
import type { AutomationRule, AutomationExecution } from '../entities';
import type { AutomationExecutionStatus } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ExecuteAutomationActionsInput {
  readonly rule: AutomationRule;
  readonly context: RuleEvaluationContext;
}

export interface ExecuteAutomationActionsUseCase {
  execute(
    params: ExecuteAutomationActionsInput,
  ): Promise<DomainResult<AutomationExecution>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ExecuteAutomationActionsUseCaseImpl = ({
  automationRepository,
  automationEngineProtocol,
}: {
  automationRepository: AutomationRepository;
  automationEngineProtocol: AutomationEngineProtocol;
}): ExecuteAutomationActionsUseCase => ({
  execute: async ({ rule, context }) => {
    // 1. Record start time
    const startTime = Date.now();

    // 2. Execute actions via engine protocol (handles sequential + partial failure)
    const executionResult = await automationEngineProtocol.executeActions(
      rule,
      context,
    );

    // 3. Calculate duration
    const durationMs = Date.now() - startTime;

    // 4. Determine execution status and details
    let status: AutomationExecutionStatus;
    let actionsExecuted: string[];
    let errorMessage: string | null = null;

    if (executionResult.success) {
      const result = executionResult.data;
      status = result.status;
      actionsExecuted = result.actionsExecuted;
      errorMessage = result.error;
    } else {
      status = 'failure';
      actionsExecuted = [];
      errorMessage = executionResult.error.message;
    }

    // 5. Log execution via repository
    const logResult = await automationRepository.logExecution({
      ruleId: rule.id,
      tenantId: context.tenantId,
      triggerEvent: context.event,
      conditionsEvaluated: true,
      actionsExecuted,
      durationMs,
      status,
      error: errorMessage,
    });

    if (!logResult.success) {
      return fail(logResult.error);
    }

    return ok(logResult.data);
  },
});
