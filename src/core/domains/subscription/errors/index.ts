/**
 * Subscription errors barrel export.
 *
 * @see Requirements 17, 18, 19
 */

export {
  // Plan Management Errors (Req 17)
  planHasSubscribers,
  planNameDuplicate,
  planNotFound,
  invalidPlanData,
  cannotDeleteSystemPlan,
  // Subscription Status Errors (Req 18)
  invalidStatusTransition,
  subscriptionNotFound,
  subscriptionAlreadyExists,
  // Entitlement Errors (Req 19)
  entitlementNotAvailable,
  tenantSuspended,
  tenantClosed,
  // Plan Change Log Errors
  planChangeLogFailed,
  // User Limit Errors
  userLimitExceeded,
} from './subscriptionErrors';
