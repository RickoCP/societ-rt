/**
 * AutomationRepositoryImpl — Infrastructure implementation of AutomationRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on AutomationRule
 * and AutomationExecution models. Handles rule CRUD, enable/disable,
 * execution logging, and active rule counting.
 *
 * @see Requirements 39.1, 39.5, 39.7, 39.8, 39.11
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  AutomationRepository,
  AutomationRuleFilters,
  PaginatedAutomationRuleResult,
} from '@core/domains/automation/repositories/AutomationRepository';
import type {
  AutomationRule,
  AutomationTriggerEventType,
  AutomationCondition,
  AutomationAction,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  AutomationExecution,
  AutomationExecutionStatus,
  CreateAutomationExecutionInput,
} from '@core/domains/automation/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaAutomationRule {
  id: string;
  tenantId: string;
  name: string;
  triggerEventType: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  maxChainDepth: number;
  executionCount: number;
  lastExecutedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaAutomationExecution {
  id: string;
  ruleId: string;
  tenantId: string;
  triggerEvent: unknown;
  conditionsEvaluated: boolean;
  actionsExecuted: string[];
  durationMs: number;
  status: string;
  error: string | null;
  executedAt: Date;
}

function mapPrismaRuleToDomain(p: PrismaAutomationRule): AutomationRule {
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    triggerEventType: p.triggerEventType as AutomationTriggerEventType,
    conditions: (p.conditions as AutomationCondition[]) ?? [],
    actions: (p.actions as AutomationAction[]) ?? [],
    enabled: p.enabled,
    scheduleStart: p.scheduleStart,
    scheduleEnd: p.scheduleEnd,
    maxChainDepth: p.maxChainDepth,
    executionCount: p.executionCount,
    lastExecutedAt: p.lastExecutedAt,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mapPrismaExecutionToDomain(
  p: PrismaAutomationExecution,
): AutomationExecution {
  return {
    id: p.id,
    ruleId: p.ruleId,
    tenantId: p.tenantId,
    triggerEvent: (p.triggerEvent as Record<string, unknown>) ?? {},
    conditionsEvaluated: p.conditionsEvaluated,
    actionsExecuted: p.actionsExecuted,
    durationMs: p.durationMs,
    status: p.status as AutomationExecutionStatus,
    error: p.error,
    executedAt: p.executedAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AutomationRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): AutomationRepository => {
  const ruleRepo: TenantScopedRepository<PrismaAutomationRule> =
    createTenantScopedRepository(
      prismaClient.automationRule as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const executionRepo: TenantScopedRepository<PrismaAutomationExecution> =
    createTenantScopedRepository(
      prismaClient.automationExecution as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // createRule
    // -----------------------------------------------------------------------
    async createRule(
      tenantId: string,
      data: CreateAutomationRuleInput,
    ): Promise<DomainResult<AutomationRule>> {
      try {
        const rule = await ruleRepo.create(tenantId, {
          data: {
            name: data.name,
            triggerEventType: data.triggerEventType,
            conditions: data.conditions as unknown,
            actions: data.actions as unknown,
            enabled: data.enabled !== false,
            scheduleStart: data.scheduleStart ?? null,
            scheduleEnd: data.scheduleEnd ?? null,
            maxChainDepth: data.maxChainDepth ?? 5,
            executionCount: 0,
            createdBy: data.createdBy,
          },
        });

        return ok(mapPrismaRuleToDomain(rule));
      } catch (error) {
        return fail(
          technicalError(
            'AUTOMATION_CREATE_RULE_FAILED',
            'Failed to create automation rule',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTenant
    // -----------------------------------------------------------------------
    async findByTenant(
      tenantId: string,
      page: number,
      pageSize: number,
      filters?: AutomationRuleFilters,
    ): Promise<DomainResult<PaginatedAutomationRuleResult>> {
      try {
        const where: Record<string, unknown> = {};

        if (filters?.enabled !== undefined) {
          where.enabled = filters.enabled;
        }
        if (filters?.triggerEventType) {
          where.triggerEventType = filters.triggerEventType;
        }

        const [rules, total] = await Promise.all([
          ruleRepo.findMany(tenantId, {
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          ruleRepo.count(tenantId, { where }),
        ]);

        return ok({
          data: rules.map(mapPrismaRuleToDomain),
          total,
          page,
          pageSize,
        });
      } catch (error) {
        return fail(
          technicalError(
            'AUTOMATION_FIND_BY_TENANT_FAILED',
            'Failed to find automation rules for tenant',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findActiveByEventType
    // -----------------------------------------------------------------------
    async findActiveByEventType(
      tenantId: string,
      eventType: AutomationTriggerEventType,
    ): Promise<DomainResult<AutomationRule[]>> {
      try {
        const rules = await ruleRepo.findMany(tenantId, {
          where: {
            triggerEventType: eventType,
            enabled: true,
          },
          orderBy: { createdAt: 'asc' },
        });

        return ok(rules.map(mapPrismaRuleToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'AUTOMATION_FIND_ACTIVE_BY_EVENT_FAILED',
            'Failed to find active rules by event type',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // updateRule
    // -----------------------------------------------------------------------
    async updateRule(
      tenantId: string,
      ruleId: string,
      data: UpdateAutomationRuleInput,
    ): Promise<DomainResult<AutomationRule>> {
      try {
        const existing = await ruleRepo.findFirst(tenantId, {
          where: { id: ruleId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'AUTOMATION_RULE_NOT_FOUND',
              `Automation rule ${ruleId} not found`,
            ),
          );
        }

        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.triggerEventType !== undefined)
          updateData.triggerEventType = data.triggerEventType;
        if (data.conditions !== undefined)
          updateData.conditions = data.conditions as unknown;
        if (data.actions !== undefined)
          updateData.actions = data.actions as unknown;
        if (data.scheduleStart !== undefined)
          updateData.scheduleStart = data.scheduleStart;
        if (data.scheduleEnd !== undefined)
          updateData.scheduleEnd = data.scheduleEnd;
        if (data.maxChainDepth !== undefined)
          updateData.maxChainDepth = data.maxChainDepth;

        const updated = await ruleRepo.update(tenantId, {
          where: { id: ruleId },
          data: updateData,
        });

        return ok(mapPrismaRuleToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'AUTOMATION_UPDATE_RULE_FAILED',
            'Failed to update automation rule',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // enableRule
    // -----------------------------------------------------------------------
    async enableRule(
      tenantId: string,
      ruleId: string,
    ): Promise<DomainResult<AutomationRule>> {
      try {
        const existing = await ruleRepo.findFirst(tenantId, {
          where: { id: ruleId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'AUTOMATION_RULE_NOT_FOUND',
              `Automation rule ${ruleId} not found`,
            ),
          );
        }

        const updated = await ruleRepo.update(tenantId, {
          where: { id: ruleId },
          data: { enabled: true },
        });

        return ok(mapPrismaRuleToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'AUTOMATION_ENABLE_RULE_FAILED',
            'Failed to enable automation rule',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // disableRule
    // -----------------------------------------------------------------------
    async disableRule(
      tenantId: string,
      ruleId: string,
    ): Promise<DomainResult<AutomationRule>> {
      try {
        const existing = await ruleRepo.findFirst(tenantId, {
          where: { id: ruleId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'AUTOMATION_RULE_NOT_FOUND',
              `Automation rule ${ruleId} not found`,
            ),
          );
        }

        const updated = await ruleRepo.update(tenantId, {
          where: { id: ruleId },
          data: { enabled: false },
        });

        return ok(mapPrismaRuleToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'AUTOMATION_DISABLE_RULE_FAILED',
            'Failed to disable automation rule',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // logExecution
    // -----------------------------------------------------------------------
    async logExecution(
      data: CreateAutomationExecutionInput,
    ): Promise<DomainResult<AutomationExecution>> {
      try {
        const execution = await executionRepo.create(data.tenantId, {
          data: {
            ruleId: data.ruleId,
            triggerEvent: data.triggerEvent as unknown,
            conditionsEvaluated: data.conditionsEvaluated,
            actionsExecuted: data.actionsExecuted,
            durationMs: data.durationMs,
            status: data.status,
            error: data.error ?? null,
            executedAt: new Date(),
          },
        });

        // Update execution count and lastExecutedAt on the rule
        await ruleRepo.update(data.tenantId, {
          where: { id: data.ruleId },
          data: {
            executionCount: { increment: 1 },
            lastExecutedAt: new Date(),
          },
        });

        return ok(mapPrismaExecutionToDomain(execution));
      } catch (error) {
        return fail(
          technicalError(
            'AUTOMATION_LOG_EXECUTION_FAILED',
            'Failed to log automation execution',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // countActiveRules
    // -----------------------------------------------------------------------
    async countActiveRules(
      tenantId: string,
    ): Promise<DomainResult<number>> {
      try {
        const count = await ruleRepo.count(tenantId, {
          where: { enabled: true },
        });

        return ok(count);
      } catch (error) {
        return fail(
          technicalError(
            'AUTOMATION_COUNT_ACTIVE_RULES_FAILED',
            'Failed to count active automation rules',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findRuleById
    // -----------------------------------------------------------------------
    async findRuleById(
      tenantId: string,
      ruleId: string,
    ): Promise<DomainResult<AutomationRule | null>> {
      try {
        const rule = await ruleRepo.findFirst(tenantId, {
          where: { id: ruleId },
        });

        if (!rule) {
          return ok(null);
        }

        return ok(mapPrismaRuleToDomain(rule));
      } catch (error) {
        return fail(
          technicalError(
            'AUTOMATION_FIND_RULE_BY_ID_FAILED',
            'Failed to find automation rule by ID',
            { cause: error },
          ),
        );
      }
    },
  };
};
