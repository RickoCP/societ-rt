/**
 * MemberFilters — Filter options for member list queries in Admin UI.
 *
 * This interface defines all filtering options available for the MemberList
 * screen, supporting search, role filter, status filter, and OrgUnit filter.
 *
 * @see Requirements 2.8 (filtering by role, status, text search)
 * @see Design Components and Interfaces > 2.2 ViewModel Structure
 */

import type { MembershipRole } from '../types/MembershipRole';
import type { MembershipStatus } from '../types/MembershipStatus';

/**
 * Filters for member list queries.
 *
 * All fields are optional — unset fields mean "no filter" for that dimension.
 * Filters are combined with AND logic (all conditions must match).
 */
export interface MemberFilters {
  /**
   * Text search query — matches against name or email.
   * Case-insensitive partial match.
   */
  readonly search?: string;

  /**
   * Filter by role — exact match.
   * NULL means "all roles".
   */
  readonly role?: MembershipRole | null;

  /**
   * Filter by status — exact match.
   * NULL means "all statuses".
   */
  readonly status?: MembershipStatus | null;

  /**
   * Filter by OrgUnit — members in this OrgUnit only.
   * NULL means "all OrgUnits" (or tenant-wide for tenant-level admins).
   */
  readonly orgUnitId?: string | null;

  /**
   * Include members in descendant OrgUnits.
   * Only applies when orgUnitId is set.
   * Default: true (include descendants).
   */
  readonly includeDescendants?: boolean;
}

/**
 * Pagination options for member list queries.
 *
 * @see Requirements 2.6 (configurable page size)
 */
export interface MemberPaginationOptions {
  /**
   * Page number (1-indexed).
   */
  readonly page: number;

  /**
   * Number of items per page.
   * Valid values: 10, 25, 50, 100.
   */
  readonly pageSize: 10 | 25 | 50 | 100;
}

/**
 * Sorting options for member list queries.
 *
 * @see Requirements 2.7 (sorting by any column)
 */
export interface MemberSortOptions {
  /**
   * Column to sort by.
   */
  readonly column: MemberSortColumn;

  /**
   * Sort direction.
   */
  readonly direction: 'asc' | 'desc';
}

/**
 * Valid columns for sorting member list.
 */
export type MemberSortColumn =
  | 'name'
  | 'email'
  | 'role'
  | 'orgUnitName'
  | 'status'
  | 'createdAt';

/**
 * Combined query options for member list.
 */
export interface MemberListQueryOptions {
  readonly filters?: MemberFilters;
  readonly pagination: MemberPaginationOptions;
  readonly sort?: MemberSortOptions;
}

/**
 * Valid page sizes for member list pagination.
 */
export const VALID_PAGE_SIZES: readonly number[] = [10, 25, 50, 100] as const;

/**
 * Default pagination options.
 */
export const DEFAULT_PAGINATION: MemberPaginationOptions = {
  page: 1,
  pageSize: 25,
};

/**
 * Default sort options.
 */
export const DEFAULT_SORT: MemberSortOptions = {
  column: 'name',
  direction: 'asc',
};
