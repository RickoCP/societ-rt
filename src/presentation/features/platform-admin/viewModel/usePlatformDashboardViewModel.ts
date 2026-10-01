'use client';

/**
 * usePlatformDashboardViewModel — ViewModel for the Platform Admin Dashboard screen.
 *
 * Provides state and actions for:
 * - Fetching platform-wide metrics with React Query
 * - Fetching paginated tenant overviews with filtering and sorting
 * - Fetching recent system alerts
 * - Auto-refresh metrics every 60 seconds
 *
 * This ViewModel follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * AUTHORIZATION:
 * - Requires PLATFORM_ADMIN role
 * - Redirects to unauthorized page if access denied
 *
 * @see Requirements 19.1-19.11 (Platform Admin Dashboard)
 * @see Design Components > 11. Platform Admin Dashboard
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@presentation/hooks/usePermissions';
import type { AppError } from '@core/utils';
import type {
  PlatformMetrics,
  SystemAlert,
  AlertSeverity,
  SystemAlertType,
} from '@core/domains/platform/entities/PlatformMetrics';
import type {
  TenantOverview,
  PaginatedTenantOverviews,
  TenantOverviewFilters,
  TenantOverviewSort,
  TenantOverviewSortColumn,
} from '@core/domains/platform/entities/TenantOverview';
import type { LifecycleStatusValue } from '@core/domains/tenant/entities/TenantLifecycleStatus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * React Query cache key for platform metrics.
 */
export const PLATFORM_METRICS_QUERY_KEY = 'platformMetrics';

/**
 * React Query cache key for tenant overview.
 */
export const TENANT_OVERVIEW_QUERY_KEY = 'tenantOverview';

/**
 * React Query cache key for system alerts.
 */
export const SYSTEM_ALERTS_QUERY_KEY = 'systemAlerts';

/**
 * Auto-refresh interval in milliseconds (60 seconds).
 * @see Requirements 19.10
 */
export const AUTO_REFRESH_INTERVAL_MS = 60 * 1000;

/**
 * Default page size for tenant overview.
 */
export const DEFAULT_TENANT_PAGE_SIZE = 25;

/**
 * Valid page sizes for tenant overview pagination.
 */
export const VALID_PAGE_SIZES = [10, 25, 50, 100] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Sort direction type.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Filter state for tenant overview.
 */
export interface TenantListFilters {
  status: LifecycleStatusValue | null;
  plan: string | null;
  search: string;
}

/**
 * Return type of usePlatformDashboardViewModel hook.
 */
export interface PlatformDashboardViewModel {
  // ---------------------------------------------------------------------------
  // Authorization State
  // ---------------------------------------------------------------------------

  /**
   * Whether the user has PLATFORM_ADMIN role.
   */
  isPlatformAdmin: boolean;

  /**
   * Whether authorization is being checked.
   */
  isAuthLoading: boolean;

  // ---------------------------------------------------------------------------
  // Metrics State
  // ---------------------------------------------------------------------------

  /**
   * Platform-wide metrics data.
   */
  metrics: PlatformMetrics | null;

  /**
   * Whether metrics are being fetched.
   */
  isMetricsLoading: boolean;

  /**
   * Whether metrics fetch has failed.
   */
  isMetricsError: boolean;

  /**
   * Error details if metrics fetch failed.
   */
  metricsError: AppError | null;

  /**
   * Last time metrics were refreshed.
   */
  metricsLastUpdated: Date | null;

  /**
   * Seconds until next auto-refresh.
   */
  refreshCountdown: number;

  /**
   * Whether auto-refresh is currently active.
   */
  isAutoRefreshActive: boolean;

  // ---------------------------------------------------------------------------
  // Tenant Overview State
  // ---------------------------------------------------------------------------

  /**
   * Paginated tenant overview data.
   */
  tenants: TenantOverview[];

  /**
   * Total count of tenants matching filters.
   */
  tenantTotalCount: number;

  /**
   * Total pages for tenant overview.
   */
  tenantTotalPages: number;

  /**
   * Current page for tenant overview.
   */
  tenantPage: number;

  /**
   * Page size for tenant overview.
   */
  tenantPageSize: number;

  /**
   * Whether tenant overview is being fetched.
   */
  isTenantsLoading: boolean;

  /**
   * Whether tenant overview fetch has failed.
   */
  isTenantsError: boolean;

  /**
   * Error details if tenant fetch failed.
   */
  tenantsError: AppError | null;

  /**
   * Current tenant filters.
   */
  tenantFilters: TenantListFilters;

  /**
   * Current sort column for tenant overview.
   */
  tenantSortColumn: TenantOverviewSortColumn;

