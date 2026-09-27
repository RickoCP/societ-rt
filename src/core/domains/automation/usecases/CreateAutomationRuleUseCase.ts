/**
 * CreateAutomationRuleUseCase — Validates a new automation rule definition,
 * enforces the 50 active rules per tenant limit, persists the rule,
 * and enqueues an audit log entry.
 *
 * Logic:
 * 1. Validate rule definition via AutomationEngineProtocol
 * 2. Count active rules for tenant; reject if >= 50
 * 3. Persist rule via AutomationRepository
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(rule)
 *
 * @see Requirements 39.1, 39.11, 39.12, 39.13
 */

import type { AuditQueueProtocol, AutomationEngineProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { AutomationRepository } from '../repositories/AutomationRepository';
import type { AutomationRule, CreateAutomationRuleInput } from '../entities';
import { AUTOMATION_MAX_ACTIVE_RULES_PER_TENANT } from '../entities';
import {
  automationRuleInvalid,
  automationRuleLimitExceeded,
} from '../errors/automationErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreateAutomationRuleUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: CreateAutomationRuleInput;
  }): Promise<DomainResult<AutomationRule>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreateAutomationRuleUseCaseImpl = ({
  automationRepository,
  automationEngineProtocol,
  auditQueueProtocol,
}: {
  automationRepository: AutomationRepository;
  automationEngineProtocol: AutomationEngineProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): CreateAutomationRuleUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Validate rule definition
    const validationResult = automationEngineProtocol.validateRuleDefinition(data);
    if (!validationResult.success) {
      return fail(automationRuleInvalid(validationResult.error.message));
    }

    // 2. Enforce 50 active rules limit per tenant
    const countResult = await automationRepository.countActiveRules(
      authContext.tenantId,
    );
    if (!countResult.success) {
      return fail(countResult.error);
    }

    const isRuleEnabled = data.enabled !== false;
    if (isRuleEnabled && countResult.data >= AUTOMATION_MAX_ACTIVE_RULES_PER_TENANT) {
      return fail(
        automationRuleLimitExceeded(
          countResult.data,
          AUTOMATION_MAX_ACTIVE_RULES_PER_TENANT,
        ),
      );
    }

    // 3. Persist rule
    const createResult = await automationRepository.createRule(
      authContext.tenantId,
      data,
    );
    if (!createResult.success) {
      return fail(createResult.error);
    }

    const rule = createResult.data;

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'automation_rule_created',
        resourceType: 'automation_rule',
        resourceId: rule.id,
        details: {
          name: rule.name,
          triggerEventType: rule.triggerEventType,
          conditionsCount: rule.conditions.length,
          actionsCount: rule.actions.length,
          enabled: rule.enabled,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(rule);
  },
});
