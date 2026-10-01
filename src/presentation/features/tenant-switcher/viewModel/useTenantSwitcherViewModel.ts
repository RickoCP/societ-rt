'use client';

/**
 * useTenantSwitcherViewModel — ViewModel for tenant context switching functionality.
 *
 * Provides state and actions for:
 * - Fetching user memberships from /api/auth/me
 * - Tracking current tenant/OrgUnit context
 * - Handling context switch requests
 *
 * @see Requirements 1.1-1.10
 * @see Design Components > 1. Tenant Switcher Component
 */

import { useState, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { usePermissions, invalidatePermissionsCache } from '@presentation/hooks/usePermissions';
import { MembershipRole, MembershipStatus } from '@core/domains/membership';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Summary of a user's membership for display in the tenant switcher.
 */
export interface MembershipSummary {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantLogoUrl: string | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  role: MembershipRole;
  status: MembershipStatus;
}

/**
 * Current context information displayed in the switcher.
 */
export interface CurrentContext {
  tenantId: string;
  tenantName: string;
  orgUnitId: string | null;
  orgUnitName: string | null;
  role: MembershipRole;
}

/**
 * Response from context switch API.
 */
interface ContextSwitchResponse {
  success: boolean;
  data?: {
    accessToken: string;
  };
  message?: string;
  code?: string;
}

/**
 * Return type of useTenantSwitcherViewModel hook.
 */
export interface TenantSwitcherViewModel {
  /**
   * List of all ACTIVE memberships for the current user.
   */
  memberships: MembershipSummary[];

  /**
   * Current active context (tenant, OrgUnit, role).
   */
  currentContext: CurrentContext | null;

  /**
   * Whether the dropdown is currently open.
   */
  isDropdownOpen: boolean;

  /**
   * Whether a context switch is in progress.
   */
  isSwitching: boolean;

  /**
   * Error message if any operation failed.
   */
  error: string | null;

  /**
   * Whether memberships are being loaded.
   */
  isLoading: boolean;

  /**
   * Whether the user can switch contexts (has multiple memberships).
   */
  canSwitch: boolean;

  /**
   * Open the dropdown.
   */
  openDropdown: () => void;

  /**
   * Close the dropdown.
   */
  closeDropdown: () => void;

  /**
   * Toggle the dropdown open/closed state.
   */
  toggleDropdown: () => void;

  /**
   * Switch to a different tenant/OrgUnit context.
   * @param tenantId - Target tenant ID
   * @param orgUnitId - Target OrgUnit ID (null for tenant-level)
   */
  switchContext: (tenantId: string, orgUnitId: string | null) => Promise<void>;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch all memberships for the current user from /api/auth/memberships.
 */
async function fetchMemberships(): Promise<MembershipSummary[]> {
  const response = await fetch('/api/auth/memberships', {
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401) {
      return [];
    }
    throw new Error(`Failed to fetch memberships: ${response.status}`);
  }

  const json = await response.json() as { data?: MembershipSummary[] };
  return json.data ?? [];
}

/**
 * Request context switch to a different tenant/OrgUnit.
 */
async function requestContextSwitch(
  tenantId: string,
  orgUnitId: string | null,
): Promise<ContextSwitchResponse> {
  const response = await fetch('/api/auth/switch-context', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tenantId, orgUnitId }),
  });

  const json = await response.json() as ContextSwitchResponse;

  if (!response.ok) {
    throw new Error(json.message ?? 'Context switch failed');
  }

  return json;
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useTenantSwitcherViewModel — React hook for tenant context switching.
 *
 * Usage:
 * ```tsx
 * const vm = useTenantSwitcherViewModel();
 *
 * return (
 *   <TenantSwitcher
 *     currentContext={vm.currentContext}
 *     memberships={vm.memberships}
 *     isDropdownOpen={vm.isDropdownOpen}
 *     onToggle={vm.toggleDropdown}
 *     onSwitch={vm.switchContext}
 *   />
 * );
 * ```
 *
 * @returns TenantSwitcherViewModel with state and actions
 */
