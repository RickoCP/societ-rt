'use client';

/**
 * useTenantDetailViewModel — ViewModel for the Tenant Detail screen (Platform Admin).
 *
 * Provides state and actions for viewing comprehensive tenant information:
 * - Tenant profile data
 * - Subscription details
 * - Lifecycle history
 * - Recent audit logs (last 100 entries)
 * - Member count and role distribution
 *
 * This ViewModel follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * @see Requirements 20.1 (Platform Admin Tenant Operations)
 * @see Design Components > 11. Platform Admin Dashboard > TenantDetail
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@presentation/hooks/usePermissions';
import type { AppError } from '@core/utils';
import type {
  TenantDetail,
  TenantProfileSummary,
  SubscriptionDetailSummary,
  LifecycleEventSummary,
} from '@core/domains/platform/entities/TenantOverview';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * React Query cache key prefix for tenant detail queries.
 */
export const TENANT_DETAIL_QUERY_KEY = 'platformTenantDetail';

/**
 * Tenant detail tab types.
 * @see Requirements 20.1
 */
export type TenantDetailTab = 'profile' | 'subscription' | 'members' | 'audit';

/**
 * All available tabs in order.
 */
export const TENANT_DETAIL_TABS: TenantDetailTab[] = [
  'profile',
  'subscription',
  'members',
  'audit',
];

/**
 * Tab configuration with i18n keys and icons.
 */
export const TAB_CONFIG: Record<TenantDetailTab, { labelKey: string; icon: string }> = {
  profile: {
    labelKey: 'platform.tenant_detail.tab_profile',
    icon: '🏢',
  },
  subscription: {
    labelKey: 'platform.tenant_detail.tab_subscription',
    icon: '💳',
  },
  members: {
    labelKey: 'platform.tenant_detail.tab_members',
    icon: '👥',
  },
  audit: {
    labelKey: 'platform.tenant_detail.tab_audit',
    icon: '📋',
  },
};

/**
 * Lifecycle status display configuration.
 */
export const LIFECYCLE_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  PROVISIONING: {
    label: 'Provisioning',
    color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30',
    icon: '⏳',
  },
  ACTIVE: {
    label: 'Active',
    color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
    icon: '✅',
  },
  SUSPENDED: {
    label: 'Suspended',
    color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30',
    icon: '⏸️',
  },
  CLOSING: {
    label: 'Closing',
    color: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30',
    icon: '🚪',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
    icon: '🔒',
  },
  PURGED: {
    label: 'Purged',
    color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30',
    icon: '🗑️',
  },
};

/**
 * Subscription status display configuration.
 */
