/**
 * SwitchContextUseCase — Handles tenant/OrgUnit context switching for users.
 *
 * Logic:
 * 1. Validate and switch context via ContextSwitchService (domain service)
 * 2. Call ContextSwitchRepository to issue new tokens for the context
 * 3. Return the new access token and context info
 * 4. Enqueue audit log for the context switch event
 *
 * @see Requirements 1.5-1.7
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { IContextSwitchService } from '@core/domains/context';
import type {
  ContextSwitchRepository,
  ContextSwitchOutput,
  MembershipSummary,
} from '../repositories/ContextSwitchRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwitchContextInput {
  readonly userId: string;
  readonly targetTenantId: string;
  readonly targetOrgUnitId: string | null;
  readonly ipAddress?: string;
}

export interface SwitchContextOutput {
  readonly accessToken: string;
  readonly newContext: {
    readonly tenantId: string;
    readonly tenantName: string;
    readonly orgUnitId: string | null;
    readonly orgUnitName: string | null;
    readonly role: string;
  };
  readonly membershipId: string;
  readonly expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SwitchContextUseCase {
  /**
   * Execute the context switch.
   *
   * @param params - Context switch parameters
   * @returns DomainResult with new token and context info
   */
  execute(params: SwitchContextInput): Promise<DomainResult<SwitchContextOutput>>;

  /**
   * Get all memberships for a user (for the switcher dropdown).
   *
   * @param userId - The user's ID
   * @returns DomainResult with membership summaries
   */
  getMemberships(userId: string): Promise<DomainResult<MembershipSummary[]>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const SwitchContextUseCaseImpl = ({
  contextSwitchService,
  contextSwitchRepository,
  auditQueueProtocol,
}: {
  contextSwitchService: IContextSwitchService;
  contextSwitchRepository: ContextSwitchRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): SwitchContextUseCase => ({
  execute: async ({
    userId,
    targetTenantId,
    targetOrgUnitId,
    ipAddress,
  }) => {
    // 1. Validate and switch context via the domain service
    const validationResult = await contextSwitchService.switchContext({
      userId,
      targetTenantId,
      targetOrgUnitId,
    });

    if (!validationResult.success) {
      return fail(validationResult.error);
    }

    const { membershipId } = validationResult.data;

    // 2. Call repository to issue new tokens
    const switchResult = await contextSwitchRepository.switchContext({
      userId,
      targetTenantId,
      targetOrgUnitId,
    });

    if (!switchResult.success) {
      return fail(switchResult.error);
    }

    const { accessToken, expiresAt, context } = switchResult.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: targetTenantId,
        actorUserId: userId,
        actionType: 'context_switch',
        resourceType: 'tenant',
        resourceId: targetTenantId,
        details: {
          toTenantId: targetTenantId,
          toOrgUnitId: targetOrgUnitId,
          role: context.role,
        },
        ipAddress,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success with context info
    return ok({
      accessToken,
      newContext: {
        tenantId: context.tenantId,
        tenantName: context.tenantName,
        orgUnitId: context.orgUnitId,
        orgUnitName: context.orgUnitName,
        role: context.role,
      },
      membershipId,
      expiresAt,
    });
  },

  getMemberships: async (userId: string) => {
    return contextSwitchRepository.getMemberships(userId);
  },
});
