/**
 * State Management — Barrel export for all Zustand stores.
 */

export { useSidebarStore } from './sidebarStore';
export { useGlobalLoadingStore } from './globalLoadingStore';
export { useImpersonationStore } from './impersonationStore';
export {
  useAdminUiStore,
  useSelectedMemberCount,
  useIsMemberSelected,
  useIsOrgUnitExpanded,
  useMemberListFilters,
  useAuditLogFilters,
  type ActiveFilters,
} from './adminUiStore';
export {
  useToastStore,
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showInfoToast,
} from './toastStore';
export type { ToastConfig, Toast, ToastType, ToastAction } from './toastStore';
