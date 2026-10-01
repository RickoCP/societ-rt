/**
 * Admin UI Store — Manages UI state for multi-tenant admin features.
 *
 * Uses Zustand for shared UI state (not business logic).
 * OrgUnit tree expansion state is persisted to localStorage.
 *
 * Note: Sidebar collapsed state is managed by sidebarStore.ts
 * Note: Impersonation state is managed by impersonationStore.ts
 *
 * _Requirements: 6.1, 7.10, 20.3-20.5_
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

/**
 * Filter values for member list and audit log.
 * Generic record to support various filter types per feature.
 */
export interface ActiveFilters {
  /** Member list filters */
  memberList?: {
    search?: string;
    role?: string | null;
    status?: string | null;
    orgUnitId?: string | null;
  };
  /** Audit log filters */
  auditLog?: {
    dateFrom?: string | null;
    dateTo?: string | null;
    eventTypes?: string[];
    actorSearch?: string;
    resourceType?: string | null;
    resourceId?: string | null;
  };
}

/**
 * Admin UI State interface.
 */
interface AdminUiState {
  // ---------------------------------------------------------------------------
  // OrgUnit Tree Expansion State (Persisted)
  // ---------------------------------------------------------------------------
  /** Set of expanded OrgUnit IDs in the tree view */
  readonly orgUnitExpandedIds: Set<string>;

  /**
   * Toggle expansion state of a single OrgUnit node.
   * @param id - OrgUnit ID to toggle
   */
  toggleOrgUnitExpand: (id: string) => void;

  /**
   * Set multiple OrgUnits as expanded (replaces current state).
   * @param ids - Set of OrgUnit IDs to expand
   */
  setOrgUnitExpanded: (ids: Set<string>) => void;

  /**
   * Expand all OrgUnits in the tree.
   * @param allIds - Set of all OrgUnit IDs to expand
   */
  expandAllOrgUnits: (allIds: Set<string>) => void;

  /**
   * Collapse all OrgUnits in the tree.
   */
  collapseAllOrgUnits: () => void;

  // ---------------------------------------------------------------------------
  // Member Selection State
  // ---------------------------------------------------------------------------
  /** Set of selected member IDs for bulk operations */
  readonly memberSelection: Set<string>;

  /**
   * Toggle selection state of a single member.
   * @param id - Member ID to toggle
   */
  toggleMemberSelection: (id: string) => void;

  /**
   * Select multiple members (adds to current selection).
   * @param ids - Array of member IDs to select
   */
  selectMembers: (ids: string[]) => void;

  /**
   * Select all members (replaces current selection).
   * @param ids - Array of all member IDs to select
   */
  selectAllMembers: (ids: string[]) => void;

  /**
   * Clear all member selections.
   */
  clearMemberSelection: () => void;

  /**
   * Check if selection mode is active (any members selected).
   */
  readonly isSelectionMode: boolean;

  // ---------------------------------------------------------------------------
  // Active Filters State
  // ---------------------------------------------------------------------------
  /** Active filters for member list and audit log */
  readonly activeFilters: ActiveFilters;

  /**
   * Set member list filters.
   * @param filters - Partial filter object to merge
   */
  setMemberListFilters: (filters: ActiveFilters['memberList']) => void;

  /**
   * Clear member list filters.
   */
  clearMemberListFilters: () => void;

  /**
   * Set audit log filters.
   * @param filters - Partial filter object to merge
   */
  setAuditLogFilters: (filters: ActiveFilters['auditLog']) => void;

  /**
   * Clear audit log filters.
   */
  clearAuditLogFilters: () => void;

  /**
   * Clear all active filters.
   */
  clearAllFilters: () => void;

  // ---------------------------------------------------------------------------
  // Impersonation Context (Extended for Admin UI)
  // ---------------------------------------------------------------------------
  /**
   * Original auth context before impersonation.
   * Note: Core impersonation state is in impersonationStore.
   * This extends with admin-specific tracking.
   */
  readonly originalAuthContext: {
    tenantId: string;
    tenantName: string;
    orgUnitId: string | null;
  } | null;

  /** Timestamp when impersonation started */
  readonly impersonationStartedAt: Date | null;

  /**
   * Store original context when starting impersonation.
   * @param context - Original auth context to preserve
   */
  setOriginalAuthContext: (context: {
    tenantId: string;
    tenantName: string;
    orgUnitId: string | null;
  }) => void;