  /**
   * Current sort direction for tenant overview.
   */
  tenantSortDirection: SortDirection;

  // ---------------------------------------------------------------------------
  // System Alerts State
  // ---------------------------------------------------------------------------

  /**
   * Recent system alerts.
   */
  alerts: SystemAlert[];

  /**
   * Whether alerts are being fetched.
   */
  isAlertsLoading: boolean;

  /**
   * Whether alerts fetch has failed.
   */
  isAlertsError: boolean;

  /**
   * Count of unacknowledged critical/high alerts (for badge).
   */
  criticalAlertCount: number;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Manually refresh all platform metrics.
   */
  refreshMetrics: () => void;

  /**
   * Navigate to a specific tenant's detail view.
   * @param tenantId - Tenant ID to navigate to
   */
  navigateToTenant: (tenantId: string) => void;

  /**
   * Navigate to provision new tenant wizard.
   */
  provisionNewTenant: () => void;

  /**
   * Acknowledge a system alert.
   * @param alertId - Alert ID to acknowledge
   */
  acknowledgeAlert: (alertId: string) => Promise<void>;

  /**
   * Set page for tenant overview.
   */
  setTenantPage: (page: number) => void;

  /**
   * Set page size for tenant overview.
   */
  setTenantPageSize: (size: 10 | 25 | 50 | 100) => void;

  /**
   * Set sort for tenant overview.
   */
  setTenantSort: (column: TenantOverviewSortColumn, direction: SortDirection) => void;

  /**
   * Set filters for tenant overview.
   */
  setTenantFilters: (filters: Partial<TenantListFilters>) => void;

  /**
   * Clear all tenant filters.
   */
  clearTenantFilters: () => void;

  /**
   * Refetch tenant overview.
   */
  refetchTenants: () => void;

  /**
   * Toggle auto-refresh.
   */
  toggleAutoRefresh: () => void;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch platform metrics from the API.
 */
async function fetchPlatformMetrics(forceRefresh = false): Promise<PlatformMetrics> {
  const params = new URLSearchParams();
  if (forceRefresh) {
    params.set('forceRefresh', 'true');
  }

  const url = `/api/admin/platform/metrics${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url, {
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
            : 'technical',
      code: errorData.code ?? 'PLATFORM_METRICS_FETCH_ERROR',
      message: errorData.message ?? `Failed to fetch platform metrics: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: PlatformMetrics };

  if (!json.data) {
    throw {
      type: 'technical',
      code: 'PLATFORM_METRICS_INVALID_RESPONSE',
      message: 'Invalid response format from platform metrics API',
    } as AppError;
  }

  return json.data;
}

/**
 * Fetch tenant overviews from the API.
 */
