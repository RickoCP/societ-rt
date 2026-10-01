/**
 * SubscriptionAdminRepository — Repository interface for Admin UI subscription operations.
 *
 * This interface defines the contract for Admin UI subscription management operations,
 * including viewing current subscription, comparing plans, changing plans, viewing
 * billing history, and managing payment retries.
 *
 * All methods return DomainResult<T> for explicit success/error handling.
 *
 * SECURITY CONSIDERATIONS:
 * - All operations are scoped by the caller's tenant context
 * - Plan changes validated against entitlement rules
 * - Billing data visible only to users with `tenant:manage` permission
 * - Invoice downloads use signed URLs with short TTL
 *
 * @see Requirements 14.1-14.9 (Subscription Plan Overview)
 * @see Requirements 15.1-15.10 (Plan Comparison and Upgrade)
 * @see Requirements 16.1-16.11 (Billing History)
 * @see Design Components > 9. Subscription Management
 */

import type { DomainResult } from '@core/utils';
import type {
  AdminSubscriptionPlan,
  AdminSubscriptionPlanSummary,
  PlanComparisonResult,
  BillingCycle,
} from '../entities/AdminSubscriptionPlan';
import type { AdminSubscriptionStatus } from '../entities/AdminSubscriptionStatus';
import type {
  BillingEntry,
  BillingHistoryQueryOptions,
  PaginatedBillingHistory,
} from '../entities/BillingEntry';

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Input for changing subscription plan.
 *
 * @see Requirements 15.5-15.6 (Upgrade/downgrade flow)
 */
export interface ChangePlanInput {
  /** ID of the target plan */
  readonly targetPlanId: string;

  /** Billing cycle for the new plan */
  readonly billingCycle: BillingCycle;

  /** Whether to prorate the charge */
  readonly prorate?: boolean;
}

/**
 * Result of a plan change operation.
 */
export interface ChangePlanResult {
  /** Updated subscription status */
  readonly subscription: AdminSubscriptionStatus;

  /** Whether the change was an upgrade */
  readonly wasUpgrade: boolean;

  /** Amount charged/credited (if prorated) */
  readonly proratedAmount: number | null;

  /** New billing date */
  readonly nextBillingDate: Date | null;
}

/**
 * Input for retrying a failed payment.
 *
 * @see Requirements 16.10-16.11 (Retry payment)
 */
export interface RetryPaymentInput {
  /** Billing entry ID to retry */
  readonly billingEntryId: string;

  /** Optional: Use a different payment method */
  readonly paymentMethodId?: string;
}

/**
 * Result of a payment retry operation.
 */
export interface RetryPaymentResult {
  /** Whether the retry was successful */
  readonly success: boolean;

  /** Updated billing entry */
  readonly billingEntry: BillingEntry;

  /** Error message if failed */
  readonly errorMessage: string | null;

  /** Whether to prompt for payment method update */
  readonly requiresPaymentMethodUpdate: boolean;
}

/**
 * Result of invoice download request.
 */
export interface InvoiceDownloadResult {
  /** Signed download URL */
  readonly downloadUrl: string;

  /** URL expiration time */
  readonly expiresAt: Date;

  /** Suggested filename */
  readonly filename: string;
}

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

/**
 * Result of downgrade validation.
 *
 * @see Requirements 15.6 (Check usage against new plan limits)
 */
export interface DowngradeValidationResult {
  /** Whether downgrade is allowed */
  readonly allowed: boolean;

  /** Violations that block the downgrade */
  readonly violations: readonly DowngradeViolation[];
}

/**
 * Individual downgrade violation.
 */
export interface DowngradeViolation {
  /** Violation type */
  readonly type: 'MEMBERS_EXCEEDED' | 'ORGUNITS_EXCEEDED' | 'STORAGE_EXCEEDED' | 'FEATURE_IN_USE';

  /** Current value */
  readonly currentValue: number;

  /** New limit */
  readonly newLimit: number;

  /** i18n key for error message */
  readonly messageKey: string;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/**
 * Repository interface for Admin UI subscription operations.
 *
 * All operations are scoped by the caller's tenantId.
 * Authorization is enforced at the service layer.
 */
export interface SubscriptionAdminRepository {
  // ---------------------------------------------------------------------------
  // Subscription Status Operations
  // ---------------------------------------------------------------------------

  /**
   * Get the current subscription status for a tenant.
   *
   * Returns comprehensive subscription information including plan details,
   * billing period, trial info, and usage metrics.
   *
   * @param tenantId - The tenant to get subscription for
   * @returns Subscription status with usage metrics
   *
   * @see Requirements 14.1-14.9
   */
  getSubscription(tenantId: string): Promise<DomainResult<AdminSubscriptionStatus>>;

  // ---------------------------------------------------------------------------
  // Plan Operations
  // ---------------------------------------------------------------------------

  /**
   * Get all available subscription plans.
   *
   * Returns plans that the tenant can upgrade/downgrade to.
   * Plans are ordered by display order (tier).
   *
   * @returns List of available plans
   *
   * @see Requirements 15.1-15.3
   */
  getAvailablePlans(): Promise<DomainResult<AdminSubscriptionPlan[]>>;

  /**
   * Get a specific plan by ID.
   *
   * @param planId - Plan ID to retrieve
   * @returns Plan details or not_found error
   */
  getPlan(planId: string): Promise<DomainResult<AdminSubscriptionPlan>>;

