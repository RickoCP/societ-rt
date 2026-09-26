/**
 * Subscription-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * SECURITY CONSIDERATIONS:
 * - Error messages MUST NOT expose internal details
 * - User messages are safe for display
 *
 * @see Requirements 17, 18, 19
 * @see Error Handling Guideline (Steering)
 */

import type { AppError } from '@core/utils';
import { businessError, notFoundError, validationError } from '@core/utils';

// ---------------------------------------------------------------------------
// Plan Management Errors (Req 17)
// ---------------------------------------------------------------------------

/**
 * Plan has active subscribers and cannot be deleted (Req 17 AC 6).
 * HTTP Status: 409 (Conflict)
 */
export function planHasSubscribers(planId: string, subscriberCount: number): AppError {
  return businessError(
    'PLAN_HAS_SUBSCRIBERS',
    `Cannot delete plan '${planId}' - ${subscriberCount} tenant(s) currently subscribed`,
    {
      userMessage: 'This plan cannot be deleted because it has active subscribers',
      retryable: false,
    },
  );
}

/**
 * Plan name already exists (Req 17 AC 3).
 * HTTP Status: 409 (Conflict)
 */
export function planNameDuplicate(name: string): AppError {
  return businessError(
    'PLAN_NAME_DUPLICATE',
    `Subscription plan with name '${name}' already exists`,
    {
      userMessage: 'A plan with this name already exists',
      retryable: false,
    },
  );
}

/**
 * Plan not found.
 * HTTP Status: 404
 */
export function planNotFound(planId: string): AppError {
  return notFoundError(
    'PLAN_NOT_FOUND',
    `Subscription plan '${planId}' not found`,
    {
      userMessage: 'Subscription plan not found',
    },
  );
}

/**
 * Invalid plan data during creation/update.
 * HTTP Status: 400
 */
export function invalidPlanData(reason: string): AppError {
  return validationError(
    'INVALID_PLAN_DATA',
    `Invalid subscription plan data: ${reason}`,
    {
      userMessage: 'Invalid plan data provided',
    },
  );
}

/**
 * Default system plan cannot be deleted (Req 17 AC 4).
 * HTTP Status: 403
 */
export function cannotDeleteSystemPlan(planName: string): AppError {
  return businessError(
    'CANNOT_DELETE_SYSTEM_PLAN',
    `Cannot delete system plan '${planName}' - default plans are protected`,
    {
      userMessage: 'System plans cannot be deleted',
      retryable: false,
    },
  );
}

// ---------------------------------------------------------------------------
// Subscription Status Errors (Req 18)
// ---------------------------------------------------------------------------

/**
 * Invalid status transition attempted (Req 18 AC 7).
 * HTTP Status: 400
 */
export function invalidStatusTransition(
  fromStatus: string,
  toStatus: string,
): AppError {
  return businessError(
    'INVALID_STATUS_TRANSITION',
    `Invalid subscription status transition from '${fromStatus}' to '${toStatus}'`,
    {
      userMessage: 'This status change is not allowed',
      retryable: false,
    },
  );
}

/**
 * Subscription not found.
 * HTTP Status: 404
 */
export function subscriptionNotFound(subscriptionId: string): AppError {
  return notFoundError(
    'SUBSCRIPTION_NOT_FOUND',
    `Subscription '${subscriptionId}' not found`,
    {
      userMessage: 'Subscription not found',
    },
  );
}

/**
 * Tenant already has an active subscription.
 * HTTP Status: 409 (Conflict)
 */
export function subscriptionAlreadyExists(tenantId: string): AppError {
  return businessError(
    'SUBSCRIPTION_ALREADY_EXISTS',
    `Tenant '${tenantId}' already has an active subscription`,
    {
      userMessage: 'An active subscription already exists',
      retryable: false,
    },
  );
}

// ---------------------------------------------------------------------------
// Entitlement Errors (Req 19)
// ---------------------------------------------------------------------------

/**
 * Feature not available in tenant's subscription plan (Req 19 AC 2).
 * HTTP Status: 403
 */
export function entitlementNotAvailable(
  feature: string,
  planName: string,
): AppError {
  return businessError(
    'ENTITLEMENT_NOT_AVAILABLE',
    `Feature '${feature}' is not available in the '${planName}' plan`,
    {
      userMessage: 'This feature is not available in your current subscription plan',
      retryable: false,
    },
  );
}

/**
 * Tenant is suspended - normal operations denied (Req 19 AC 5).
 * HTTP Status: 403
 */
export function tenantSuspended(): AppError {
  return businessError(
    'TENANT_SUSPENDED',
    'Tenant subscription is suspended - normal operations are restricted',
    {
      userMessage: 'Your subscription has been suspended. Please contact support or update your payment.',
      retryable: false,
    },
  );
}

/**
 * Tenant is closed - all operations denied except data export (Req 18 AC 3).
 * HTTP Status: 403
 */
export function tenantClosed(): AppError {
  return businessError(
    'TENANT_CLOSED',
    'Tenant subscription is closed - only data export is allowed',
    {
      userMessage: 'Your subscription has been closed. Only data export is available.',
      retryable: false,
    },
  );
}

// ---------------------------------------------------------------------------
// Plan Change Log Errors
// ---------------------------------------------------------------------------

/**
 * Failed to create plan change log entry.
 * HTTP Status: 500 (but retryable)
 */
export function planChangeLogFailed(reason: string): AppError {
  return businessError(
    'PLAN_CHANGE_LOG_FAILED',
    `Failed to record plan change: ${reason}`,
    {
      userMessage: 'Failed to record the change. Please try again.',
      retryable: true,
    },
  );
}

// ---------------------------------------------------------------------------
// User Limit Errors (related to entitlements)
// ---------------------------------------------------------------------------

/**
 * User limit exceeded for the current plan.
 * HTTP Status: 403
 */
export function userLimitExceeded(
  currentUsers: number,
  maxUsers: number,
): AppError {
  return businessError(
    'USER_LIMIT_EXCEEDED',
    `Cannot add more users - current: ${currentUsers}, max: ${maxUsers}`,
    {
      userMessage: 'User limit reached. Please upgrade your plan to add more users.',
      retryable: false,
    },
  );
}
