/**
 * AuditFilters — Domain value type for Admin UI Audit Log filtering.
 *
 * These filter interfaces are used by the Audit Log Viewer to query and
 * filter audit log entries. They support the FilterPanel component's
 * filter definitions.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 17.8 (Filter Panel with date range, event types, actor search, resource filters)
 * @see Requirements 17.9 (Event type dropdown categories)
 * @see Design Components > 10. Audit Log > AuditFilters interface
 */

import type { AuditEventType, AuditEventCategory } from './AuditEventType';
import type { AuditResourceType } from './AuditLogEntry';

// ---------------------------------------------------------------------------
// Filter Interface
// ---------------------------------------------------------------------------

/**
 * Audit log filters for the Admin UI FilterPanel.
 *
 * All filters are optional. When not specified, no filtering is applied
 * for that dimension.
 *
 * @see Requirements 17.8 (Filter Panel fields)
 * @see Design > AuditLogViewModel > AuditFilters interface
 */
export interface AuditFilters {
  /**
   * Filter by date range — start date (inclusive).
   * NULL means no lower bound.
   *
   * @see Requirements 17.8 (Date range picker from date)
   */
  readonly dateFrom: Date | null;

  /**
   * Filter by date range — end date (inclusive).
   * NULL means no upper bound.
   *
   * @see Requirements 17.8 (Date range picker to date)
   */
  readonly dateTo: Date | null;

  /**
   * Filter by specific event types (multi-select).
   * Empty array means all event types.
   *
   * @see Requirements 17.8 (Event type multi-select dropdown)
   */
  readonly eventTypes: readonly AuditEventType[];

  /**
   * Search actor by name or email (partial match).
   * Empty string means no actor filtering.
   *
   * @see Requirements 17.8 (Actor search by name or email)
   */
  readonly actorSearch: string;

  /**
   * Filter by resource type.
   * NULL means all resource types.
   *
   * @see Requirements 17.8 (Resource type filter)
   */
  readonly resourceType: AuditResourceType | null;

  /**
   * Search by specific resource ID.
   * Empty string means no resource ID filtering.
   *
   * @see Requirements 17.8 (Resource ID search)
   */
  readonly resourceId: string;
}

// ---------------------------------------------------------------------------
// Query Options
// ---------------------------------------------------------------------------

/**
 * Complete query options for audit log fetching.
 *
 * Combines filters with pagination and sorting options.
 *
 * @see Requirements 17.10 (Pagination support)
 */
export interface AuditQueryOptions {
  /** Filter criteria */
  readonly filters: AuditFilters;

  /** Page number (1-indexed) */
  readonly page: number;

  /** Page size */
  readonly pageSize: number;

  /** Sort field */
  readonly sortBy?: AuditSortField;

  /** Sort direction */
  readonly sortOrder?: 'asc' | 'desc';

  /**
   * For PLATFORM_ADMIN: specific tenant to view.
   * NULL = view all tenants (cross-tenant view).
   */
  readonly tenantId?: string | null;
}

/**
 * Fields that can be used for sorting.
 */
export type AuditSortField = 'timestamp' | 'eventType' | 'actor' | 'resource';

// ---------------------------------------------------------------------------
// Default Values
// ---------------------------------------------------------------------------

/**
 * Default/empty filters.
 * Used when resetting filters or initializing the filter panel.
 */
export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  dateFrom: null,
  dateTo: null,
  eventTypes: [],
  actorSearch: '',
  resourceType: null,
  resourceId: '',
} as const;

/**
 * Default query options.
 */
export const DEFAULT_AUDIT_QUERY_OPTIONS: AuditQueryOptions = {
  filters: DEFAULT_AUDIT_FILTERS,
  page: 1,
  pageSize: 25,
  sortBy: 'timestamp',
  sortOrder: 'desc',
} as const;

// ---------------------------------------------------------------------------
// Filter Panel Definition Types
// ---------------------------------------------------------------------------

/**
 * Filter definition for the FilterPanel component.
 *
 * Used to declaratively define the filters shown in the Audit Log Viewer.
 *
 * @see Design Components > 10. Audit Log > FilterPanel
 */
export interface AuditFilterDefinition {
  /** Unique key for this filter */
  readonly key: keyof AuditFilters;

  /** i18n label key */
  readonly labelKey: string;

  /** Filter input type */
  readonly type: 'text' | 'select' | 'multiselect' | 'daterange';

  /** Options for select/multiselect types */
  readonly options?: readonly FilterOption[];

  /** Placeholder text (i18n key) */
  readonly placeholderKey?: string;
}

/**
 * Option for select/multiselect filters.
 */
export interface FilterOption {
  /** Option value */
  readonly value: string;

