'use client';

/**
 * useInvitationFormViewModel — ViewModel for the Member Invitation Form.
 *
 * Provides state and actions for:
 * - Email input with validation
 * - Role selection filtered by delegation matrix
 * - OrgUnit selection filtered by user scope
 * - Bulk email input (paste multiple, limit 50)
 * - Form submission with success/error handling
 *
 * This ViewModel follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * @see Requirements 3.1-3.12 (Member Invitation Flow)
 * @see Design Components > 3. Member Invitation Flow
 */

import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { usePermissions } from '@presentation/hooks/usePermissions';
import { useTranslation } from 'react-i18next';
import { showSuccessToast, showErrorToast } from '@infrastructure/stateManagement/toastStore';
import {
  MembershipRole,
  ALL_MEMBERSHIP_ROLES,
  isOrgScopedRole,
} from '@core/domains/membership/types/MembershipRole';
import { getDelegatableRolesFor } from '@core/domains/membership/services/DelegationMatrixService';
import type { OrgUnit } from '@core/domains/orgunit/entities/OrgUnit';
import type { AppError } from '@core/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of emails allowed in bulk invitation.
 * @see Requirements 3.12
 */
export const BULK_EMAIL_LIMIT = 50;

/**
 * Email regex pattern for client-side validation.
 * @see Requirements 3.7
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * React Query cache key for OrgUnit list queries.
 */
export const ORGUNITS_QUERY_KEY = 'invitationOrgUnits';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Form data for a single or bulk invitation.
 */
export interface InvitationFormData {
  readonly emails: string[];
  readonly role: MembershipRole;
  readonly orgUnitId: string | null;
}

/**
 * Email validation result.
 */
export interface EmailValidationResult {
  readonly valid: string[];
  readonly invalid: string[];
  readonly duplicates: string[];
}

/**
 * Return type of useInvitationFormViewModel hook.
 */
export interface InvitationFormViewModel {
  // ---------------------------------------------------------------------------
  // Form State
  // ---------------------------------------------------------------------------

  /**
   * Raw email input string (supports multiple emails).
   */
  emailInput: string;

  /**
   * Parsed and validated emails.
   */
  parsedEmails: EmailValidationResult;

  /**
   * Whether email input has validation errors.
   */
  hasEmailErrors: boolean;

  /**
   * Whether bulk limit is exceeded (>50 emails).
   */
  isBulkLimitExceeded: boolean;

  /**
   * Selected role for the invitation.
   */
  selectedRole: MembershipRole | null;

  /**
   * Selected OrgUnit ID (null for tenant-level roles).
   */
  selectedOrgUnitId: string | null;

  /**
   * Whether OrgUnit selection is required for the selected role.
   */
  isOrgUnitRequired: boolean;

  /**
   * Whether OrgUnit field should be visible (hidden for tenant-level roles).
   */
  showOrgUnitField: boolean;

  // ---------------------------------------------------------------------------
  // Dropdown Options
  // ---------------------------------------------------------------------------

  /**
   * Roles available for selection (filtered by delegation matrix).
   */
  availableRoles: MembershipRole[];

  /**
   * OrgUnits available for selection (filtered by user scope).
   */
  availableOrgUnits: OrgUnit[];

  /**
   * Whether OrgUnits are being loaded.
   */
  isOrgUnitsLoading: boolean;

  // ---------------------------------------------------------------------------
  // Submission State
  // ---------------------------------------------------------------------------

  /**
   * Whether form is currently being submitted.
   */
  isSubmitting: boolean;

  /**
   * Whether form is valid and can be submitted.
   */
  canSubmit: boolean;

  /**
   * Whether the modal/drawer is open.
   */
  isOpen: boolean;

  // ---------------------------------------------------------------------------
  // Permission State
  // ---------------------------------------------------------------------------

  /**
   * Whether user has membership:delegate permission.
   */
  canDelegate: boolean;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Open the invitation form modal/drawer.
   */
  open: () => void;

  /**
   * Close the invitation form modal/drawer.
   */
  close: () => void;

  /**
   * Set the email input value.
   * @param value - Raw email input string
   */
  setEmailInput: (value: string) => void;

  /**
   * Set the selected role.
   * @param role - Selected MembershipRole
   */
  setSelectedRole: (role: MembershipRole) => void;

  /**
   * Set the selected OrgUnit ID.
   * @param orgUnitId - Selected OrgUnit ID
   */
  setSelectedOrgUnitId: (orgUnitId: string | null) => void;

  /**
   * Submit the invitation form.
   */
  submit: () => Promise<void>;

