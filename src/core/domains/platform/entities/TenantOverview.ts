/**
 * TenantOverview — Domain entity representing tenant summary information
 * for the Platform Admin Dashboard tenant table.
 *
 * This entity provides an aggregated view of tenant information suitable
 * for displaying in the cross-tenant overview table on the Platform Dashboard.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 19.4 (Tenant overview table)
 * @see Requirements 19.5-19.6 (Filtering and sorting)
 * @see Design Components > 11. Platform Admin Dashboard > TenantOverview
 */

import type { LifecycleStatusValue } from '@core/domains/tenant/entities/TenantLifecycleStatus';

// ---------------------------------------------------------------------------
// Subscription Summary
// ---------------------------------------------------------------------------

/**
 * Subscription plan summary for tenant overview display.
 */
export interface SubscriptionSummary {
  /**
   * Plan ID reference.
   */
  readonly planId: string;

  /**
   * Plan display name (Basic, Standard, Pro, etc.).
   */
  readonly planName: string;

  /**
   * Subscription status (TRIAL, ACTIVE, PAST_DUE, etc.).
   */
  readonly status: SubscriptionStatusValue;

  /**
   * Whether the tenant is in trial period.
   */
  readonly isTrial: boolean;

  /**
   * Days remaining in trial (null if not in trial).
   */
  readonly trialDaysRemaining: number | null;

  /**
   * Date when current billing period ends.
   */
  readonly periodEndDate: Date | null;
}

/**
 * Subscription status values.
 */
export type SubscriptionStatusValue =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CLOSED'
  | 'NONE';

// ---------------------------------------------------------------------------
// Main Entity
// ---------------------------------------------------------------------------

/**
 * TenantOverview entity — summary data for Platform Dashboard tenant table.
 *
 * Each row in the tenant overview table displays this information,
 * allowing PLATFORM_ADMIN to monitor and manage all tenants.
 *
 * INVARIANTS:
 * - ID is unique across the platform
 * - Member count is non-negative
 * - Timestamps are in UTC
 *
 * SECURITY CONSIDERATIONS:
 * - Access restricted to PLATFORM_ADMIN role only
 * - Data fetched via privileged execution path
 * - Sensitive details (e.g., payment info) not included
 *
 * @see Requirements 19.4
 * @see Design > TenantOverview interface
 */
export interface TenantOverview {
  /**
   * Unique identifier for the tenant.
   */
  readonly id: string;

  /**
   * Display name of the tenant.
   */
  readonly name: string;

  /**
   * URL slug for the tenant (used in URLs).
   */
  readonly slug: string;

  /**
   * Current lifecycle status of the tenant.
   *
   * @see Requirements 19.4 (status column)
   */
  readonly status: LifecycleStatusValue;

  /**
   * Subscription plan summary.
   *
   * @see Requirements 19.4 (subscription plan column)
   */
  readonly subscription: SubscriptionSummary;

  /**
   * Total number of members in the tenant.
   *
   * @see Requirements 19.4 (member count column)
   */
  readonly memberCount: number;

  /**
   * Number of active members (not SUSPENDED or REVOKED).
   */
  readonly activeMemberCount: number;

  /**
   * Timestamp when the tenant was created.
   *
   * @see Requirements 19.4 (created date column)
   */
  readonly createdAt: Date;

  /**
   * Timestamp of the last recorded activity in the tenant.
   * This could be last login, last API call, or last data change.
   *
   * @see Requirements 19.4 (last activity column)
   */
  readonly lastActivityAt: Date | null;

  /**
   * Tenant logo URL (if available).
   */
  readonly logoUrl: string | null;

  /**
   * Region where the tenant is located.
   */
  readonly region: string | null;

  /**
   * Primary contact person for the tenant.
   */
  readonly contactPerson: string | null;

  /**
   * Primary contact email for the tenant.
   */
  readonly contactEmail: string | null;

  /**
   * Whether there are any pending alerts for this tenant.
   */
  readonly hasPendingAlerts: boolean;

  /**
   * Number of pending alerts for this tenant.
   */
  readonly pendingAlertCount: number;
}

// ---------------------------------------------------------------------------
// Paginated Result
// ---------------------------------------------------------------------------

/**
 * Paginated result for tenant overview queries.
 *
 * @see Requirements 19.5 (filtering support)
 */
export interface PaginatedTenantOverviews {
  /**
   * List of tenant overviews for the current page.
   */
  readonly tenants: readonly TenantOverview[];

  /**
   * Total count of tenants matching the query filters.
   */
  readonly totalCount: number;

  /**
   * Current page number (1-indexed).
   */
  readonly page: number;

  /**
   * Number of items per page.
   */
  readonly pageSize: number;

  /**
   * Total number of pages.
   */
  readonly totalPages: number;

  /**
   * Whether there are more pages after current.
   */
  readonly hasNextPage: boolean;

  /**
   * Whether there are pages before current.
   */
  readonly hasPreviousPage: boolean;
}

// ---------------------------------------------------------------------------
// Filter and Query Types
// ---------------------------------------------------------------------------

/**
 * Filter options for tenant overview queries.
 *
 * @see Requirements 19.5 (filtering by status, plan, text search)
 */
export interface TenantOverviewFilters {
  /**
   * Filter by lifecycle status.
   * If provided, only tenants with matching status are returned.
   */
  readonly status?: LifecycleStatusValue | null;

  /**
   * Filter by subscription plan name/ID.
   */
  readonly subscriptionPlan?: string | null;

