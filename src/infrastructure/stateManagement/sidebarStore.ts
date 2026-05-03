/**
 * Sidebar Store — Manages sidebar open/collapsed state.
 *
 * Uses Zustand for shared UI state (not business logic).
 */

import { create } from 'zustand';

interface SidebarState {
  readonly isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

export const useSidebarStore = create<SidebarState>(set => ({
  isOpen: true,
  toggle: () => set(state => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
