'use client';

/**
 * useMemberCardViewModel — ViewModel for the Member Card modal.
 *
 * Provides state and actions for:
 * - Fetching member details and role change history
 * - Changing member role with delegation matrix validation
 * - Managing OrgUnit selection for org-scoped roles
 * - Displaying success/error toasts
 *
 * This ViewModel follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * @see Requirements 5.1-5.11 (Member Role Change)
 * @see Design Components > 4. Member Role Change
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@presentation/hooks/usePermissions';
import {
  showSuccessToast,
  showErrorToast,
} from '@infrastructure/stateManagement/toastStore';
import type { Member, RoleChangeHistory } from '@core/domains/membership/entities/Member';
import { MembershipRole } from '@core/domains/membership/types/MembershipRole';
import { MembershipStatus } from '@core/domains/membership/types/MembershipStatus';
import { isOrgScopedRole, isTenantLevelRole } from '@core/domains/membership/types';
import {
  getDelegatableRolesFor,
  canDelegate,
} from '@core/domains/membership/services/DelegationMatrixService';
import type { AppError } from '@core/utils';
import type { OrgUnit } from '@core/domains/orgunit/entities/OrgUnit';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * React Query cache key for member details.
 */
export const MEMBER_DETAILS_QUERY_KEY = 'memberDetails';

/**
 * React Query cache key for role change history.
 */
export const ROLE_CHANGE_HISTORY_QUERY_KEY = 'roleChangeHistory';

/**
 * React Query cache key for available OrgUnits.
 */
export const AVAILABLE_ORGUNITS_QUERY_KEY = 'availableOrgUnits';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for useMemberCardViewModel hook.
 */
export interface UseMemberCardViewModelProps {
  /**
   * The member to display in the card.
   * Can be passed directly if already loaded (e.g., from list).
   */
  member?: Member;

  /**
   * The membership ID to fetch details for.
   * Used if member is not provided.
   */
  membershipId?: string;

  /**
   * Whether the modal is open.
   * Used to control data fetching.
   */
  isOpen: boolean;

  /**
   * Callback when the modal should close.
   */
  onClose: () => void;

  /**
   * Callback after successful role change.
   * Used to refresh parent data.
   */
  onRoleChangeSuccess?: () => void;
}

/**
 * Role change form data.
 */
export interface RoleChangeFormData {
  newRole: MembershipRole;
  newOrgUnitId: string | null;
  reason?: string;
}

/**
 * Return type of useMemberCardViewModel hook.
 */
export interface MemberCardViewModel {
  // ---------------------------------------------------------------------------
  // Member Data
  // ---------------------------------------------------------------------------

  /**
   * The member details.
   */
  member: Member | null;

  /**
   * Whether member details are loading.
   */
  isLoadingMember: boolean;

  /**
   * Error loading member details.
   */
  memberError: AppError | null;

  // ---------------------------------------------------------------------------
  // Role Change History
  // ---------------------------------------------------------------------------

  /**
   * Role change history entries.
   */
  changeHistory: RoleChangeHistory[];

  /**
   * Whether history is loading.
   */
  isLoadingHistory: boolean;

  // ---------------------------------------------------------------------------
  // Available Roles (filtered by delegation matrix)
  // ---------------------------------------------------------------------------

  /**
   * Roles available for selection (filtered by current user's delegation scope).
   */
  availableRoles: MembershipRole[];

  // ---------------------------------------------------------------------------
  // Available OrgUnits (for org-scoped roles)
  // ---------------------------------------------------------------------------

  /**
   * OrgUnits available for selection (within current user's scope).
   */
  availableOrgUnits: OrgUnit[];

  /**
   * Whether OrgUnits are loading.
   */
  isLoadingOrgUnits: boolean;

  // ---------------------------------------------------------------------------
  // Form State
  // ---------------------------------------------------------------------------

  /**
   * Selected role in the form.
   */
  selectedRole: MembershipRole | null;

