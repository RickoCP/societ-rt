/**
 * AutomationRule — Domain entity representing an IF/THEN automation rule
 * that triggers actions when specific security or IoT events occur.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 39.1, 39.2, 39.3, 39.4, 39.6, 39.7, 39.10, 39.11, 39.12
 */

// ---------------------------------------------------------------------------
// Trigger Event Types
// ---------------------------------------------------------------------------

/**
 * Valid trigger event types that can activate an automation rule.
 *
 * @see Requirement 39.2
 */
export const AUTOMATION_TRIGGER_EVENT_TYPES = [
  'panic_button_pressed',
  'gate_open',
  'gate_closed',
  'motion_detected',
  'smoke_detected',
  'alarm_triggered',
  'smart_lock_opened',
  'cctv_motion_detected',
  'device_online',
  'device_offline',
  'battery_low',
  'emergency_alert',
] as const;

export type AutomationTriggerEventType =
  (typeof AUTOMATION_TRIGGER_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Condition Types
// ---------------------------------------------------------------------------

/**
 * Supported condition operators for rule evaluation.
 *
 * @see Requirement 39.3
 */
export const AUTOMATION_CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'time_between',
  'duration_exceeds',
] as const;

export type AutomationConditionOperator =
  (typeof AUTOMATION_CONDITION_OPERATORS)[number];

/**
 * A single condition within an automation rule.
 * All conditions in a rule must be met (AND logic) for actions to execute.
 */
export interface AutomationCondition {
  readonly field: string;
  readonly operator: AutomationConditionOperator;
  readonly value: string | number;
}

// ---------------------------------------------------------------------------
// Action Types
// ---------------------------------------------------------------------------

/**
 * Supported action types that can be executed when a rule triggers.
 *
 * @see Requirement 39.4
 */
export const AUTOMATION_ACTION_TYPES = [
  'create_incident',
  'notify_security_guard',
  'notify_ketua_rt',
  'notify_emergency_contact',
  'trigger_siren',
  'capture_cctv_snapshot',
  'broadcast_neighborhood_alert',
  'send_push_notification',
] as const;

export type AutomationActionType =
  (typeof AUTOMATION_ACTION_TYPES)[number];

/**
 * A single action to execute when rule conditions are met.
 */
export interface AutomationAction {
  readonly type: AutomationActionType;
  readonly params: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of active automation rules per tenant. @see Requirement 39.11 */
export const AUTOMATION_MAX_ACTIVE_RULES_PER_TENANT = 50;

/** Maximum chain depth to prevent infinite loops. @see Requirement 39.6 */
export const AUTOMATION_MAX_CHAIN_DEPTH = 5;

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface AutomationRule {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly triggerEventType: AutomationTriggerEventType;
  readonly conditions: AutomationCondition[];
  readonly actions: AutomationAction[];
  readonly enabled: boolean;
  readonly scheduleStart: string | null; // HH:mm format
  readonly scheduleEnd: string | null; // HH:mm format
  readonly maxChainDepth: number;
  readonly executionCount: number;
  readonly lastExecutedAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new automation rule. */
export interface CreateAutomationRuleInput {
  readonly name: string;
  readonly triggerEventType: AutomationTriggerEventType;
  readonly conditions: AutomationCondition[];
  readonly actions: AutomationAction[];
  readonly enabled?: boolean;
  readonly scheduleStart?: string | null;
  readonly scheduleEnd?: string | null;
  readonly maxChainDepth?: number;
  readonly createdBy: string;
}

/** Data allowed when updating an existing automation rule. */
export interface UpdateAutomationRuleInput {
  readonly name?: string;
  readonly triggerEventType?: AutomationTriggerEventType;
  readonly conditions?: AutomationCondition[];
  readonly actions?: AutomationAction[];
  readonly scheduleStart?: string | null;
  readonly scheduleEnd?: string | null;
  readonly maxChainDepth?: number;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a trigger event type is valid.
 */
export function isValidTriggerEventType(
  eventType: string,
): eventType is AutomationTriggerEventType {
  return (AUTOMATION_TRIGGER_EVENT_TYPES as readonly string[]).includes(
    eventType,
  );
}

/**
 * Check whether a condition operator is valid.
 */
export function isValidConditionOperator(
  operator: string,
): operator is AutomationConditionOperator {
  return (AUTOMATION_CONDITION_OPERATORS as readonly string[]).includes(
    operator,
  );
}

/**
 * Check whether an action type is valid.
 */
export function isValidActionType(
  actionType: string,
): actionType is AutomationActionType {
  return (AUTOMATION_ACTION_TYPES as readonly string[]).includes(actionType);
}
