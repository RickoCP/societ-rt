/**
 * EnableDisableRuleUseCase — Toggles an automation rule's enabled state
 * without deleting it. Enqueues audit log for the state change.
 *
 * Logic:
 * 1. Enable or disable the rule via repository
 * 2. Enqueue audit log (fire-and-forget)
 * 3. Return ok(updatedRule)
 *
 * @see Requirements 39.7, 39.13
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { AutomationRepository } from '../repositories/AutomationRepository';
import type { AutomationRule } from '../entities';
import { AUTOMATION_MAX_ACTIVE_RULES_PER_TENANT } from '../entities';
import { automationRuleLimitExceeded } from '../errors/automationErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EnableDisableRuleInput {
  readonly ruleId: string;
  readonly enabled: boolean;
}

export interface EnableDisableRuleUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: EnableDisableRuleInput;
  }): Promise<DomainResult<AutomationRule>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const EnableDisableRuleUseCaseImpl = ({
  automationRepository,
  auditQueueProtocol,
}: {
  automationRepository: AutomationRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): EnableDisableRuleUseCase => ({
  execute: async ({ authContext, data }) => {
    // If enabling, check the active rules limit
    if (data.enabled) {
      const countResult = await automationRepository.countActiveRules(
        authContext.tenantId,
      );
      if (!countResult.success) {
        return fail(countResult.error);
      }
      if (countResult.data >= AUTOMATION_MAX_ACTIVE_RULES_PER_TENANT) {
        return fail(
          automationRuleLimitExceeded(
            countResult.data,
            AUTOMATION_MAX_ACTIVE_RULES_PER_TENANT,
          ),
        );
      }
    }

    // 1. Toggle rule enabled state
    const result = data.enabled
      ? await automationRepository.enableRule(authContext.tenantId, data.ruleId)
      : await automationRepository.disableRule(authContext.tenantId, data.ruleId);

    if (!result.success) {
      return fail(result.error);
    }

    const updatedRule = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: data.enabled
          ? 'automation_rule_enabled'
          : 'automation_rule_disabled',
        resourceType: 'automation_rule',
        resourceId: data.ruleId,
        details: {
          name: updatedRule.name,
          enabled: updatedRule.enabled,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(updatedRule);
  },
});
