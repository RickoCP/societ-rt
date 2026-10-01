'use client';

/**
 * useSecurityEventsViewModel — ViewModel for the Security Events screen.
 *
 * Provides state and actions for:
 * - Fetching paginated security events with React Query
 * - Filtering by severity, event type, acknowledged status, date range, tenant, IP
 * - Sorting by timestamp, severity, type, tenant, user
 * - Acknowledging security events
 * - Bulk acknowledging security events
 * - Auto-refresh with configurable interval
 *
 * This ViewModel follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * AUTHORIZATION:
 * - Requires PLATFORM_ADMIN role
 *
 * @see Requirements 21.1-21.12 (Security Event Alerts)
 * @see Design Components > 11. Platform Admin Dashboard > SecurityEvent interface
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@presentation/hooks/usePermissions';
import type { AppError } from '@core/utils';
import type {
  SecurityEvent,
  PaginatedSecurityEvents,
  SecurityEventSeverity,
  SecurityEventType,
  SecurityEventFilters,
  SecurityEventSortColumn,
} from '@core/domains/platform/entities/SecurityEvent';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * React Query cache key for security events.
 */
export const SECURITY_EVENTS_QUERY_KEY = 'securityEvents';

/**
 * React Query cache key for unacknowledged counts.
 */
export const UNACKNOWLEDGED_COUNTS_QUERY_KEY = 'securityEventsUnacknowledgedCounts';

/**
 * Auto-refresh interval in milliseconds (30 seconds).
 */
export const AUTO_REFRESH_INTERVAL_MS = 30 * 1000;

/**
 * Default page size for security events.
 */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Valid page sizes for security events pagination.
 */
export const VALID_PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * All security event types.
 */
export const SECURITY_EVENT_TYPES: readonly SecurityEventType[] = [
  'failed_login_attempt',
  'token_reuse_detected',
  'unauthorized_access',
  'rate_limit_violation',
  'cross_tenant_access_blocked',
  'token_version_reset',
  'suspicious_activity',
  'password_reset_abuse',
  'bulk_operation_anomaly',
  'api_abuse_detected',
] as const;

/**
 * All severity levels.
 */
export const SEVERITY_LEVELS: readonly SecurityEventSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
] as const;

/**
 * Severity display configuration.
 */
export const SEVERITY_CONFIG: Record<
  SecurityEventSeverity,
  { label: string; color: string; bgColor: string }
