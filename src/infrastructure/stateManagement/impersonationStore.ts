/**
 * Impersonation Store — Manages Super_Admin impersonation indicator state.
 *
 * Uses Zustand for shared UI state (not business logic).
 *
 * @see Requirements 20.3-20.5 (Tenant Impersonation)
 */

import { create } from 'zustand';

interface ImpersonationState {
  readonly isImpersonating: boolean;
  readonly impersonatedTenantId: string | null;
  readonly impersonatedTenantName: string | null;
  readonly impersonationSessionId: string | null;
  startImpersonation: (tenantId: string, tenantName: string, sessionId: string) => void;
  endImpersonation: () => void;
}

export const useImpersonationStore = create<ImpersonationState>(set => ({
  isImpersonating: false,
  impersonatedTenantId: null,
  impersonatedTenantName: null,
  impersonationSessionId: null,
  startImpersonation: (tenantId: string, tenantName: string, sessionId: string) =>
    set({
      isImpersonating: true,
      impersonatedTenantId: tenantId,
      impersonatedTenantName: tenantName,
      impersonationSessionId: sessionId,
    }),
  endImpersonation: () =>
    set({
      isImpersonating: false,
      impersonatedTenantId: null,
      impersonatedTenantName: null,
      impersonationSessionId: null,
    }),
}));
