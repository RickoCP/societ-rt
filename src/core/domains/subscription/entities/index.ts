/**
 * Subscription entities barrel export.
 *
 * @see Requirements 17, 18
 */

// SubscriptionPlan
export type {
  SubscriptionPlan,
  CreateSubscriptionPlanInput,
  UpdateSubscriptionPlanInput,
  PlanChangeLog,
  PlanName,
  DefaultPlanName,
} from './SubscriptionPlan';

export {
  DEFAULT_PLAN_NAMES,
  isDefaultPlanName,
  isValidPlanName,
  isValidMaxUsers,
  isValidPrice,
} from './SubscriptionPlan';

// Subscription
export type {
  Subscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  StatusTransitionRequest,
} from './Subscription';

// SubscriptionStatusHistory
export type {
  SubscriptionStatusHistory,
  CreateStatusHistoryInput,
  StatusHistoryQueryOptions,
  StatusTransitionEvent,
} from './SubscriptionStatusHistory';

export { createStatusTransitionEvent } from './SubscriptionStatusHistory';