  /**
   * Reset the form to initial state.
   */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Parse bulk email input and separate valid/invalid/duplicate emails.
 *
 * Supports emails separated by:
 * - Newlines
 * - Commas
 * - Semicolons
 *
 * @param input - Raw email input string
 * @returns EmailValidationResult with valid, invalid, and duplicate arrays
 */
export function parseBulkEmails(input: string): EmailValidationResult {
  const lines = input
    .split(/[\n,;]/)
    .map(s => s.trim())
    .filter(Boolean);

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const line of lines) {
    const email = line.toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
      invalid.push(line);
      continue;
    }

    if (seen.has(email)) {
      duplicates.push(line);
      continue;
    }

    seen.add(email);
    valid.push(email);
  }

  return { valid, invalid, duplicates };
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch OrgUnits available for the current user's scope.
 */
async function fetchAvailableOrgUnits(): Promise<OrgUnit[]> {
  const response = await fetch('/api/admin/orgunits', {
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401) {
      return [];
    }
    throw new Error(`Failed to fetch OrgUnits: ${response.status}`);
  }

  const json = (await response.json()) as { data?: OrgUnit[] };
  return json.data ?? [];
}

/**
 * Submit invitation request to the API.
 */
async function submitInvitation(
  data: InvitationFormData,
): Promise<{ success: boolean; message?: string }> {
  const response = await fetch('/api/admin/members/invite', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const json = (await response.json()) as {
    success?: boolean;
    message?: string;
    code?: string;
  };

  if (!response.ok) {
    const error: AppError = {
      type:
        response.status === 401
          ? 'authentication'
          : response.status === 403
            ? 'authorization'
            : response.status === 409
              ? 'business'
              : 'technical',
      code: json.code ?? 'INVITATION_ERROR',
      message: json.message ?? `Failed to send invitation: ${response.status}`,
    };
    throw error;
  }

  return { success: true, message: json.message };
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useInvitationFormViewModel — React hook for the Member Invitation Form.
 *
 * @returns InvitationFormViewModel with state and actions
 *
 * @example
 * ```tsx
 * const vm = useInvitationFormViewModel();
 *
 * return (
 *   <InvitationForm
 *     isOpen={vm.isOpen}
 *     emailInput={vm.emailInput}
 *     onEmailChange={vm.setEmailInput}
 *     parsedEmails={vm.parsedEmails}
 *     availableRoles={vm.availableRoles}
 *     selectedRole={vm.selectedRole}
 *     onRoleChange={vm.setSelectedRole}
 *     availableOrgUnits={vm.availableOrgUnits}
 *     selectedOrgUnitId={vm.selectedOrgUnitId}
 *     onOrgUnitChange={vm.setSelectedOrgUnitId}
 *     isSubmitting={vm.isSubmitting}
 *     canSubmit={vm.canSubmit}
 *     onSubmit={vm.submit}
 *     onClose={vm.close}
 *   />
 * );
 * ```
 */
export function useInvitationFormViewModel(): InvitationFormViewModel {
  const { t } = useTranslation();

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  const { hasPermission, userContext, isLoading: isPermissionsLoading } = usePermissions();

  const canDelegate = hasPermission('membership:delegate');
  const currentRole = userContext?.role as MembershipRole | undefined;
  const currentOrgUnitId = userContext?.orgUnitId ?? null;

  // ---------------------------------------------------------------------------
  // Modal State
  // ---------------------------------------------------------------------------

  const [isOpen, setIsOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Form State
  // ---------------------------------------------------------------------------

  const [emailInput, setEmailInputState] = useState('');
  const [selectedRole, setSelectedRoleState] = useState<MembershipRole | null>(null);
  const [selectedOrgUnitId, setSelectedOrgUnitIdState] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived Email State
  // ---------------------------------------------------------------------------

  const parsedEmails = useMemo(() => parseBulkEmails(emailInput), [emailInput]);

  const hasEmailErrors = parsedEmails.invalid.length > 0;
  const isBulkLimitExceeded = parsedEmails.valid.length > BULK_EMAIL_LIMIT;

  // ---------------------------------------------------------------------------
  // Available Roles (filtered by delegation matrix)
  // ---------------------------------------------------------------------------

  const availableRoles = useMemo(() => {
    if (!currentRole) return [];

    // Get delegatable roles for the current user's role
    const delegatable = getDelegatableRolesFor(currentRole as MembershipRole);

    // Return as array (already filtered by delegation matrix)
    return delegatable as MembershipRole[];
  }, [currentRole]);

  // ---------------------------------------------------------------------------
  // OrgUnit Field Logic
  // ---------------------------------------------------------------------------

  const isOrgUnitRequired = useMemo(() => {
    if (!selectedRole) return false;
    return isOrgScopedRole(selectedRole);
  }, [selectedRole]);

  const showOrgUnitField = useMemo(() => {
    // Show OrgUnit field if role is org-scoped
    if (!selectedRole) return true; // Show by default until role is selected
    return isOrgScopedRole(selectedRole);
  }, [selectedRole]);

  // ---------------------------------------------------------------------------
  // Fetch OrgUnits
  // ---------------------------------------------------------------------------

  const {
    data: orgUnitsData,
    isLoading: isOrgUnitsLoading,
  } = useQuery<OrgUnit[]>({
    queryKey: [ORGUNITS_QUERY_KEY],
    queryFn: fetchAvailableOrgUnits,
    enabled: isOpen && canDelegate && !isPermissionsLoading,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  const availableOrgUnits = orgUnitsData ?? [];

  // ---------------------------------------------------------------------------
  // Pre-select current OrgUnit for org-scoped admins
  // ---------------------------------------------------------------------------

  // Effect to pre-select OrgUnit when form opens
  const handleOpen = useCallback(() => {
    setIsOpen(true);
    // Pre-select current OrgUnit for org-scoped admins
    // @see Requirements 3.6
    if (currentOrgUnitId && currentRole && isOrgScopedRole(currentRole as MembershipRole)) {
      setSelectedOrgUnitIdState(currentOrgUnitId);
    }
  }, [currentOrgUnitId, currentRole]);

  // ---------------------------------------------------------------------------
  // Invitation Mutation
  // ---------------------------------------------------------------------------

  const inviteMutation = useMutation({
    mutationFn: submitInvitation,
    onSuccess: () => {
      // Show success toast
      // @see Requirements 3.9
      showSuccessToast(t('invitation.sent_success'));
      // Close form and reset
      setIsOpen(false);
      resetForm();
    },
    onError: (error: AppError) => {
      // Handle specific error codes
      // @see Requirements 3.10, 3.11
      if (error.code === 'INVITATION_DUPLICATE_EMAIL') {
        showErrorToast(t('invitation.duplicate_email'));
      } else {
        showErrorToast(t('invitation.send_error'));
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Form Validation
  // ---------------------------------------------------------------------------

  const canSubmit = useMemo(() => {
    // Must have at least one valid email
    if (parsedEmails.valid.length === 0) return false;

    // Must not exceed bulk limit
    if (isBulkLimitExceeded) return false;

    // Must have a selected role
    if (!selectedRole) return false;

    // If role is org-scoped, must have OrgUnit selected
    if (isOrgUnitRequired && !selectedOrgUnitId) return false;

    // Must not be currently submitting
    if (inviteMutation.isPending) return false;

    return true;
  }, [
    parsedEmails.valid.length,
    isBulkLimitExceeded,
    selectedRole,
    isOrgUnitRequired,
    selectedOrgUnitId,
    inviteMutation.isPending,
  ]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const resetForm = useCallback(() => {
    setEmailInputState('');
    setSelectedRoleState(null);
    setSelectedOrgUnitIdState(null);
  }, []);

  const setEmailInput = useCallback((value: string) => {
    setEmailInputState(value);
  }, []);

  const setSelectedRole = useCallback(
    (role: MembershipRole) => {
      setSelectedRoleState(role);

      // Clear OrgUnit if switching to tenant-level role
      if (!isOrgScopedRole(role)) {
        setSelectedOrgUnitIdState(null);
      } else if (currentOrgUnitId && isOrgScopedRole(currentRole as MembershipRole)) {
        // Pre-select current OrgUnit for org-scoped admins
        setSelectedOrgUnitIdState(currentOrgUnitId);
      }
    },
    [currentOrgUnitId, currentRole],
  );

  const setSelectedOrgUnitId = useCallback((orgUnitId: string | null) => {
    setSelectedOrgUnitIdState(orgUnitId);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    resetForm();
  }, [resetForm]);

  const submit = useCallback(async () => {
    if (!canSubmit || !selectedRole) return;

    const formData: InvitationFormData = {
      emails: parsedEmails.valid,
      role: selectedRole,
      orgUnitId: isOrgUnitRequired ? selectedOrgUnitId : null,
    };

    await inviteMutation.mutateAsync(formData);
  }, [canSubmit, selectedRole, parsedEmails.valid, isOrgUnitRequired, selectedOrgUnitId, inviteMutation]);

  // ---------------------------------------------------------------------------
  // Return ViewModel
  // ---------------------------------------------------------------------------

  return {
    // Form State
    emailInput,
    parsedEmails,
    hasEmailErrors,
    isBulkLimitExceeded,
    selectedRole,
    selectedOrgUnitId,
    isOrgUnitRequired,
    showOrgUnitField,

    // Dropdown Options
    availableRoles,
    availableOrgUnits,
    isOrgUnitsLoading,

    // Submission State
    isSubmitting: inviteMutation.isPending,
    canSubmit,
    isOpen,

    // Permissions
    canDelegate,

    // Actions
    open: handleOpen,
    close,
    setEmailInput,
    setSelectedRole,
    setSelectedOrgUnitId,
    submit,
    reset: resetForm,
  };
}

export default useInvitationFormViewModel;
