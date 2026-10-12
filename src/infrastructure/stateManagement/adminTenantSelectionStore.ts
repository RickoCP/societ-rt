/**
 * Admin Tenant Selection Store — the tenant a PLATFORM_ADMIN is currently
 * viewing across the admin pages (members, org-units, settings, subscription).
 *
 * This is shared UI state (NOT business logic), so it lives in Zustand per the
 * state-management convention. It is persisted to localStorage so the selection
 * survives navigation between admin pages and page reloads.
 *
 * Semantics:
 *   - `selectedTenantId === null` → use the caller's own tenant (default; for a
 *     platform admin that is the platform tenant, which shows no customer data).
 *   - `selectedTenantId !== null` → admin pages append `?tenantId=<id>` to their
 *     API calls; the server honors it ONLY for PLATFORM_ADMIN and audits the
 *     cross-tenant access (see resolveTargetTenant on the BFF side).
 *
 * SECURITY NOTE: this store is a UX convenience only. The authoritative check
 * lives server-side — a non-platform-admin supplying a tenantId is rejected.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminTenantSelectionState {
  /** The tenant id currently being viewed, or null for the caller's own tenant. */
  readonly selectedTenantId: string | null;
  /** Human-readable name of the selected tenant (for display in the selector). */
  readonly selectedTenantName: string | null;

  /** Select a tenant to view across admin pages. Pass null to reset to own tenant. */
  selectTenant: (tenantId: string | null, tenantName: string | null) => void;

  /** Clear the selection (back to the caller's own tenant). */
  clearTenantSelection: () => void;
}

interface PersistedState {
  selectedTenantId: string | null;
  selectedTenantName: string | null;
}

export const useAdminTenantSelectionStore = create<AdminTenantSelectionState>()(
  persist(
    set => ({
      selectedTenantId: null,
      selectedTenantName: null,

      selectTenant: (tenantId, tenantName) =>
        set({ selectedTenantId: tenantId, selectedTenantName: tenantName }),

      clearTenantSelection: () =>
        set({ selectedTenantId: null, selectedTenantName: null }),
    }),
    {
      name: 'admin-tenant-selection',
      partialize: (state): PersistedState => ({
        selectedTenantId: state.selectedTenantId,
        selectedTenantName: state.selectedTenantName,
      }),
    },
  ),
);

/** Convenience selector: just the selected tenant id (or null). */
export const useSelectedAdminTenantId = (): string | null =>
  useAdminTenantSelectionStore(state => state.selectedTenantId);
