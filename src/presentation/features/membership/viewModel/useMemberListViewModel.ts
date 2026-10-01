'use client';

/**
 * useMemberListViewModel — ViewModel for the Member List screen.
 *
 * Provides state and actions for:
 * - Fetching paginated members with React Query
 * - Managing pagination state (page, pageSize)
 * - Managing sorting state (column, direction)
 * - Managing filter state (search, role, status, orgUnitId)
 * - Managing selection state for bulk operations
 *
 * This ViewModel follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * @see Requirements 2.1-2.12 (Membership List Screen)
 * @see Design Components > 2.1-2.4 (Member List Screen)
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@presentation/hooks/usePermissions';
import type { Member, PaginatedMembers } from '@core/domains/membership/entities/Member';
import type {
  MemberFilters,
  MemberSortOptions,
  MemberSortColumn,
  MemberPaginationOptions,
  MemberListQueryOptions,
} from '@core/domains/membership/entities/MemberFilters';
import {
  DEFAULT_PAGINATION,
  DEFAULT_SORT,
  VALID_PAGE_SIZES,
} from '@core/domains/membership/entities/MemberFilters';
import type { MembershipRole } from '@core/domains/membership/types/MembershipRole';
import type { MembershipStatus } from '@core/domains/membership/types/MembershipStatus';
import type { AppError } from '@core/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * React Query cache key for member list queries.
 */
export const MEMBER_LIST_QUERY_KEY = 'memberList';

/**
 * Maximum number of members that can be selected for bulk operations.
 * @see Requirements 6.8
 */
export const MAX_BULK_SELECTION = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Filter values used by the ViewModel.
 * Same as MemberFilters but with explicit nullable types for UI binding.
 */
export interface MemberListFilters {
  search: string;
  role: MembershipRole | null;
  status: MembershipStatus | null;
  orgUnitId: string | null;
}

/**
 * Sort direction type.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Return type of useMemberListViewModel hook.
 */
export interface MemberListViewModel {
  // ---------------------------------------------------------------------------
  // Data State (React Query)
  // ---------------------------------------------------------------------------
  
  /**
   * List of members for the current page.
   */
  members: Member[];
  
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
  // Pagination State
  // ---------------------------------------------------------------------------
  
  /**
   * Current page number (1-indexed).
   */
  page: number;
  
  /**
   * Number of items per page.
   */
  pageSize: number;
  
  /**
   * Total number of pages.
   */
  totalPages: number;
  
  /**
   * Total number of members matching the current filters.
   */
  totalCount: number;
  
  // ---------------------------------------------------------------------------
  // Sorting State
  // ---------------------------------------------------------------------------
  
  /**
   * Current sort column.
   */
  sortColumn: MemberSortColumn;
  
  /**
   * Current sort direction.
   */
  sortDirection: SortDirection;
  
  // ---------------------------------------------------------------------------
  // Filter State
  // ---------------------------------------------------------------------------
  
  /**
   * Current filter values.
   */
  filters: MemberListFilters;
  
  // ---------------------------------------------------------------------------
  // Selection State (for bulk operations)
  // ---------------------------------------------------------------------------
  
  /**
   * Set of selected member IDs.
   */
  selectedIds: Set<string>;
  
  /**
   * Number of selected members.
   */
  selectedCount: number;
  
  /**
   * Whether bulk selection limit is exceeded (>100).
   */
  isSelectionLimitExceeded: boolean;
  
  /**
   * Get selected members data.
   */
  selectedMembers: Member[];
  
  // ---------------------------------------------------------------------------
  // Permission State
  // ---------------------------------------------------------------------------
  
  /**
   * Whether user has membership:read permission.
   */
  canRead: boolean;
  
  /**
   * Whether user has membership:write permission.
   */
  canWrite: boolean;
  
  /**
   * Whether user has membership:delegate permission.
   */
  canDelegate: boolean;
  
  /**
   * Whether user can perform bulk operations.
   * Requires membership:write and selection not exceeding limit.
   */
  canBulkOperate: boolean;
  
  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  
  /**
   * Set the current page number.
   * @param page - Page number (1-indexed)
   */
  setPage: (page: number) => void;
  
