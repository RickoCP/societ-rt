/**
 * Subscription services barrel export.
 *
 * @see Requirements 17, 18, 19
 */

export type {
  ISubscriptionPlanService,
  SubscriptionPlanServiceDeps,
} from './SubscriptionPlanService';
export { createSubscriptionPlanService } from './SubscriptionPlanService';

export type {
  ISubscriptionStatusService,
  IStatusTransitionEventEmitter,
  SubscriptionStatusServiceDeps,
} from './SubscriptionStatusService';
export { createSubscriptionStatusService } from './SubscriptionStatusService';

export type {
  IEntitlementService,
  IEntitlementLogger,
  EntitlementServiceDeps,
  EntitlementCheckResult,
  EntitlementCheckOptions,
  EntitlementDenialLogContext,
} from './EntitlementService';
export {
  createEntitlementService,
  isSafetyCriticalOperation,
} from './EntitlementService';
