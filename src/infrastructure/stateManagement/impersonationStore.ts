/**
 * Impersonation Store — Manages Super_Admin impersonation indicator state.
 *
 * Uses Zustand for shared UI state (not business logic).
 */

import { create } from 'zustand';

interface ImpersonationState {
  readonly isImpersonating: boolean;
  readonly impersonatedTenantId: string | null;
  readonly impersonatedTenantName: string | null;
  startImpersonation: (tenantId: string, tenantName: string) => void;
  endImpersonation: () => void;
}

export const useImpersonationStore = create<ImpersonationState>(set => ({
  isImpersonating: false,
  impersonatedTenantId: null,
  impersonatedTenantName: null,
  startImpersonation: (tenantId: string, tenantName: string) =>
    set({
      isImpersonating: true,
      impersonatedTenantId: tenantId,
      impersonatedTenantName: tenantName,
    }),
  endImpersonation: () =>
    set({
      isImpersonating: false,
      impersonatedTenantId: null,
      impersonatedTenantName: null,
    }),
}));