export const SUBSCRIPTION_STATUS_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  TRIAL: {
    label: 'Trial',
    color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30',
  },
  ACTIVE: {
    label: 'Active',
    color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
  },
  PAST_DUE: {
    label: 'Past Due',
    color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
  },
  SUSPENDED: {
    label: 'Suspended',
    color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30',
  },
  NONE: {
    label: 'None',
    color: 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30',
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Audit log entry for tenant detail view (simplified).
 */
export interface AuditLogEntry {
  readonly id: string;
  readonly timestamp: Date;
  readonly eventType: string;
  readonly actor: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
  readonly resource: {
    readonly type: string;
    readonly id: string;
    readonly name: string | null;
  };
  readonly details: Record<string, unknown>;
  readonly ipAddress: string | null;
}

/**
 * Return type of useTenantDetailViewModel hook.
 */
export interface TenantDetailViewModel {
  // ---------------------------------------------------------------------------
  // Data State (React Query)
  // ---------------------------------------------------------------------------

  /**
   * Complete tenant detail data.
   */
  tenantDetail: TenantDetail | null;

  /**
   * Tenant ID being viewed.
   */
  tenantId: string;

  /**
   * Tenant profile summary.
   */
  profile: TenantProfileSummary | null;

  /**
   * Subscription detail summary.
   */
  subscriptionDetails: SubscriptionDetailSummary | null;

  /**
   * Lifecycle event history.
   */
  lifecycleHistory: readonly LifecycleEventSummary[];

  /**
   * Recent audit log entries (last 100).
   */
  auditLogs: readonly AuditLogEntry[];

  /**
   * Member count by role.
   */
  memberDistribution: Record<string, number>;

  /**
   * Whether data is being fetched.
   */
  isLoading: boolean;

  /**
   * Whether fetch has failed.
   */
  isError: boolean;

  /**
   * Error details if fetch failed.
   */
  error: AppError | null;

  // ---------------------------------------------------------------------------
  // Tab State
  // ---------------------------------------------------------------------------

  /**
   * Currently active tab.
   */
  activeTab: TenantDetailTab;

  // ---------------------------------------------------------------------------
  // Audit Log Pagination
  // ---------------------------------------------------------------------------

  /**
   * Current audit log page.
   */
  auditPage: number;

  /**
   * Total audit log pages.
   */
  auditTotalPages: number;

  /**
   * Audit logs per page.
   */
  auditPageSize: number;

  // ---------------------------------------------------------------------------
  // Permission State
  // ---------------------------------------------------------------------------

  /**
   * Whether user is PLATFORM_ADMIN.
   */
  isPlatformAdmin: boolean;

  /**
   * Whether user can impersonate tenants.
   */
  canImpersonate: boolean;

  /**
   * Whether user can force suspend tenant.
   */
  canForceSuspend: boolean;

  /**
   * Whether user can force close tenant.
   */
  canForceClose: boolean;

  /**
   * Whether user can reset token version.
   */
  canResetTokenVersion: boolean;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Set the active tab.
   * @param tab - Tab to activate
   */
  setTab: (tab: TenantDetailTab) => void;

  /**
   * Set audit log page.
   * @param page - Page number (1-indexed)
   */
  setAuditPage: (page: number) => void;

  /**
   * Refetch tenant detail data.
   */
  refetch: () => void;

  /**
   * Navigate back to platform dashboard.
   */
  goBack: () => void;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch tenant detail from the API.
 */
async function fetchTenantDetail(tenantId: string): Promise<TenantDetail> {
  const response = await fetch(`/api/admin/platform/tenants/${tenantId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type:
        response.status === 401
          ? 'authentication'
          : response.status === 403
            ? 'authorization'
            : response.status === 404
              ? 'not_found'
              : 'technical',
      code: errorData.code ?? 'PLATFORM_TENANT_FETCH_ERROR',
      message:
        errorData.message ?? `Failed to fetch tenant detail: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: TenantDetail };

  if (!json.data) {
    throw {
      type: 'technical',
      code: 'PLATFORM_TENANT_INVALID_RESPONSE',
      message: 'Invalid response format from tenant detail API',
    } as AppError;
  }

  // Parse date fields
  const data = json.data;
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    lastActivityAt: data.lastActivityAt ? new Date(data.lastActivityAt) : null,
    subscription: {
      ...data.subscription,
      periodEndDate: data.subscription.periodEndDate
        ? new Date(data.subscription.periodEndDate)
        : null,
    },
    subscriptionDetails: {
      ...data.subscriptionDetails,
      periodEndDate: data.subscriptionDetails.periodEndDate
        ? new Date(data.subscriptionDetails.periodEndDate)
        : null,
      currentPeriodStart: data.subscriptionDetails.currentPeriodStart
        ? new Date(data.subscriptionDetails.currentPeriodStart)
        : null,
      currentPeriodEnd: data.subscriptionDetails.currentPeriodEnd
        ? new Date(data.subscriptionDetails.currentPeriodEnd)
        : null,
    },
    recentLifecycleEvents: data.recentLifecycleEvents.map(event => ({
      ...event,
      timestamp: new Date(event.timestamp),
    })),
  };
}

/**
 * Fetch recent audit logs for a tenant.
 */
async function fetchTenantAuditLogs(
  tenantId: string,
  page: number,
  pageSize: number,
): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  const response = await fetch(
    `/api/admin/platform/tenants/${tenantId}/audit-logs?${params}`,
    {
      credentials: 'include',
    },
  );

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw {
      type: 'technical',
      code: errorData.code ?? 'PLATFORM_AUDIT_FETCH_ERROR',
      message:
        errorData.message ?? `Failed to fetch audit logs: ${response.status}`,
    } as AppError;
  }

  const json = (await response.json()) as {
    data?: { logs: AuditLogEntry[]; total: number };
  };

  if (!json.data) {
    return { logs: [], total: 0 };
  }

  // Parse date fields
  return {
    logs: json.data.logs.map(log => ({
      ...log,
      timestamp: new Date(log.timestamp),
    })),
    total: json.data.total,
  };
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useTenantDetailViewModel — React hook for the Tenant Detail screen (Platform Admin).
 *
 * @param tenantId - ID of the tenant to display
 * @returns TenantDetailViewModel with state and actions
 *
 * @example
 * ```tsx
 * const vm = useTenantDetailViewModel(tenantId);
 *
 * return (
 *   <TenantDetailScreen
 *     tenant={vm.tenantDetail}
 *     activeTab={vm.activeTab}
 *     onTabChange={vm.setTab}
 *     isLoading={vm.isLoading}
 *   />
 * );
 * ```
 */
