export type {
  AutomationTriggerEventType,
  AutomationConditionOperator,
  AutomationCondition,
  AutomationActionType,
  AutomationAction,
  AutomationRule,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
} from './AutomationRule';

export {
  AUTOMATION_TRIGGER_EVENT_TYPES,
  AUTOMATION_CONDITION_OPERATORS,
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_MAX_ACTIVE_RULES_PER_TENANT,
  AUTOMATION_MAX_CHAIN_DEPTH,
  isValidTriggerEventType,
  isValidConditionOperator,
  isValidActionType,
} from './AutomationRule';

export type {
  AutomationExecutionStatus,
  AutomationExecution,
  CreateAutomationExecutionInput,
} from './AutomationExecution';
