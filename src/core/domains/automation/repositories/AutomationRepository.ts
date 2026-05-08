/**
 * AutomationRepository — Core repository interface for automation rule
 * persistence operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 39.1, 39.5, 39.7, 39.8, 39.11
 */

import type { DomainResult } from '@core/utils';
import type {
  AutomationRule,
  AutomationTriggerEventType,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  AutomationExecution,
  CreateAutomationExecutionInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Filter & pagination types
// ---------------------------------------------------------------------------

export interface AutomationRuleFilters {
  readonly enabled?: boolean;
  readonly triggerEventType?: AutomationTriggerEventType;
}

export interface PaginatedAutomationRuleResult {
  readonly data: AutomationRule[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface AutomationRepository {
  /** Create a new automation rule within a tenant. */
  createRule(
    tenantId: string,
    data: CreateAutomationRuleInput,
  ): Promise<DomainResult<AutomationRule>>;

  /** Find automation rules for a tenant with pagination and optional filters. */
  findByTenant(
    tenantId: string,
    page: number,
    pageSize: number,
    filters?: AutomationRuleFilters,
  ): Promise<DomainResult<PaginatedAutomationRuleResult>>;

  /** Find all active rules matching a specific trigger event type for a tenant. */
  findActiveByEventType(
    tenantId: string,
    eventType: AutomationTriggerEventType,
  ): Promise<DomainResult<AutomationRule[]>>;

  /** Update an existing automation rule. */
  updateRule(
    tenantId: string,
    ruleId: string,
    data: UpdateAutomationRuleInput,
  ): Promise<DomainResult<AutomationRule>>;

  /** Enable an automation rule without deleting it. */
  enableRule(
    tenantId: string,
    ruleId: string,
  ): Promise<DomainResult<AutomationRule>>;

  /** Disable an automation rule without deleting it. */
  disableRule(
    tenantId: string,
    ruleId: string,
  ): Promise<DomainResult<AutomationRule>>;

  /** Log an automation rule execution. */
  logExecution(
    data: CreateAutomationExecutionInput,
  ): Promise<DomainResult<AutomationExecution>>;

  /** Count active rules for a tenant (for limit enforcement). */
  countActiveRules(tenantId: string): Promise<DomainResult<number>>;

  /** Find a single rule by ID within a tenant. */
  findRuleById(
    tenantId: string,
    ruleId: string,
  ): Promise<DomainResult<AutomationRule | null>>;
}