export function useTenantDetailViewModel(tenantId: string): TenantDetailViewModel {
  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  const { hasPermission, isLoading: isPermissionsLoading, role } = usePermissions();

  const isPlatformAdmin = role === 'PLATFORM_ADMIN';

  // Derive specific permissions
  const canImpersonate = isPlatformAdmin;
  const canForceSuspend = isPlatformAdmin;
  const canForceClose = isPlatformAdmin;
  const canResetTokenVersion = isPlatformAdmin;

  // ---------------------------------------------------------------------------
  // Tab State
  // ---------------------------------------------------------------------------

  const [activeTab, setActiveTab] = useState<TenantDetailTab>('profile');

  // ---------------------------------------------------------------------------
  // Audit Log Pagination State
  // ---------------------------------------------------------------------------

  const [auditPage, setAuditPage] = useState<number>(1);
  const auditPageSize = 25;

  // ---------------------------------------------------------------------------
  // React Query - Tenant Detail
  // ---------------------------------------------------------------------------

  const {
    data: tenantDetail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery<TenantDetail, AppError>({
    queryKey: [TENANT_DETAIL_QUERY_KEY, tenantId],
    queryFn: () => fetchTenantDetail(tenantId),
    enabled: isPlatformAdmin && !isPermissionsLoading && !!tenantId,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ---------------------------------------------------------------------------
  // React Query - Audit Logs
  // ---------------------------------------------------------------------------

  const {
    data: auditData,
    isLoading: isAuditLoading,
    isError: isAuditError,
  } = useQuery<{ logs: AuditLogEntry[]; total: number }, AppError>({
    queryKey: [TENANT_DETAIL_QUERY_KEY, tenantId, 'audit', auditPage, auditPageSize],
    queryFn: () => fetchTenantAuditLogs(tenantId, auditPage, auditPageSize),
    enabled: isPlatformAdmin && !isPermissionsLoading && !!tenantId && activeTab === 'audit',
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const profile = tenantDetail?.profile ?? null;
  const subscriptionDetails = tenantDetail?.subscriptionDetails ?? null;
  const lifecycleHistory = tenantDetail?.recentLifecycleEvents ?? [];
  const memberDistribution = tenantDetail?.memberDistribution ?? {};

  const auditLogs = auditData?.logs ?? [];
  const auditTotalPages = Math.ceil((auditData?.total ?? 0) / auditPageSize);

  const isLoading =
    isPermissionsLoading ||
    isDetailLoading ||
    (activeTab === 'audit' && isAuditLoading);

  const isError = isDetailError || (activeTab === 'audit' && isAuditError);

  const error = useMemo<AppError | null>(() => {
    if (detailError) return detailError;
    return null;
  }, [detailError]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const setTab = useCallback((tab: TenantDetailTab) => {
    setActiveTab(tab);
  }, []);

  const handleRefetch = useCallback(() => {
    refetchDetail();
  }, [refetchDetail]);

  const goBack = useCallback(() => {
    // Navigate back to platform dashboard
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  }, []);

  // Reset audit page when tenant changes
  useEffect(() => {
    setAuditPage(1);
  }, [tenantId]);

  // ---------------------------------------------------------------------------
  // Return ViewModel
  // ---------------------------------------------------------------------------

  return {
    // Data
    tenantDetail: tenantDetail ?? null,
    tenantId,
    profile,
    subscriptionDetails,
    lifecycleHistory,
    auditLogs,
    memberDistribution,
    isLoading,
    isError,
    error,

    // Tab
    activeTab,

    // Audit Pagination
    auditPage,
    auditTotalPages,
    auditPageSize,

    // Permissions
    isPlatformAdmin,
    canImpersonate,
    canForceSuspend,
    canForceClose,
    canResetTokenVersion,

    // Actions
    setTab,
    setAuditPage,
    refetch: handleRefetch,
    goBack,
  };
}

export default useTenantDetailViewModel;