  /**
   * Filter by subscription status.
   */
  readonly subscriptionStatus?: SubscriptionStatusValue | null;

  /**
   * Text search query (matches tenant name, slug, region).
   */
  readonly search?: string | null;

  /**
   * Filter tenants with pending alerts only.
   */
  readonly hasPendingAlerts?: boolean;

  /**
   * Filter by region.
   */
  readonly region?: string | null;

  /**
   * Filter by created date range.
   */
  readonly createdAfter?: Date | null;
  readonly createdBefore?: Date | null;

  /**
   * Filter by last activity date range.
   */
  readonly lastActivityAfter?: Date | null;
  readonly lastActivityBefore?: Date | null;
}

/**
 * Sort options for tenant overview queries.
 *
 * @see Requirements 19.6 (sorting by any column)
 */
export interface TenantOverviewSort {
  /**
   * Column to sort by.
   */
  readonly column: TenantOverviewSortColumn;

  /**
   * Sort direction.
   */
  readonly direction: 'asc' | 'desc';
}

/**
 * Columns available for sorting.
 */
export type TenantOverviewSortColumn =
  | 'name'
  | 'status'
  | 'memberCount'
  | 'subscriptionPlan'
  | 'createdAt'
  | 'lastActivityAt'
  | 'region';

/**
 * Query options combining filters, sorting, and pagination.
 */
export interface TenantOverviewQueryOptions {
  /**
   * Filter criteria.
   */
  readonly filters?: TenantOverviewFilters;

  /**
   * Sort configuration.
   */
  readonly sort?: TenantOverviewSort;

  /**
   * Page number (1-indexed).
   */
  readonly page?: number;

  /**
   * Page size (default: 25).
   */
  readonly pageSize?: number;
}

// ---------------------------------------------------------------------------
// Tenant Detail (Extended View)
// ---------------------------------------------------------------------------

/**
 * Extended tenant detail for Platform Admin drill-down view.
 *
 * @see Requirements 20.1 (Tenant detail view)
 */
export interface TenantDetail extends TenantOverview {
  /**
   * Full tenant profile information.
   */
  readonly profile: TenantProfileSummary;

  /**
   * Subscription details.
   */
  readonly subscriptionDetails: SubscriptionDetailSummary;

  /**
   * Lifecycle history (last N events).
   */
  readonly recentLifecycleEvents: readonly LifecycleEventSummary[];

  /**
   * Recent audit log entries count.
   */
  readonly recentAuditLogCount: number;

  /**
   * Member distribution by role.
   */
  readonly memberDistribution: Record<string, number>;

  /**
   * OrgUnit count.
   */
  readonly orgUnitCount: number;
}

/**
 * Tenant profile summary for detail view.
 */
export interface TenantProfileSummary {
  readonly name: string;
  readonly rtRwNumber: string | null;
  readonly region: string | null;
  readonly address: string | null;
  readonly contactPerson: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly logoUrl: string | null;
  readonly primaryColor: string | null;
  readonly secondaryColor: string | null;
}

/**
 * Subscription detail summary.
 */
export interface SubscriptionDetailSummary extends SubscriptionSummary {
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly features: readonly string[];
  readonly limits: {
    readonly maxMembers: number | null;
    readonly maxOrgUnits: number | null;
    readonly maxStorage: number | null;
  };
  readonly usage: {
    readonly memberCount: number;
    readonly orgUnitCount: number;
    readonly storageUsedBytes: number;
  };
}

/**
 * Lifecycle event summary for detail view.
 */
export interface LifecycleEventSummary {
  readonly id: string;
  readonly fromStatus: LifecycleStatusValue;
  readonly toStatus: LifecycleStatusValue;
  readonly action: string;
  readonly reason: string | null;
  readonly timestamp: Date;
  readonly actorName: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default page size for tenant overview queries.
 */
export const DEFAULT_TENANT_OVERVIEW_PAGE_SIZE = 25;

/**
 * Maximum page size for tenant overview queries.
 */
export const MAX_TENANT_OVERVIEW_PAGE_SIZE = 100;

/**
 * All subscription status values.
 */
export const ALL_SUBSCRIPTION_STATUSES: readonly SubscriptionStatusValue[] = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CLOSED',
  'NONE',
] as const;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get i18n key for subscription status.
 */
export function getSubscriptionStatusI18nKey(
  status: SubscriptionStatusValue,
): string {
  return `subscription.status.${status.toLowerCase()}`;
}

/**
 * Get i18n key for tenant overview sort column.
 */
export function getTenantSortColumnI18nKey(
  column: TenantOverviewSortColumn,
): string {
  return `platform.tenant_sort.${column}`;
}

/**
 * Check if a tenant has any concerning status (needs attention).
 */
export function hasConcerningStatus(tenant: TenantOverview): boolean {
  return (
    tenant.status === 'SUSPENDED' ||
    tenant.subscription.status === 'PAST_DUE' ||
    tenant.hasPendingAlerts
  );
}

/**
 * Format last activity for display.
 * Returns relative time string or "Never" if null.
 */
export function formatLastActivity(
  lastActivityAt: Date | null,
  locale: string,
): string {
  if (!lastActivityAt) {
    return 'platform.last_activity.never';
  }

  // Return the date for now; actual relative formatting done by i18n library
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(lastActivityAt);
}

/**
 * Calculate days since last activity.
 */
export function daysSinceLastActivity(lastActivityAt: Date | null): number | null {
  if (!lastActivityAt) {
    return null;
  }

  const now = new Date();
  const diffMs = now.getTime() - lastActivityAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