  /** Option label (i18n key) */
  readonly labelKey: string;

  /** Group/category for grouped selects */
  readonly group?: string;
}

/**
 * Filter definitions for the Audit Log Viewer FilterPanel.
 *
 * @see Requirements 17.8 (Filter Panel with specific fields)
 */
export const AUDIT_FILTER_DEFINITIONS: readonly AuditFilterDefinition[] = [
  {
    key: 'dateFrom',
    labelKey: 'audit.filters.date_from',
    type: 'daterange',
    placeholderKey: 'audit.filters.date_from_placeholder',
  },
  {
    key: 'dateTo',
    labelKey: 'audit.filters.date_to',
    type: 'daterange',
    placeholderKey: 'audit.filters.date_to_placeholder',
  },
  {
    key: 'eventTypes',
    labelKey: 'audit.filters.event_types',
    type: 'multiselect',
    placeholderKey: 'audit.filters.event_types_placeholder',
    // Options are generated dynamically from ALL_AUDIT_EVENT_CATEGORIES
  },
  {
    key: 'actorSearch',
    labelKey: 'audit.filters.actor_search',
    type: 'text',
    placeholderKey: 'audit.filters.actor_search_placeholder',
  },
  {
    key: 'resourceType',
    labelKey: 'audit.filters.resource_type',
    type: 'select',
    placeholderKey: 'audit.filters.resource_type_placeholder',
    // Options are generated dynamically from ALL_AUDIT_RESOURCE_TYPES
  },
  {
    key: 'resourceId',
    labelKey: 'audit.filters.resource_id',
    type: 'text',
    placeholderKey: 'audit.filters.resource_id_placeholder',
  },
] as const;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if any filters are active (non-default values).
 */
export function hasActiveFilters(filters: AuditFilters): boolean {
  return (
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.eventTypes.length > 0 ||
    filters.actorSearch !== '' ||
    filters.resourceType !== null ||
    filters.resourceId !== ''
  );
}

/**
 * Count the number of active filters.
 */
export function countActiveFilters(filters: AuditFilters): number {
  let count = 0;
  if (filters.dateFrom !== null) count++;
  if (filters.dateTo !== null) count++;
  if (filters.eventTypes.length > 0) count++;
  if (filters.actorSearch !== '') count++;
  if (filters.resourceType !== null) count++;
  if (filters.resourceId !== '') count++;
  return count;
}

/**
 * Create a merged filter object with partial updates.
 * Returns a new object (immutable update).
 */
export function mergeFilters(
  current: AuditFilters,
  updates: Partial<AuditFilters>,
): AuditFilters {
  return {
    ...current,
    ...updates,
  };
}

/**
 * Validate date range filters.
 * Returns error message i18n key if invalid, null if valid.
 */
export function validateDateRange(
  dateFrom: Date | null,
  dateTo: Date | null,
): string | null {
  if (dateFrom !== null && dateTo !== null) {
    if (dateFrom > dateTo) {
      return 'audit.filters.error_invalid_date_range';
    }
    
    // Check for maximum range (e.g., 1 year)
    const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year
    if (dateTo.getTime() - dateFrom.getTime() > maxRangeMs) {
      return 'audit.filters.error_date_range_too_large';
    }
  }
  
  return null;
}

/**
 * Get filter summary text for display (e.g., "3 filters active").
 * Returns i18n key and interpolation values.
 */
export function getFilterSummary(filters: AuditFilters): {
  key: string;
  values: Record<string, number | string>;
} {
  const count = countActiveFilters(filters);
  
  if (count === 0) {
    return {
      key: 'audit.filters.no_filters_active',
      values: {},
    };
  }
  
  return {
    key: 'audit.filters.filters_active',
    values: { count },
  };
}

/**
 * Build event type filter options grouped by category.
 *
 * Used by the FilterPanel to render grouped multiselect options.
 */
export function buildEventTypeFilterOptions(
  categories: readonly AuditEventCategory[],
  getEventTypesForCategory: (category: AuditEventCategory) => readonly AuditEventType[],
): readonly FilterOption[] {
  const options: FilterOption[] = [];
  
  for (const category of categories) {
    const eventTypes = getEventTypesForCategory(category);
    for (const eventType of eventTypes) {
      options.push({
        value: eventType,
        labelKey: `audit.event_type.${eventType.toLowerCase()}`,
        group: category,
      });
    }
  }
  
  return options;
}

/**
 * Build resource type filter options.
 */
export function buildResourceTypeFilterOptions(
  resourceTypes: readonly AuditResourceType[],
): readonly FilterOption[] {
  return resourceTypes.map(type => ({
    value: type,
    labelKey: `audit.resource_type.${type.toLowerCase()}`,
  }));
}