  /**
   * Selected OrgUnit in the form.
   */
  selectedOrgUnitId: string | null;

  /**
   * Optional reason for role change.
   */
  reason: string;

  /**
   * Whether the form has unsaved changes.
   */
  isDirty: boolean;

  /**
   * Whether the selected role requires OrgUnit.
   */
  requiresOrgUnit: boolean;

  /**
   * Whether the form is valid for submission.
   */
  isFormValid: boolean;

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  /**
   * Whether current user can edit the member's role.
   */
  canEdit: boolean;

  // ---------------------------------------------------------------------------
  // Mutation State
  // ---------------------------------------------------------------------------

  /**
   * Whether role change is in progress.
   */
  isSaving: boolean;

  /**
   * Error from role change mutation.
   */
  saveError: AppError | null;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Set the selected role.
   */
  setSelectedRole: (role: MembershipRole) => void;

  /**
   * Set the selected OrgUnit.
   */
  setSelectedOrgUnitId: (orgUnitId: string | null) => void;

  /**
   * Set the reason for role change.
   */
  setReason: (reason: string) => void;

  /**
   * Reset form to initial state (member's current role).
   */
  resetForm: () => void;

  /**
   * Save the role change.
   */
  saveRoleChange: () => Promise<void>;

  /**
   * Refetch member data.
   */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch member details from API.
 */
async function fetchMemberDetails(membershipId: string): Promise<Member> {
  const response = await fetch(`/api/admin/members/${membershipId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type:
        response.status === 401
          ? 'authentication'
          : response.status === 403
            ? 'authorization'
            : response.status === 404
              ? 'not_found'
              : 'technical',
      code: errorData.code ?? 'MEMBER_FETCH_ERROR',
      message: errorData.message ?? `Failed to fetch member: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: Member };

  if (!json.data) {
    throw {
      type: 'technical',
      code: 'MEMBER_INVALID_RESPONSE',
      message: 'Invalid response format from member API',
    } as AppError;
  }

  // Convert date strings to Date objects
  return {
    ...json.data,
    createdAt: new Date(json.data.createdAt),
    updatedAt: new Date(json.data.updatedAt),
    revokedAt: json.data.revokedAt ? new Date(json.data.revokedAt) : undefined,
  };
}

/**
 * Fetch role change history for a member.
 */
async function fetchRoleChangeHistory(
  membershipId: string,
): Promise<RoleChangeHistory[]> {
  const response = await fetch(
    `/api/admin/members/${membershipId}/role-history`,
    {
      credentials: 'include',
    },
  );

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type: response.status === 404 ? 'not_found' : 'technical',
      code: errorData.code ?? 'ROLE_HISTORY_FETCH_ERROR',
      message:
        errorData.message ?? `Failed to fetch role history: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: RoleChangeHistory[] };

  if (!json.data) {
    return [];
  }

  // Convert date strings to Date objects
  return json.data.map(entry => ({
    ...entry,
    changedAt: new Date(entry.changedAt),
  }));
}

/**
 * Fetch available OrgUnits for the current user's scope.
 */
async function fetchAvailableOrgUnits(): Promise<OrgUnit[]> {
  const response = await fetch('/api/admin/orgunits?flat=true', {
    credentials: 'include',
  });

  if (!response.ok) {
    // Non-critical error - return empty array
    return [];
  }

  const json = (await response.json()) as { data?: OrgUnit[] };

  if (!json.data) {
    return [];
  }

  // Convert date strings to Date objects
  return json.data.map(orgUnit => ({
    ...orgUnit,
    createdAt: new Date(orgUnit.createdAt),
    updatedAt: new Date(orgUnit.updatedAt),
  }));
}

/**
 * Change member role via API.
 */
async function changeMemberRole(
  membershipId: string,
  data: RoleChangeFormData,
): Promise<Member> {
  const response = await fetch(`/api/admin/members/${membershipId}/role`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      newRole: data.newRole,
      newOrgUnitId: data.newOrgUnitId,
      reason: data.reason || undefined,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type:
        response.status === 401
          ? 'authentication'
          : response.status === 403
            ? 'authorization'
            : response.status === 400
              ? 'validation'
              : 'technical',
      code: errorData.code ?? 'ROLE_CHANGE_ERROR',
      message: errorData.message ?? `Failed to change role: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: Member };

