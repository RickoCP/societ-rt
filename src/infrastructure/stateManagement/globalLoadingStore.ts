/**
 * Global Loading Store — Manages a global loading indicator state.
 *
 * Uses Zustand for shared UI state (not business logic).
 */

import { create } from 'zustand';

interface GlobalLoadingState {
  readonly isLoading: boolean;
  readonly message: string | null;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
}

export const useGlobalLoadingStore = create<GlobalLoadingState>(set => ({
  isLoading: false,
  message: null,
  startLoading: (message?: string) => set({ isLoading: true, message: message ?? null }),
  stopLoading: () => set({ isLoading: false, message: null }),
}));