  /**
   * Clear original context when ending impersonation.
   */
  clearOriginalAuthContext: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

/**
 * Partial state for persistence (only OrgUnit expansion is persisted).
 */
interface PersistedState {
  orgUnitExpandedIds: string[];
}

/**
 * Admin UI Zustand store with persistence for OrgUnit expansion state.
 */
export const useAdminUiStore = create<AdminUiState>()(
  persist(
    (set, get) => ({
      // -----------------------------------------------------------------------
      // OrgUnit Tree Expansion State
      // -----------------------------------------------------------------------
      orgUnitExpandedIds: new Set<string>(),

      toggleOrgUnitExpand: (id: string) =>
        set(state => {
          const newExpandedIds = new Set(state.orgUnitExpandedIds);
          if (newExpandedIds.has(id)) {
            newExpandedIds.delete(id);
          } else {
            newExpandedIds.add(id);
          }
          return { orgUnitExpandedIds: newExpandedIds };
        }),

      setOrgUnitExpanded: (ids: Set<string>) =>
        set({ orgUnitExpandedIds: new Set(ids) }),

      expandAllOrgUnits: (allIds: Set<string>) =>
        set({ orgUnitExpandedIds: new Set(allIds) }),

      collapseAllOrgUnits: () => set({ orgUnitExpandedIds: new Set<string>() }),

      // -----------------------------------------------------------------------
      // Member Selection State
      // -----------------------------------------------------------------------
      memberSelection: new Set<string>(),

      toggleMemberSelection: (id: string) =>
        set(state => {
          const newSelection = new Set(state.memberSelection);
          if (newSelection.has(id)) {
            newSelection.delete(id);
          } else {
            newSelection.add(id);
          }
          return { memberSelection: newSelection };
        }),

      selectMembers: (ids: string[]) =>
        set(state => {
          const newSelection = new Set(state.memberSelection);
          ids.forEach(id => newSelection.add(id));
          return { memberSelection: newSelection };
        }),

      selectAllMembers: (ids: string[]) =>
        set({ memberSelection: new Set(ids) }),

      clearMemberSelection: () => set({ memberSelection: new Set<string>() }),

      get isSelectionMode() {
        return get().memberSelection.size > 0;
      },

      // -----------------------------------------------------------------------
      // Active Filters State
      // -----------------------------------------------------------------------
      activeFilters: {},

      setMemberListFilters: (filters: ActiveFilters['memberList']) =>
        set(state => ({
          activeFilters: {
            ...state.activeFilters,
            memberList: {
              ...state.activeFilters.memberList,
              ...filters,
            },
          },
        })),

      clearMemberListFilters: () =>
        set(state => ({
          activeFilters: {
            ...state.activeFilters,
            memberList: undefined,
          },
        })),

      setAuditLogFilters: (filters: ActiveFilters['auditLog']) =>
        set(state => ({
          activeFilters: {
            ...state.activeFilters,
            auditLog: {
              ...state.activeFilters.auditLog,
              ...filters,
            },
          },
        })),

      clearAuditLogFilters: () =>
        set(state => ({
          activeFilters: {
            ...state.activeFilters,
            auditLog: undefined,
          },
        })),

      clearAllFilters: () => set({ activeFilters: {} }),

      // -----------------------------------------------------------------------
      // Impersonation Context (Extended)
      // -----------------------------------------------------------------------
      originalAuthContext: null,
      impersonationStartedAt: null,

      setOriginalAuthContext: (context: {
        tenantId: string;
        tenantName: string;
        orgUnitId: string | null;
      }) =>
        set({
          originalAuthContext: context,
          impersonationStartedAt: new Date(),
        }),

      clearOriginalAuthContext: () =>
        set({
          originalAuthContext: null,
          impersonationStartedAt: null,
        }),
    }),
    {
      name: 'admin-ui-store',
      // Only persist OrgUnit expansion state
      partialize: (state): PersistedState => ({
        orgUnitExpandedIds: Array.from(state.orgUnitExpandedIds),
      }),
      // Deserialize Set from array
      merge: (persistedState, currentState) => {
        const persisted = persistedState as PersistedState | undefined;
        return {
          ...currentState,
          orgUnitExpandedIds: new Set(persisted?.orgUnitExpandedIds ?? []),
        };
      },
    },
  ),
);

// ============================================================================
// Selector Hooks (Convenience)
// ============================================================================

/**
 * Get selected member count.
 */
export const useSelectedMemberCount = () =>
  useAdminUiStore(state => state.memberSelection.size);

/**
 * Check if a specific member is selected.
 */
export const useIsMemberSelected = (id: string) =>
  useAdminUiStore(state => state.memberSelection.has(id));

/**
 * Check if a specific OrgUnit is expanded.
 */
export const useIsOrgUnitExpanded = (id: string) =>
  useAdminUiStore(state => state.orgUnitExpandedIds.has(id));

/**
 * Get member list filters.
 */
export const useMemberListFilters = () =>
  useAdminUiStore(state => state.activeFilters.memberList);

/**
 * Get audit log filters.
 */
export const useAuditLogFilters = () =>
  useAdminUiStore(state => state.activeFilters.auditLog);