  if (!json.data) {
    throw {
      type: 'technical',
      code: 'ROLE_CHANGE_INVALID_RESPONSE',
      message: 'Invalid response format from role change API',
    } as AppError;
  }

  return {
    ...json.data,
    createdAt: new Date(json.data.createdAt),
    updatedAt: new Date(json.data.updatedAt),
    revokedAt: json.data.revokedAt ? new Date(json.data.revokedAt) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useMemberCardViewModel — React hook for the Member Card modal.
 *
 * @param props - Hook configuration
 * @returns MemberCardViewModel with state and actions
 *
 * @example
 * ```tsx
 * const vm = useMemberCardViewModel({
 *   member: selectedMember,
 *   isOpen: isModalOpen,
 *   onClose: handleClose,
 *   onRoleChangeSuccess: refetchMemberList,
 * });
 *
 * return (
 *   <MemberCard
 *     viewModel={vm}
 *     isOpen={isModalOpen}
 *     onClose={handleClose}
 *   />
 * );
 * ```
 */
export function useMemberCardViewModel({
  member: initialMember,
  membershipId,
  isOpen,
  onClose,
  onRoleChangeSuccess,
}: UseMemberCardViewModelProps): MemberCardViewModel {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  const {
    hasPermission,
    userContext,
    isLoading: isPermissionsLoading,
  } = usePermissions();

  const canWrite = hasPermission('membership:write');
  const currentUserRole = userContext?.role as MembershipRole | undefined;
  const currentUserMembershipId = userContext?.membershipId;

  // ---------------------------------------------------------------------------
  // Form State
  // ---------------------------------------------------------------------------

  const [selectedRole, setSelectedRoleState] = useState<MembershipRole | null>(
    null,
  );
  const [selectedOrgUnitId, setSelectedOrgUnitIdState] = useState<
    string | null
  >(null);
  const [reason, setReason] = useState('');

  // ---------------------------------------------------------------------------
  // Determine effective membershipId
  // ---------------------------------------------------------------------------

  const effectiveMembershipId = initialMember?.id ?? membershipId;

  // ---------------------------------------------------------------------------
  // Fetch Member Details (if not provided)
  // ---------------------------------------------------------------------------

  const {
    data: fetchedMember,
    isLoading: isFetchingMember,
    error: fetchMemberError,
    refetch: refetchMember,
  } = useQuery<Member, AppError>({
    queryKey: [MEMBER_DETAILS_QUERY_KEY, effectiveMembershipId],
    queryFn: () => fetchMemberDetails(effectiveMembershipId!),
    enabled: isOpen && !initialMember && !!effectiveMembershipId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Use provided member or fetched member
  const member = initialMember ?? fetchedMember ?? null;
  const isLoadingMember = !initialMember && isFetchingMember;
  const memberError = !initialMember ? (fetchMemberError ?? null) : null;

  // ---------------------------------------------------------------------------
  // Fetch Role Change History
  // ---------------------------------------------------------------------------

  const {
    data: changeHistory = [],
    isLoading: isLoadingHistory,
  } = useQuery<RoleChangeHistory[], AppError>({
    queryKey: [ROLE_CHANGE_HISTORY_QUERY_KEY, effectiveMembershipId],
    queryFn: () => fetchRoleChangeHistory(effectiveMembershipId!),
    enabled: isOpen && !!effectiveMembershipId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  // ---------------------------------------------------------------------------
  // Fetch Available OrgUnits
  // ---------------------------------------------------------------------------

  const {
    data: availableOrgUnits = [],
    isLoading: isLoadingOrgUnits,
  } = useQuery<OrgUnit[], AppError>({
    queryKey: [AVAILABLE_ORGUNITS_QUERY_KEY],
    queryFn: fetchAvailableOrgUnits,
    enabled: isOpen,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
  });

  // ---------------------------------------------------------------------------
  // Available Roles (filtered by delegation matrix)
  // ---------------------------------------------------------------------------

  const availableRoles = useMemo<MembershipRole[]>(() => {
    if (!currentUserRole || !member) {
      return [];
    }

    // Get roles that current user can delegate
    const delegatableRoles = getDelegatableRolesFor(currentUserRole);

    // Filter out current member's role (no same-to-same change)
    // Also ensure we can delegate to the current role (to manage this member)
    return delegatableRoles.filter(role => role !== member.role);
  }, [currentUserRole, member]);

  // ---------------------------------------------------------------------------
  // Can Edit Check
  // ---------------------------------------------------------------------------

  const canEdit = useMemo<boolean>(() => {
    // Must have write permission
    if (!canWrite) return false;

    // Cannot be loading permissions
    if (isPermissionsLoading) return false;

    // Must have member data
    if (!member) return false;

    // Cannot edit self
    if (member.id === currentUserMembershipId) return false;

    // Member must be ACTIVE or SUSPENDED (not INVITED or REVOKED)
    if (
      member.status !== MembershipStatus.ACTIVE &&
      member.status !== MembershipStatus.SUSPENDED
    ) {
      return false;
    }

    // Must be able to delegate to the member's current role OR above
    // This means we can manage members whose roles we could grant
    if (!currentUserRole) return false;

    // Check if we can delegate to/manage the member's current role
    // PLATFORM_ADMIN and TENANT_OWNER have special handling
    if (currentUserRole === MembershipRole.PLATFORM_ADMIN) {
      return true;
    }

    if (currentUserRole === MembershipRole.TENANT_OWNER) {
      return (
        member.role !== MembershipRole.PLATFORM_ADMIN &&
        member.role !== MembershipRole.TENANT_OWNER
      );
    }

    // For other roles, check if member's role is delegatable by us
    return canDelegate(currentUserRole, member.role);
  }, [
    canWrite,
    isPermissionsLoading,
    member,
    currentUserMembershipId,
    currentUserRole,
  ]);

  // ---------------------------------------------------------------------------
  // Derived Form State
  // ---------------------------------------------------------------------------

  const requiresOrgUnit = useMemo<boolean>(() => {
    if (!selectedRole) return false;
    return isOrgScopedRole(selectedRole);
  }, [selectedRole]);

  const isDirty = useMemo<boolean>(() => {
    if (!member) return false;
    if (!selectedRole) return false;

    // Check if role changed
    if (selectedRole !== member.role) return true;

    // Check if OrgUnit changed (for org-scoped roles)
    if (isOrgScopedRole(selectedRole) && selectedOrgUnitId !== member.orgUnitId) {
      return true;
    }

    return false;
  }, [member, selectedRole, selectedOrgUnitId]);

  const isFormValid = useMemo<boolean>(() => {
    if (!selectedRole) return false;
    if (!isDirty) return false;

    // Org-scoped roles require OrgUnit selection
    if (requiresOrgUnit && !selectedOrgUnitId) return false;

    // Tenant-level roles must not have OrgUnit
    if (isTenantLevelRole(selectedRole) && selectedOrgUnitId) return false;

    return true;
  }, [selectedRole, isDirty, requiresOrgUnit, selectedOrgUnitId]);

  // ---------------------------------------------------------------------------
  // Initialize Form State from Member
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (member && isOpen) {
      setSelectedRoleState(member.role);
      setSelectedOrgUnitIdState(member.orgUnitId);
      setReason('');
    }
  }, [member, isOpen]);

  // ---------------------------------------------------------------------------
  // Role Change Mutation
  // ---------------------------------------------------------------------------

  const roleChangeMutation = useMutation<Member, AppError, RoleChangeFormData>({
    mutationFn: data => changeMemberRole(effectiveMembershipId!, data),
    onSuccess: () => {
      // Show success toast
      showSuccessToast(t('member_role.change_success'));

      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: [MEMBER_DETAILS_QUERY_KEY, effectiveMembershipId],
      });
      queryClient.invalidateQueries({
        queryKey: [ROLE_CHANGE_HISTORY_QUERY_KEY, effectiveMembershipId],
      });
      queryClient.invalidateQueries({ queryKey: ['memberList'] });

      // Call success callback
      onRoleChangeSuccess?.();

      // Close modal
      onClose();
    },
    onError: (error: AppError) => {
      // Map error codes to i18n keys
      let errorKey = 'member_role.change_error';

      if (error.code === 'AUTH_DELEGATION_VIOLATION') {
        errorKey = 'member_role.delegation_error';
      } else if (error.code === 'AUTH_OUT_OF_SCOPE') {
        errorKey = 'member_role.scope_error';
      } else if (error.code === 'VALIDATION_ORGUNIT_REQUIRED') {
        errorKey = 'member_role.orgunit_required_error';
      } else if (error.code === 'AUTH_SELF_MODIFICATION') {
        errorKey = 'member_role.self_modification_error';
      }

      showErrorToast(t(errorKey));
    },
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const setSelectedRole = useCallback((role: MembershipRole) => {
    setSelectedRoleState(role);

    // Clear OrgUnit if switching to tenant-level role
    if (isTenantLevelRole(role)) {
      setSelectedOrgUnitIdState(null);
    }
  }, []);

  const setSelectedOrgUnitId = useCallback((orgUnitId: string | null) => {
    setSelectedOrgUnitIdState(orgUnitId);
  }, []);

  const resetForm = useCallback(() => {
    if (member) {
      setSelectedRoleState(member.role);
      setSelectedOrgUnitIdState(member.orgUnitId);
      setReason('');
    }
  }, [member]);

  const saveRoleChange = useCallback(async () => {
    if (!selectedRole || !isFormValid) return;

    await roleChangeMutation.mutateAsync({
      newRole: selectedRole,
      newOrgUnitId: requiresOrgUnit ? selectedOrgUnitId : null,
      reason: reason || undefined,
    });
  }, [
    selectedRole,
    isFormValid,
    requiresOrgUnit,
    selectedOrgUnitId,
    reason,
    roleChangeMutation,
  ]);

  const refetch = useCallback(() => {
    if (!initialMember && effectiveMembershipId) {
      refetchMember();
    }
    queryClient.invalidateQueries({
      queryKey: [ROLE_CHANGE_HISTORY_QUERY_KEY, effectiveMembershipId],
    });
  }, [initialMember, effectiveMembershipId, refetchMember, queryClient]);

  // ---------------------------------------------------------------------------
  // Return ViewModel
  // ---------------------------------------------------------------------------

  return {
    // Member Data
    member,
    isLoadingMember,
    memberError,

    // Role Change History
    changeHistory,
    isLoadingHistory,

    // Available Roles
    availableRoles,

    // Available OrgUnits
    availableOrgUnits,
    isLoadingOrgUnits,

    // Form State
    selectedRole,
    selectedOrgUnitId,
    reason,
    isDirty,
    requiresOrgUnit,
    isFormValid,

    // Permissions
    canEdit,

    // Mutation State
    isSaving: roleChangeMutation.isPending,
    saveError: roleChangeMutation.error ?? null,

    // Actions
    setSelectedRole,
    setSelectedOrgUnitId,
    setReason,
    resetForm,
    saveRoleChange,
    refetch,
  };
}

export default useMemberCardViewModel;
