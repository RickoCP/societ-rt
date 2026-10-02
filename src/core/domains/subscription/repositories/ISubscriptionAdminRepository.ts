/**
 * ISubscriptionAdminRepository — Core repository interface for Admin UI subscription operations.
 *
 * Provides operations for the Admin UI to:
 * - Fetch subscription overview with plan and usage details
 * - Change subscription plan (upgrade/downgrade/trial conversion)
 * - Fetch billing history
 * - Download invoices
 * - Retry failed payments
 *
 * This interface is separate from ISubscriptionRepository which handles
 * direct subscription CRUD operations. This interface is optimized for
 * Admin UI needs with combined/aggregated data.
 *
 * @see Requirements 14.1-14.9, 15.5-15.9, 16.1-16.11
 * @see Design Components > 9. Subscription Management
 */

import type { DomainResult } from '@core/utils';
import type { SubscriptionStatus } from '../types';
import type { SubscriptionPlan } from '../entities';
import type {
  BillingHistoryQueryOptions,
  PaginatedBillingHistory,
} from '../entities/BillingEntry';
import type {
  SubscriptionOverview,
} from '../usecases/GetSubscriptionUseCase';
import type {
  UsageLimitCheck,
} from '../usecases/ChangePlanUseCase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a plan change operation.
 */
export interface PlanChangeResult {
  /** The subscription ID */
  readonly subscriptionId: string;
  /** New subscription status */
  readonly newStatus: SubscriptionStatus;
  /** New billing period end date */
  readonly newPeriodEnd: Date | null;
}

/**
 * Invoice download result.
 */
export interface InvoiceDownload {
  /** Download URL (presigned or direct) */
  readonly downloadUrl: string;
  /** Filename for the download */
  readonly filename: string;
  /** Content type */
  readonly contentType: string;
}

/**
 * Payment retry result.
 */
export interface PaymentRetryResult {
  /** Whether retry was initiated successfully */
  readonly initiated: boolean;
  /** Payment URL to redirect user (if applicable) */
  readonly paymentUrl: string | null;
  /** New invoice/billing entry status */
  readonly newStatus: string;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/**
 * Repository interface for Admin UI subscription operations.
 */
export interface ISubscriptionAdminRepository {
  // ---------------------------------------------------------------------------
  // Subscription Overview
  // ---------------------------------------------------------------------------

  /**
   * Get complete subscription overview for a tenant.
   *
   * Returns combined data including:
   * - Current subscription details
   * - Current plan information
   * - Usage metrics
   * - Trial information
   *
   * @param tenantId - Tenant ID
   */
  getSubscriptionOverview(
    tenantId: string,
  ): Promise<DomainResult<SubscriptionOverview | null>>;

  // ---------------------------------------------------------------------------
  // Plan Management
  // ---------------------------------------------------------------------------

  /**
   * Get a subscription plan by ID.
   *
   * @param planId - Plan ID
   */
  getPlan(planId: string): Promise<DomainResult<SubscriptionPlan | null>>;

  /**
   * List all available subscription plans.
   */
  listPlans(): Promise<DomainResult<SubscriptionPlan[]>>;

  /**
   * Check if current usage fits within a plan's limits.
   *
   * Used before allowing downgrade to ensure current usage
   * doesn't exceed the new plan's limits.
   *
   * @param tenantId - Tenant ID
   * @param targetPlanId - Target plan to check against
   */
  checkUsageLimits(
    tenantId: string,
    targetPlanId: string,
  ): Promise<DomainResult<UsageLimitCheck>>;

  /**
   * Change the subscription plan for a tenant.
   *
   * Handles:
   * - Upgrade (higher tier)
   * - Downgrade (lower tier)
   * - Trial to paid conversion
   *
   * @param tenantId - Tenant ID
   * @param targetPlanId - New plan ID
   * @param actorUserId - User making the change (for audit)
   */
  changePlan(
    tenantId: string,
    targetPlanId: string,
    actorUserId: string,
  ): Promise<DomainResult<PlanChangeResult>>;

  // ---------------------------------------------------------------------------
  // Billing History
  // ---------------------------------------------------------------------------

  /**
   * Get paginated billing history for a tenant.
   *
   * @param options - Query options including pagination and filters
   */
  getBillingHistory(
    options: BillingHistoryQueryOptions,
  ): Promise<DomainResult<PaginatedBillingHistory>>;

  /**
   * Download invoice for a billing entry.
   *
   * @param tenantId - Tenant ID (for authorization)
   * @param billingEntryId - Billing entry ID
   */
  downloadInvoice(
    tenantId: string,
    billingEntryId: string,
  ): Promise<DomainResult<InvoiceDownload>>;

  /**
   * Retry a failed payment.
   *
   * @param tenantId - Tenant ID (for authorization)
   * @param billingEntryId - Billing entry ID
   */
  retryPayment(
    tenantId: string,
    billingEntryId: string,
  ): Promise<DomainResult<PaymentRetryResult>>;
}