  /**
   * Get plan summaries for dropdown/selection UI.
   *
   * @returns List of plan summaries (lightweight)
   */
  getPlanSummaries(): Promise<DomainResult<AdminSubscriptionPlanSummary[]>>;

  /**
   * Compare current plan with a target plan.
   *
   * Returns detailed comparison including features gained/lost and price differences.
   *
   * @param tenantId - The tenant's current subscription
   * @param targetPlanId - Plan to compare against
   * @returns Comparison result
   *
   * @see Requirements 15.4 (Highlight differences)
   */
  comparePlans(
    tenantId: string,
    targetPlanId: string,
  ): Promise<DomainResult<PlanComparisonResult>>;

  /**
   * Validate if downgrade to a plan is allowed.
   *
   * Checks current usage against new plan limits.
   *
   * @param tenantId - The tenant to validate
   * @param targetPlanId - Plan to downgrade to
   * @returns Validation result with any violations
   *
   * @see Requirements 15.6 (Check usage against limits)
   */
  validateDowngrade(
    tenantId: string,
    targetPlanId: string,
  ): Promise<DomainResult<DowngradeValidationResult>>;

  /**
   * Change the tenant's subscription plan.
   *
   * Handles both upgrades and downgrades with proration.
   * For downgrades, validates usage against new limits first.
   *
   * @param tenantId - The tenant to change plan for
   * @param input - Plan change details
   * @returns Change result with updated subscription
   *
   * Possible errors:
   * - SUBSCRIPTION_NOT_FOUND: Tenant has no subscription
   * - SUBSCRIPTION_INVALID_PLAN: Target plan not available
   * - SUBSCRIPTION_DOWNGRADE_VIOLATION: Usage exceeds new limits
   * - SUBSCRIPTION_TRIAL_ACTIVE: Cannot change during trial
   * - PAYMENT_FAILED: Payment processing failed
   *
   * @see Requirements 15.5-15.8
   */
  changePlan(
    tenantId: string,
    input: ChangePlanInput,
  ): Promise<DomainResult<ChangePlanResult>>;

  // ---------------------------------------------------------------------------
  // Billing History Operations
  // ---------------------------------------------------------------------------

  /**
   * Get billing history for a tenant.
   *
   * Returns paginated billing entries with filtering support.
   *
   * @param tenantId - The tenant to get history for
   * @param options - Query options (pagination, filters)
   * @returns Paginated billing history
   *
   * @see Requirements 16.1-16.9
   */
  getBillingHistory(
    tenantId: string,
    options?: BillingHistoryQueryOptions,
  ): Promise<DomainResult<PaginatedBillingHistory>>;

  /**
   * Get a specific billing entry by ID.
   *
   * @param tenantId - The tenant for scope validation
   * @param billingEntryId - Entry ID to retrieve
   * @returns Billing entry or not_found error
   */
  getBillingEntry(
    tenantId: string,
    billingEntryId: string,
  ): Promise<DomainResult<BillingEntry>>;

  // ---------------------------------------------------------------------------
  // Payment Operations
  // ---------------------------------------------------------------------------

  /**
   * Retry a failed payment.
   *
   * Attempts to process the payment again using the existing payment method.
   *
   * @param tenantId - The tenant for scope validation
   * @param input - Retry details
   * @returns Retry result with status
   *
   * @see Requirements 16.10-16.11
   */
  retryPayment(
    tenantId: string,
    input: RetryPaymentInput,
  ): Promise<DomainResult<RetryPaymentResult>>;

  // ---------------------------------------------------------------------------
  // Invoice Operations
  // ---------------------------------------------------------------------------

  /**
   * Get a signed download URL for an invoice.
   *
   * Returns a temporary URL for downloading the invoice PDF.
   *
   * @param tenantId - The tenant for scope validation
   * @param billingEntryId - Entry ID to get invoice for
   * @returns Download URL with expiration
   *
   * @see Requirements 16.5-16.6
   */
  downloadInvoice(
    tenantId: string,
    billingEntryId: string,
  ): Promise<DomainResult<InvoiceDownloadResult>>;
}

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

/**
 * Error codes for subscription operations.
 */
export const SUBSCRIPTION_ERROR_CODES = {
  /** Subscription not found for tenant */
  NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  /** Target plan not available */
  INVALID_PLAN: 'SUBSCRIPTION_INVALID_PLAN',
  /** Cannot downgrade due to usage violations */
  DOWNGRADE_VIOLATION: 'SUBSCRIPTION_DOWNGRADE_VIOLATION',
  /** Cannot change plan during trial */
  TRIAL_ACTIVE: 'SUBSCRIPTION_TRIAL_ACTIVE',
  /** Plan is already the current plan */
  SAME_PLAN: 'SUBSCRIPTION_SAME_PLAN',
  /** Payment processing failed */
  PAYMENT_FAILED: 'SUBSCRIPTION_PAYMENT_FAILED',
  /** Invoice not found or not available */
  INVOICE_NOT_FOUND: 'SUBSCRIPTION_INVOICE_NOT_FOUND',
  /** Cannot retry this payment */
  RETRY_NOT_ALLOWED: 'SUBSCRIPTION_RETRY_NOT_ALLOWED',
  /** Billing entry not found */
  BILLING_ENTRY_NOT_FOUND: 'SUBSCRIPTION_BILLING_ENTRY_NOT_FOUND',
} as const;

export type SubscriptionErrorCode =
  (typeof SUBSCRIPTION_ERROR_CODES)[keyof typeof SUBSCRIPTION_ERROR_CODES];