  /**
   * Set the page size.
   * @param size - Page size (10, 25, 50, or 100)
   */
  setPageSize: (size: 10 | 25 | 50 | 100) => void;
  
  /**
   * Set the sort column and direction.
   * @param column - Column to sort by
   * @param direction - Sort direction
   */
  setSort: (column: MemberSortColumn, direction: SortDirection) => void;
  
  /**
   * Update filter values.
   * @param filters - Partial filter values to update
   */
  setFilters: (filters: Partial<MemberListFilters>) => void;
  
  /**
   * Clear all filters and reset to defaults.
   */
  clearFilters: () => void;
  
  /**
   * Toggle selection of a single member.
   * @param memberId - Member ID to toggle
   */
  toggleSelection: (memberId: string) => void;
  
  /**
   * Select all members on current page.
   */
  selectAll: () => void;
  
  /**
   * Clear all selections.
   */
  clearSelection: () => void;
  
  /**
   * Refetch the member list.
   */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch paginated members from the API.
 */
async function fetchMembers(
  options: MemberListQueryOptions,
): Promise<PaginatedMembers> {
  const { filters, pagination, sort } = options;
  
  // Build query parameters
  const params = new URLSearchParams();
  params.set('page', String(pagination.page));
  params.set('pageSize', String(pagination.pageSize));
  
  if (sort) {
    params.set('sortColumn', sort.column);
    params.set('sortDirection', sort.direction);
  }
  
  if (filters?.search) {
    params.set('search', filters.search);
  }
  if (filters?.role) {
    params.set('role', filters.role);
  }
  if (filters?.status) {
    params.set('status', filters.status);
  }
  if (filters?.orgUnitId) {
    params.set('orgUnitId', filters.orgUnitId);
  }
  
  const response = await fetch(`/api/admin/members?${params.toString()}`, {
    credentials: 'include',
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { code?: string; message?: string };
    const error: AppError = {
      type: response.status === 401 ? 'authentication' : 
            response.status === 403 ? 'authorization' : 'technical',
      code: errorData.code ?? 'MEMBER_LIST_FETCH_ERROR',
      message: errorData.message ?? `Failed to fetch members: ${response.status}`,
    };
    throw error;
  }
  
  const json = await response.json() as { data?: PaginatedMembers };
  
  if (!json.data) {
    throw {
      type: 'technical',
      code: 'MEMBER_LIST_INVALID_RESPONSE',
      message: 'Invalid response format from members API',
    } as AppError;
  }
  
  return json.data;
}

// ---------------------------------------------------------------------------
// Default Filter Values
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: MemberListFilters = {
  search: '',
  role: null,
  status: null,
  orgUnitId: null,
};

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useMemberListViewModel — React hook for the Member List screen.
 *
 * @returns MemberListViewModel with state and actions
 *
 * @example
 * ```tsx
 * const vm = useMemberListViewModel();
 *
 * return (
 *   <MemberList
 *     members={vm.members}
 *     isLoading={vm.isLoading}
 *     page={vm.page}
 *     totalPages={vm.totalPages}
 *     onPageChange={vm.setPage}
 *     selectedIds={vm.selectedIds}
 *     onSelectionChange={(ids) => { ... }}
 *   />
 * );
 * ```
 */
export function useMemberListViewModel(): MemberListViewModel {
  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------
  
  const {
    hasPermission,
    isLoading: isPermissionsLoading,
    userContext,
  } = usePermissions();
  
  const canRead = hasPermission('membership:read');
  const canWrite = hasPermission('membership:write');
  const canDelegate = hasPermission('membership:delegate');
  
  // ---------------------------------------------------------------------------
  // Pagination State
  // ---------------------------------------------------------------------------
  
  const [page, setPageState] = useState<number>(DEFAULT_PAGINATION.page);
  const [pageSize, setPageSizeState] = useState<10 | 25 | 50 | 100>(DEFAULT_PAGINATION.pageSize);
  
  // ---------------------------------------------------------------------------
  // Sorting State
  // ---------------------------------------------------------------------------
  
  const [sortColumn, setSortColumn] = useState<MemberSortColumn>(DEFAULT_SORT.column);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT.direction);
  
  // ---------------------------------------------------------------------------
  // Filter State
  // ---------------------------------------------------------------------------
  
  const [filters, setFiltersState] = useState<MemberListFilters>(DEFAULT_FILTERS);
  
  // ---------------------------------------------------------------------------
  // Selection State
  // ---------------------------------------------------------------------------
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // ---------------------------------------------------------------------------
  // Query Options (memoized)
  // ---------------------------------------------------------------------------
  
  const queryOptions = useMemo<MemberListQueryOptions>(() => ({
    filters: {
      search: filters.search || undefined,
      role: filters.role ?? undefined,
      status: filters.status ?? undefined,
      orgUnitId: filters.orgUnitId ?? undefined,
    },
    pagination: {
      page,
      pageSize,
    },
    sort: {
      column: sortColumn,
      direction: sortDirection,
    },
  }), [filters, page, pageSize, sortColumn, sortDirection]);
  
  // ---------------------------------------------------------------------------
  // React Query
  // ---------------------------------------------------------------------------
  
  const {
    data,
    isLoading: isQueryLoading,
    isError,
    error: queryError,
    refetch,
  } = useQuery<PaginatedMembers, AppError>({
    queryKey: [MEMBER_LIST_QUERY_KEY, queryOptions],
    queryFn: () => fetchMembers(queryOptions),
    enabled: canRead && !isPermissionsLoading,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
    retry: 1,
    refetchOnWindowFocus: false,
  });
  
  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------
  
  const members = data?.members ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 1;
  
  const selectedCount = selectedIds.size;
  const isSelectionLimitExceeded = selectedCount > MAX_BULK_SELECTION;
  const canBulkOperate = canWrite && selectedCount > 0 && !isSelectionLimitExceeded;
  
  const selectedMembers = useMemo(() => {
    return members.filter(member => selectedIds.has(member.id));
  }, [members, selectedIds]);
  
  const isLoading = isPermissionsLoading || isQueryLoading;
  
  const error = useMemo<AppError | null>(() => {
    if (!queryError) return null;
    // queryError is already an AppError from our fetchMembers function
    return queryError;
  }, [queryError]);
  
  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  
  const setPage = useCallback((newPage: number) => {
    if (newPage < 1) return;
    setPageState(newPage);
    // Clear selection when changing pages
    setSelectedIds(new Set());
  }, []);
  
  const setPageSize = useCallback((newSize: 10 | 25 | 50 | 100) => {
    if (!VALID_PAGE_SIZES.includes(newSize)) return;
    setPageSizeState(newSize);
    setPageState(1); // Reset to first page when changing page size
    setSelectedIds(new Set()); // Clear selection
  }, []);
  
  const setSort = useCallback((column: MemberSortColumn, direction: SortDirection) => {
    setSortColumn(column);
    setSortDirection(direction);
  }, []);
  
  const setFilters = useCallback((newFilters: Partial<MemberListFilters>) => {
    setFiltersState(prev => ({
      ...prev,
      ...newFilters,
    }));
    setPageState(1); // Reset to first page when filters change
    setSelectedIds(new Set()); // Clear selection
  }, []);
  
  const clearFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setPageState(1);
    setSelectedIds(new Set());
  }, []);
  
  const toggleSelection = useCallback((memberId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  }, []);
  
  const selectAll = useCallback(() => {
    const allIds = new Set(members.map(m => m.id));
    setSelectedIds(allIds);
  }, [members]);
  
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);
  
  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);
  
  // ---------------------------------------------------------------------------
  // Return ViewModel
  // ---------------------------------------------------------------------------
  
  return {
    // Data
    members,
    isLoading,
    isError,
    error,
    
    // Pagination
    page,
    pageSize,
    totalPages,
    totalCount,
    
    // Sorting
    sortColumn,
    sortDirection,
    
    // Filters
    filters,
    
    // Selection
    selectedIds,
    selectedCount,
    isSelectionLimitExceeded,
    selectedMembers,
    
    // Permissions
    canRead,
    canWrite,
    canDelegate,
    canBulkOperate,
    
    // Actions
    setPage,
    setPageSize,
    setSort,
    setFilters,
    clearFilters,
    toggleSelection,
    selectAll,
    clearSelection,
    refetch: handleRefetch,
  };
}

export default useMemberListViewModel;