> = {
  critical: {
    label: 'Critical',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  high: {
    label: 'High',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  low: {
    label: 'Low',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
} as const;

/**
 * Event type display configuration.
 */
export const EVENT_TYPE_CONFIG: Record<SecurityEventType, { label: string }> = {
  failed_login_attempt: { label: 'Failed Login Attempt' },
  token_reuse_detected: { label: 'Token Reuse Detected' },
  unauthorized_access: { label: 'Unauthorized Access' },
  rate_limit_violation: { label: 'Rate Limit Violation' },
  cross_tenant_access_blocked: { label: 'Cross-Tenant Access Blocked' },
  token_version_reset: { label: 'Token Version Reset' },
  suspicious_activity: { label: 'Suspicious Activity' },
  password_reset_abuse: { label: 'Password Reset Abuse' },
  bulk_operation_anomaly: { label: 'Bulk Operation Anomaly' },
  api_abuse_detected: { label: 'API Abuse Detected' },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Sort direction type.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Acknowledged filter type.
 */
export type AcknowledgedFilter = 'all' | 'acknowledged' | 'unacknowledged';

/**
 * Filter state for security events.
 */
export interface SecurityEventListFilters {
  severities: SecurityEventSeverity[];
  types: SecurityEventType[];
  acknowledged: AcknowledgedFilter;
  tenantId: string | null;
  userId: string | null;
  ipAddress: string | null;
  search: string;
  dateFrom: Date | null;
  dateTo: Date | null;
}

/**
 * Return type of useSecurityEventsViewModel hook.
 */
export interface SecurityEventsViewModel {
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
  // Events State
  // ---------------------------------------------------------------------------

  /**
   * List of security events for current page.
   */
  events: SecurityEvent[];

  /**
   * Total count of events matching filters.
   */
  totalCount: number;

  /**
   * Total pages for pagination.
   */
  totalPages: number;

  /**
   * Current page (1-indexed).
   */
  page: number;

  /**
   * Page size.
   */
  pageSize: number;

  /**
   * Whether events are being fetched.
   */
  isLoading: boolean;

  /**
   * Whether events fetch has failed.
   */
  isError: boolean;

  /**
   * Error details if fetch failed.
   */
  error: AppError | null;

  /**
   * Whether events are being refreshed (background).
   */
  isFetching: boolean;

  /**
   * Last time events were refreshed.
   */
  lastUpdated: Date | null;

  // ---------------------------------------------------------------------------
  // Filter State
  // ---------------------------------------------------------------------------

  /**
   * Current filter values.
   */
  filters: SecurityEventListFilters;

  // ---------------------------------------------------------------------------
  // Sort State
  // ---------------------------------------------------------------------------

  /**
   * Current sort column.
   */
  sortColumn: SecurityEventSortColumn;

  /**
   * Current sort direction.
   */
  sortDirection: SortDirection;

  // ---------------------------------------------------------------------------
  // Selection State (for bulk operations)
  // ---------------------------------------------------------------------------

  /**
   * Set of selected event IDs.
   */
  selectedIds: Set<string>;

  /**
   * Whether selection mode is active.
   */
  selectionMode: boolean;

  // ---------------------------------------------------------------------------
  // Auto-refresh State
  // ---------------------------------------------------------------------------

  /**
   * Seconds until next auto-refresh.
   */
  refreshCountdown: number;

  /**
   * Whether auto-refresh is active.
   */
  isAutoRefreshActive: boolean;

  // ---------------------------------------------------------------------------
  // Counts
  // ---------------------------------------------------------------------------

  /**
   * Count of unacknowledged events.
   */
  unacknowledgedCount: number;

  /**
   * Count of critical/high severity unacknowledged events.
   */
  criticalUnacknowledgedCount: number;

  // ---------------------------------------------------------------------------
  // Acknowledge Mutation State
  // ---------------------------------------------------------------------------

  /**
   * Whether an acknowledge operation is in progress.
   */
  isAcknowledging: boolean;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Set page number.
   */
  setPage: (page: number) => void;

  /**
   * Set page size.
   */
  setPageSize: (size: 10 | 25 | 50 | 100) => void;

  /**
   * Set filters.
   */
  setFilters: (filters: Partial<SecurityEventListFilters>) => void;

  /**
   * Clear all filters.
   */
  clearFilters: () => void;

  /**
   * Set sort configuration.
   */
  setSort: (column: SecurityEventSortColumn, direction: SortDirection) => void;

  /**
   * Toggle selection for an event.
   */
  toggleSelection: (eventId: string) => void;

  /**
   * Select all events on current page.
   */
  selectAll: () => void;

  /**
   * Clear all selections.
   */
  clearSelection: () => void;

  /**
   * Toggle selection mode.
   */
  toggleSelectionMode: () => void;

  /**
   * Acknowledge a single event.
   */
  acknowledgeEvent: (eventId: string, note?: string) => Promise<void>;

  /**
   * Acknowledge multiple events (bulk).
   */
  bulkAcknowledgeEvents: (eventIds: string[], note?: string) => Promise<void>;

  /**
   * Acknowledge all selected events.
   */
  acknowledgeSelected: (note?: string) => Promise<void>;

  /**
   * Refresh events data.
   */
  refresh: () => void;

  /**
   * Toggle auto-refresh.
   */
  toggleAutoRefresh: () => void;

  /**
   * Get expanded event details (for detail modal).
   */
  getEventById: (eventId: string) => SecurityEvent | undefined;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Convert filters to API query params.
 */
function buildFilterParams(filters: SecurityEventListFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.severities.length > 0) {
    params.set('severities', filters.severities.join(','));
  }
  if (filters.types.length > 0) {
    params.set('types', filters.types.join(','));
  }
  if (filters.acknowledged !== 'all') {
    params.set('acknowledged', filters.acknowledged === 'acknowledged' ? 'true' : 'false');
  }
  if (filters.tenantId) {
    params.set('tenantId', filters.tenantId);
  }
  if (filters.userId) {
    params.set('userId', filters.userId);
  }
  if (filters.ipAddress) {
    params.set('ipAddress', filters.ipAddress);
  }
  if (filters.search) {
    params.set('search', filters.search);
  }
  if (filters.dateFrom) {
    params.set('dateFrom', filters.dateFrom.toISOString());
  }
  if (filters.dateTo) {
    params.set('dateTo', filters.dateTo.toISOString());
  }

  return params;
}

/**
 * Fetch security events from API.
 */
async function fetchSecurityEvents(options: {
  page: number;
  pageSize: number;
  filters: SecurityEventListFilters;
  sortColumn: SecurityEventSortColumn;
  sortDirection: SortDirection;
}): Promise<PaginatedSecurityEvents> {
  const { page, pageSize, filters, sortColumn, sortDirection } = options;

  const params = buildFilterParams(filters);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  params.set('sortColumn', sortColumn);
  params.set('sortDirection', sortDirection);

  const response = await fetch(`/api/admin/platform/security-events?${params.toString()}`, {
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
      code: errorData.code ?? 'SECURITY_EVENTS_FETCH_ERROR',
      message: errorData.message ?? `Failed to fetch security events: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: PaginatedSecurityEvents };

  if (!json.data) {
    throw {
      type: 'technical',
      code: 'SECURITY_EVENTS_INVALID_RESPONSE',
      message: 'Invalid response format from security events API',
    } as AppError;
  }

  // Convert timestamp strings to Date objects
  const events = json.data.events.map(event => ({
    ...event,
    timestamp: new Date(event.timestamp),
    acknowledgedAt: event.acknowledgedAt ? new Date(event.acknowledgedAt) : null,
  }));

  return {
    ...json.data,
    events,
  };
}

/**
 * Acknowledge a security event via API.
 */
async function acknowledgeEventApi(eventId: string, note?: string): Promise<void> {
  const response = await fetch(`/api/admin/platform/security-events/${eventId}/acknowledge`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ note }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw {
      type: 'technical',
      code: errorData.code ?? 'EVENT_ACKNOWLEDGE_ERROR',
      message: errorData.message ?? 'Failed to acknowledge security event',
    } as AppError;
  }
}

/**
 * Bulk acknowledge security events via API.
 */
async function bulkAcknowledgeEventsApi(eventIds: string[], note?: string): Promise<void> {
  const response = await fetch('/api/admin/platform/security-events/bulk-acknowledge', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ eventIds, note }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw {
      type: 'technical',
      code: errorData.code ?? 'BULK_ACKNOWLEDGE_ERROR',
      message: errorData.message ?? 'Failed to bulk acknowledge security events',
    } as AppError;
  }
}

// ---------------------------------------------------------------------------
// Default Values
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: SecurityEventListFilters = {
  severities: [],
  types: [],
  acknowledged: 'all',
  tenantId: null,
  userId: null,
  ipAddress: null,
  search: '',
  dateFrom: null,
  dateTo: null,
};

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useSecurityEventsViewModel — React hook for the Security Events screen.
 *
 * @returns SecurityEventsViewModel with state and actions
 *
 * @example
 * ```tsx
 * const vm = useSecurityEventsViewModel();
 *
 * if (!vm.isPlatformAdmin) {
 *   return <UnauthorizedPage />;
 * }
 *
 * return (
 *   <SecurityEventsScreen
 *     events={vm.events}
 *     filters={vm.filters}
 *     onFilterChange={vm.setFilters}
 *     onAcknowledge={vm.acknowledgeEvent}
 *   />
 * );
 * ```
 */
export function useSecurityEventsViewModel(): SecurityEventsViewModel {
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  const { isLoading: isPermissionsLoading, role } = usePermissions();
  const isPlatformAdmin = role === 'PLATFORM_ADMIN';

  // ---------------------------------------------------------------------------
  // Auto-refresh State
  // ---------------------------------------------------------------------------

  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState(true);
  const [refreshCountdown, setRefreshCountdown] = useState(30);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ---------------------------------------------------------------------------
  // Pagination State
  // ---------------------------------------------------------------------------

  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState<10 | 25 | 50 | 100>(DEFAULT_PAGE_SIZE as 10 | 25 | 50 | 100);

  // ---------------------------------------------------------------------------
  // Sorting State
  // ---------------------------------------------------------------------------

  const [sortColumn, setSortColumn] = useState<SecurityEventSortColumn>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // ---------------------------------------------------------------------------
  // Filter State
  // ---------------------------------------------------------------------------

  const [filters, setFiltersState] = useState<SecurityEventListFilters>(DEFAULT_FILTERS);

  // ---------------------------------------------------------------------------
  // Selection State
  // ---------------------------------------------------------------------------

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // ---------------------------------------------------------------------------
  // Query Options (memoized)
  // ---------------------------------------------------------------------------

  const queryOptions = useMemo(
    () => ({
      page,
      pageSize,
      filters,
      sortColumn,
      sortDirection,
    }),
    [page, pageSize, filters, sortColumn, sortDirection],
  );

  // ---------------------------------------------------------------------------
  // React Query - Security Events
  // ---------------------------------------------------------------------------

  const {
    data: eventsData,
    isLoading: isEventsQueryLoading,
    isError,
    error: queryError,
    refetch,
    isFetching,
  } = useQuery<PaginatedSecurityEvents, AppError>({
    queryKey: [SECURITY_EVENTS_QUERY_KEY, queryOptions],
    queryFn: () => fetchSecurityEvents(queryOptions),
    enabled: isPlatformAdmin && !isPermissionsLoading,
    staleTime: 15 * 1000, // 15 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: isAutoRefreshActive ? AUTO_REFRESH_INTERVAL_MS : false,
  });

  // ---------------------------------------------------------------------------
  // Acknowledge Mutation
  // ---------------------------------------------------------------------------

  const acknowledgeMutation = useMutation<void, AppError, { eventId: string; note?: string }>({
    mutationFn: ({ eventId, note }) => acknowledgeEventApi(eventId, note),
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [SECURITY_EVENTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [UNACKNOWLEDGED_COUNTS_QUERY_KEY] });
    },
  });

  const bulkAcknowledgeMutation = useMutation<void, AppError, { eventIds: string[]; note?: string }>({
    mutationFn: ({ eventIds, note }) => bulkAcknowledgeEventsApi(eventIds, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SECURITY_EVENTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [UNACKNOWLEDGED_COUNTS_QUERY_KEY] });
      setSelectedIds(new Set());
    },
  });

  // ---------------------------------------------------------------------------
  // Auto-refresh Countdown Effect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isAutoRefreshActive) {
      setRefreshCountdown(30);
      return;
    }

    const interval = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAutoRefreshActive]);

  // ---------------------------------------------------------------------------
  // Update last updated timestamp when data changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (eventsData) {
      setLastUpdated(new Date());
    }
  }, [eventsData]);

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const events = eventsData?.events ?? [];
  const totalCount = eventsData?.totalCount ?? 0;
  const totalPages = eventsData?.totalPages ?? 1;
  const unacknowledgedCount = eventsData?.unacknowledgedCount ?? 0;
  const criticalUnacknowledgedCount = eventsData?.criticalUnacknowledgedCount ?? 0;

  const isLoading = isPermissionsLoading || isEventsQueryLoading;

  const error = useMemo<AppError | null>(() => {
    if (!queryError) return null;
    return queryError;
  }, [queryError]);

  const isAcknowledging = acknowledgeMutation.isPending || bulkAcknowledgeMutation.isPending;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const setPage = useCallback((newPage: number) => {
    if (newPage < 1) return;
    setPageState(newPage);
  }, []);

  const setPageSize = useCallback((size: 10 | 25 | 50 | 100) => {
    if (!VALID_PAGE_SIZES.includes(size)) return;
    setPageSizeState(size);
    setPageState(1);
  }, []);

  const setFilters = useCallback((newFilters: Partial<SecurityEventListFilters>) => {
    setFiltersState(prev => ({
      ...prev,
      ...newFilters,
    }));
    setPageState(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setPageState(1);
  }, []);

  const setSort = useCallback((column: SecurityEventSortColumn, direction: SortDirection) => {
    setSortColumn(column);
    setSortDirection(direction);
  }, []);

  const toggleSelection = useCallback((eventId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    const unacknowledgedEventIds = events
      .filter(e => !e.acknowledged)
      .map(e => e.id);
    setSelectedIds(new Set(unacknowledgedEventIds));
  }, [events]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) {
        // Exiting selection mode, clear selections
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const acknowledgeEvent = useCallback(
    async (eventId: string, note?: string) => {
      await acknowledgeMutation.mutateAsync({ eventId, note });
    },
    [acknowledgeMutation],
  );

  const bulkAcknowledgeEvents = useCallback(
    async (eventIds: string[], note?: string) => {
      await bulkAcknowledgeMutation.mutateAsync({ eventIds, note });
    },
    [bulkAcknowledgeMutation],
  );

  const acknowledgeSelected = useCallback(
    async (note?: string) => {
      if (selectedIds.size === 0) return;
      await bulkAcknowledgeEvents(Array.from(selectedIds), note);
    },
    [selectedIds, bulkAcknowledgeEvents],
  );

  const refresh = useCallback(() => {
    setRefreshCountdown(30);
    refetch();
  }, [refetch]);

  const toggleAutoRefresh = useCallback(() => {
    setIsAutoRefreshActive(prev => !prev);
  }, []);

  const getEventById = useCallback(
    (eventId: string): SecurityEvent | undefined => {
      return events.find(e => e.id === eventId);
    },
    [events],
  );

  // ---------------------------------------------------------------------------
  // Return ViewModel
  // ---------------------------------------------------------------------------

  return {
    // Authorization
    isPlatformAdmin,
    isAuthLoading: isPermissionsLoading,

    // Events
    events,
    totalCount,
    totalPages,
    page,
    pageSize,
    isLoading,
    isError,
    error,
    isFetching,
    lastUpdated,

    // Filters
    filters,

    // Sort
    sortColumn,
    sortDirection,

    // Selection
    selectedIds,
    selectionMode,

    // Auto-refresh
    refreshCountdown,
    isAutoRefreshActive,

    // Counts
    unacknowledgedCount,
    criticalUnacknowledgedCount,

    // Acknowledge state
    isAcknowledging,

    // Actions
    setPage,
    setPageSize,
    setFilters,
    clearFilters,
    setSort,
    toggleSelection,
    selectAll,
    clearSelection,
    toggleSelectionMode,
    acknowledgeEvent,
    bulkAcknowledgeEvents,
    acknowledgeSelected,
    refresh,
    toggleAutoRefresh,
    getEventById,
  };
}

export default useSecurityEventsViewModel;