export function useTenantSwitcherViewModel(): TenantSwitcherViewModel {
  const { userContext, isLoading: isContextLoading, isError } = usePermissions();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [isMembershipsLoaded, setIsMembershipsLoaded] = useState(false);
  const [membershipsError, setMembershipsError] = useState<string | null>(null);

  // Current context derived from user context
  const currentContext = useMemo<CurrentContext | null>(() => {
    if (!userContext) return null;

    return {
      tenantId: userContext.tenantId,
      tenantName: userContext.name ?? 'Unknown Tenant',
      orgUnitId: userContext.orgUnitId,
      orgUnitName: null, // Will be populated from memberships
      role: userContext.role as MembershipRole,
    };
  }, [userContext]);

  // Enhanced current context with OrgUnit name from memberships
  const enhancedCurrentContext = useMemo<CurrentContext | null>(() => {
    if (!currentContext) return null;

    const currentMembership = memberships.find(
      m =>
        m.tenantId === currentContext.tenantId &&
        m.orgUnitId === currentContext.orgUnitId,
    );

    return {
      ...currentContext,
      tenantName: currentMembership?.tenantName ?? currentContext.tenantName,
      orgUnitName: currentMembership?.orgUnitName ?? null,
    };
  }, [currentContext, memberships]);

  // Filter to only ACTIVE memberships
  const activeMemberships = useMemo(() => {
    return memberships.filter(m => m.status === MembershipStatus.ACTIVE);
  }, [memberships]);

  // Can switch if there are multiple active memberships
  const canSwitch = activeMemberships.length > 1;

  // Load memberships when dropdown is opened for the first time
  const loadMemberships = useCallback(async () => {
    if (isMembershipsLoaded) return;

    try {
      setMembershipsError(null);
      const data = await fetchMemberships();
      setMemberships(data);
      setIsMembershipsLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load memberships';
      setMembershipsError(message);
    }
  }, [isMembershipsLoaded]);

  // Context switch mutation
  const switchMutation = useMutation({
    mutationFn: ({ tenantId, orgUnitId }: { tenantId: string; orgUnitId: string | null }) =>
      requestContextSwitch(tenantId, orgUnitId),
    onSuccess: () => {
      // Invalidate permissions cache to fetch new context
      invalidatePermissionsCache();
      // Close dropdown
      setIsDropdownOpen(false);
      // Reload page to reflect new context
      window.location.reload();
    },
  });

  // Actions
  const openDropdown = useCallback(() => {
    loadMemberships();
    setIsDropdownOpen(true);
  }, [loadMemberships]);

  const closeDropdown = useCallback(() => {
    setIsDropdownOpen(false);
  }, []);

  const toggleDropdown = useCallback(() => {
    if (isDropdownOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }, [isDropdownOpen, openDropdown, closeDropdown]);

  const switchContext = useCallback(
    async (tenantId: string, orgUnitId: string | null) => {
      // Don't switch if already on this context
      if (
        currentContext &&
        currentContext.tenantId === tenantId &&
        currentContext.orgUnitId === orgUnitId
      ) {
        closeDropdown();
        return;
      }

      await switchMutation.mutateAsync({ tenantId, orgUnitId });
    },
    [currentContext, switchMutation, closeDropdown],
  );

  // Determine error state
  const error = useMemo(() => {
    if (isError) return 'Failed to load user context';
    if (membershipsError) return membershipsError;
    if (switchMutation.isError) {
      return switchMutation.error instanceof Error
        ? switchMutation.error.message
        : 'Context switch failed';
    }
    return null;
  }, [isError, membershipsError, switchMutation.isError, switchMutation.error]);

  return {
    memberships: activeMemberships,
    currentContext: enhancedCurrentContext,
    isDropdownOpen,
    isSwitching: switchMutation.isPending,
    error,
    isLoading: isContextLoading,
    canSwitch,
    openDropdown,
    closeDropdown,
    toggleDropdown,
    switchContext,
  };
}

export default useTenantSwitcherViewModel;