async function fetchTenantOverviews(options: {
  page: number;
  pageSize: number;
  filters?: TenantListFilters;
  sort?: TenantOverviewSort;
}): Promise<PaginatedTenantOverviews> {
  const { page, pageSize, filters, sort } = options;

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  if (filters?.status) {
    params.set('status', filters.status);
  }
  if (filters?.plan) {
    params.set('plan', filters.plan);
  }
  if (filters?.search) {
    params.set('search', filters.search);
  }
  if (sort) {
    params.set('sortColumn', sort.column);
    params.set('sortDirection', sort.direction);
  }

  const response = await fetch(`/api/admin/platform/tenants?${params.toString()}`, {
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
            : 'technical',
      code: errorData.code ?? 'TENANT_OVERVIEW_FETCH_ERROR',
      message: errorData.message ?? `Failed to fetch tenant overviews: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: PaginatedTenantOverviews };

  if (!json.data) {
    throw {
      type: 'technical',
      code: 'TENANT_OVERVIEW_INVALID_RESPONSE',
      message: 'Invalid response format from tenant overview API',
    } as AppError;
  }

  return json.data;
}

/**
 * Fetch system alerts from the API.
 */
async function fetchSystemAlerts(): Promise<SystemAlert[]> {
  const response = await fetch('/api/admin/platform/alerts?limit=20&includeAcknowledged=false', {
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
            : 'technical',
      code: errorData.code ?? 'SYSTEM_ALERTS_FETCH_ERROR',
      message: errorData.message ?? `Failed to fetch system alerts: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: SystemAlert[] };

  return json.data ?? [];
}

/**
 * Acknowledge a system alert via API.
 */
async function acknowledgeAlertApi(alertId: string): Promise<void> {
  const response = await fetch(`/api/admin/platform/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw {
      type: 'technical',
      code: errorData.code ?? 'ALERT_ACKNOWLEDGE_ERROR',
      message: errorData.message ?? 'Failed to acknowledge alert',
    } as AppError;
  }
}

// ---------------------------------------------------------------------------
// Default Filter Values
// ---------------------------------------------------------------------------

const DEFAULT_TENANT_FILTERS: TenantListFilters = {
  status: null,
  plan: null,
  search: '',
};

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * usePlatformDashboardViewModel — React hook for the Platform Admin Dashboard.
 *
 * @returns PlatformDashboardViewModel with state and actions
 *
 * @example
 * ```tsx
 * const vm = usePlatformDashboardViewModel();
 *
 * if (!vm.isPlatformAdmin) {
 *   return <Redirect to="/unauthorized" />;
 * }
 *
 * return (
 *   <PlatformDashboard
 *     metrics={vm.metrics}
 *     tenants={vm.tenants}
 *     alerts={vm.alerts}
 *     onRefresh={vm.refreshMetrics}
 *   />
 * );
 * ```
 */
export function usePlatformDashboardViewModel(): PlatformDashboardViewModel {
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  const {
    hasPermission,
    isLoading: isPermissionsLoading,
    role,
    userContext,
  } = usePermissions();

  // PLATFORM_ADMIN role check (role-based, not permission-based)
  const isPlatformAdmin = role === 'PLATFORM_ADMIN';

  // ---------------------------------------------------------------------------
  // Auto-refresh State
  // ---------------------------------------------------------------------------

  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState(true);
  const [refreshCountdown, setRefreshCountdown] = useState(60);
  const [metricsLastUpdated, setMetricsLastUpdated] = useState<Date | null>(null);

  // ---------------------------------------------------------------------------
  // Tenant Pagination State
  // ---------------------------------------------------------------------------

  const [tenantPage, setTenantPageState] = useState(1);
  const [tenantPageSize, setTenantPageSizeState] = useState<10 | 25 | 50 | 100>(
    DEFAULT_TENANT_PAGE_SIZE as 10 | 25 | 50 | 100,
  );

  // ---------------------------------------------------------------------------
  // Tenant Sorting State
  // ---------------------------------------------------------------------------

  const [tenantSortColumn, setTenantSortColumn] =
    useState<TenantOverviewSortColumn>('createdAt');
  const [tenantSortDirection, setTenantSortDirection] = useState<SortDirection>('desc');

  // ---------------------------------------------------------------------------
  // Tenant Filters State
  // ---------------------------------------------------------------------------

  const [tenantFilters, setTenantFiltersState] =
    useState<TenantListFilters>(DEFAULT_TENANT_FILTERS);

  // ---------------------------------------------------------------------------
  // Query Options (memoized)
  // ---------------------------------------------------------------------------

  const tenantQueryOptions = useMemo(
    () => ({
      page: tenantPage,
      pageSize: tenantPageSize,
      filters: tenantFilters,
      sort: {
        column: tenantSortColumn,
        direction: tenantSortDirection,
      },
    }),
    [tenantPage, tenantPageSize, tenantFilters, tenantSortColumn, tenantSortDirection],
  );

  // ---------------------------------------------------------------------------
  // React Query - Platform Metrics
  // ---------------------------------------------------------------------------

  const {
    data: metricsData,
    isLoading: isMetricsQueryLoading,
    isError: isMetricsError,
    error: metricsQueryError,
    refetch: refetchMetrics,
  } = useQuery<PlatformMetrics, AppError>({
    queryKey: [PLATFORM_METRICS_QUERY_KEY],
    queryFn: () => fetchPlatformMetrics(false),
    enabled: isPlatformAdmin && !isPermissionsLoading,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: isAutoRefreshActive ? AUTO_REFRESH_INTERVAL_MS : false,
  });

  // ---------------------------------------------------------------------------
  // React Query - Tenant Overviews
  // ---------------------------------------------------------------------------

  const {
    data: tenantsData,
    isLoading: isTenantsQueryLoading,
    isError: isTenantsError,
    error: tenantsQueryError,
    refetch: refetchTenantsQuery,
  } = useQuery<PaginatedTenantOverviews, AppError>({
    queryKey: [TENANT_OVERVIEW_QUERY_KEY, tenantQueryOptions],
    queryFn: () => fetchTenantOverviews(tenantQueryOptions),
    enabled: isPlatformAdmin && !isPermissionsLoading,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ---------------------------------------------------------------------------
  // React Query - System Alerts
  // ---------------------------------------------------------------------------

  const {
    data: alertsData,
    isLoading: isAlertsLoading,
    isError: isAlertsError,
    refetch: refetchAlerts,
  } = useQuery<SystemAlert[], AppError>({
    queryKey: [SYSTEM_ALERTS_QUERY_KEY],
    queryFn: fetchSystemAlerts,
    enabled: isPlatformAdmin && !isPermissionsLoading,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: isAutoRefreshActive ? AUTO_REFRESH_INTERVAL_MS : false,
  });

  // ---------------------------------------------------------------------------
  // Auto-refresh Countdown Effect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isAutoRefreshActive) {
      setRefreshCountdown(60);
      return;
    }

    const interval = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          return 60; // Reset to 60 seconds
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAutoRefreshActive]);

  // ---------------------------------------------------------------------------
  // Update last updated timestamp when metrics change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (metricsData) {
      setMetricsLastUpdated(new Date());
    }
  }, [metricsData]);

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const metrics = metricsData ?? null;
  const tenants = tenantsData?.tenants ?? [];
  const tenantTotalCount = tenantsData?.totalCount ?? 0;
  const tenantTotalPages = tenantsData?.totalPages ?? 1;
  const alerts = alertsData ?? [];

  // Count of unacknowledged critical/high severity alerts
  const criticalAlertCount = useMemo(() => {
    return alerts.filter(
      alert =>
        !alert.acknowledged && (alert.severity === 'critical' || alert.severity === 'high'),
    ).length;
  }, [alerts]);

  const isMetricsLoading = isPermissionsLoading || isMetricsQueryLoading;
  const isTenantsLoading = isPermissionsLoading || isTenantsQueryLoading;

  const metricsError = useMemo<AppError | null>(() => {
    if (!metricsQueryError) return null;
    return metricsQueryError;
  }, [metricsQueryError]);

  const tenantsError = useMemo<AppError | null>(() => {
    if (!tenantsQueryError) return null;
    return tenantsQueryError;
  }, [tenantsQueryError]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const refreshMetrics = useCallback(() => {
    setRefreshCountdown(60);
    refetchMetrics();
    refetchAlerts();
  }, [refetchMetrics, refetchAlerts]);

  const navigateToTenant = useCallback(
    (tenantId: string) => {
      router.push(`/dashboard/admin/tenants/${tenantId}`);
    },
    [router],
  );

  const provisionNewTenant = useCallback(() => {
    router.push('/dashboard/admin/tenants/new');
  }, [router]);

  const acknowledgeAlert = useCallback(
    async (alertId: string) => {
      await acknowledgeAlertApi(alertId);
      refetchAlerts();
    },
    [refetchAlerts],
  );

  const setTenantPage = useCallback((page: number) => {
    if (page < 1) return;
    setTenantPageState(page);
  }, []);

  const setTenantPageSize = useCallback((size: 10 | 25 | 50 | 100) => {
    if (!VALID_PAGE_SIZES.includes(size)) return;
    setTenantPageSizeState(size);
    setTenantPageState(1); // Reset to first page
  }, []);

  const setTenantSort = useCallback(
    (column: TenantOverviewSortColumn, direction: SortDirection) => {
      setTenantSortColumn(column);
      setTenantSortDirection(direction);
    },
    [],
  );

  const setTenantFilters = useCallback((newFilters: Partial<TenantListFilters>) => {
    setTenantFiltersState(prev => ({
      ...prev,
      ...newFilters,
    }));
    setTenantPageState(1); // Reset to first page
  }, []);

  const clearTenantFilters = useCallback(() => {
    setTenantFiltersState(DEFAULT_TENANT_FILTERS);
    setTenantPageState(1);
  }, []);

  const refetchTenants = useCallback(() => {
    refetchTenantsQuery();
  }, [refetchTenantsQuery]);

  const toggleAutoRefresh = useCallback(() => {
    setIsAutoRefreshActive(prev => !prev);
  }, []);

  // ---------------------------------------------------------------------------
  // Return ViewModel
  // ---------------------------------------------------------------------------

  return {
    // Authorization
    isPlatformAdmin,
    isAuthLoading: isPermissionsLoading,

    // Metrics
    metrics,
    isMetricsLoading,
    isMetricsError,
    metricsError,
    metricsLastUpdated,
    refreshCountdown,
    isAutoRefreshActive,

    // Tenant Overview
    tenants,
    tenantTotalCount,
    tenantTotalPages,
    tenantPage,
    tenantPageSize,
    isTenantsLoading,
    isTenantsError,
    tenantsError,
    tenantFilters,
    tenantSortColumn,
    tenantSortDirection,

    // Alerts
    alerts,
    isAlertsLoading,
    isAlertsError,
    criticalAlertCount,

    // Actions
    refreshMetrics,
    navigateToTenant,
    provisionNewTenant,
    acknowledgeAlert,
    setTenantPage,
    setTenantPageSize,
    setTenantSort,
    setTenantFilters,
    clearTenantFilters,
    refetchTenants,
    toggleAutoRefresh,
  };
}

export default usePlatformDashboardViewModel;
