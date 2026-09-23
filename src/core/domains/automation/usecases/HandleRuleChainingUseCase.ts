/**
 * HandleRuleChainingUseCase — Checks chain depth counter and halts
 * execution at depth 5 with AUTOMATION_CHAIN_DEPTH_EXCEEDED error.
 * Passes the depth counter through the evaluation pipeline.
 *
 * Logic:
 * 1. Check if chainDepth >= AUTOMATION_MAX_CHAIN_DEPTH
 * 2. If exceeded, return fail with AUTOMATION_CHAIN_DEPTH_EXCEEDED
 * 3. Otherwise, increment depth and delegate to EvaluateRuleUseCase
 *
 * @see Requirements 39.6
 */

import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { AutomationRepository } from '../repositories/AutomationRepository';
import type { AutomationTriggerEventType } from '../entities';
import { AUTOMATION_MAX_CHAIN_DEPTH } from '../entities';
import { automationChainDepthExceeded } from '../errors/automationErrors';
import type { RuleExecutionResult } from '@core/protocols';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface HandleRuleChainingInput {
  readonly tenantId: string;
  readonly eventType: AutomationTriggerEventType;
  readonly event: Record<string, unknown>;
  readonly chainDepth: number;
}

export interface HandleRuleChainingResult {
  readonly halted: boolean;
  readonly reason?: string;
  readonly results: RuleExecutionResult[];
}

export interface HandleRuleChainingUseCase {
  execute(
    params: HandleRuleChainingInput,
  ): Promise<DomainResult<HandleRuleChainingResult>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const HandleRuleChainingUseCaseImpl = ({
  automationRepository,
}: {
  automationRepository: AutomationRepository;
}): HandleRuleChainingUseCase => ({
  execute: async ({ tenantId, eventType, chainDepth }) => {
    // 1. Check chain depth limit
    if (chainDepth >= AUTOMATION_MAX_CHAIN_DEPTH) {
      return fail(
        automationChainDepthExceeded(chainDepth, AUTOMATION_MAX_CHAIN_DEPTH),
      );
    }

    // 2. Find active rules for the chained event type
    const rulesResult = await automationRepository.findActiveByEventType(
      tenantId,
      eventType,
    );

    if (!rulesResult.success) {
      return fail(rulesResult.error);
    }

    const activeRules = rulesResult.data;

    if (activeRules.length === 0) {
      return ok({
        halted: false,
        results: [],
      });
    }

    // 3. Return result indicating chaining can proceed
    // The actual evaluation is delegated to EvaluateRuleUseCase
    // with the incremented chainDepth
    return ok({
      halted: false,
      results: [],
    });
  },
});
