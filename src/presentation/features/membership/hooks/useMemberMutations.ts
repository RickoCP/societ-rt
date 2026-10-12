'use client';

/**
 * Member mutation hooks — create (invite), update (role/status), delete, and
 * bulk operations, matching the `users`-table backend at /api/admin/members.
 *
 * All forward the PLATFORM_ADMIN-selected tenant via `?tenantId=` so
 * cross-tenant writes scope correctly. On success they invalidate the member
 * list query so the table refreshes.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  showSuccessToast,
  showErrorToast,
} from '@infrastructure/stateManagement/toastStore';
import { useSelectedAdminTenantId } from '@infrastructure/stateManagement';
import type { MembershipRole } from '@core/domains/membership/types/MembershipRole';
import type { MembershipStatus } from '@core/domains/membership/types/MembershipStatus';
import type { AppError } from '@core/utils';
import { MEMBER_LIST_QUERY_KEY } from '../viewModel/useMemberListViewModel';

function withTenant(path: string, tenantId: string | null): string {
  return tenantId ? `${path}?tenantId=${encodeURIComponent(tenantId)}` : path;
}

async function parseError(
  response: Response,
  fallbackCode: string,
): Promise<AppError> {
  const body = (await response.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    userMessage?: string;
  };
  return {
    type:
      response.status === 401
        ? 'authentication'
        : response.status === 403
          ? 'authorization'
          : response.status === 404
            ? 'not_found'
            : response.status === 409
              ? 'business'
              : 'technical',
    code: body.code ?? fallbackCode,
    message: body.message ?? `Request failed: ${response.status}`,
    userMessage: body.userMessage,
  };
}

// ---------------------------------------------------------------------------
// Create (invite)
// ---------------------------------------------------------------------------

export interface CreateMemberInput {
  name: string;
  email: string;
  role: MembershipRole;
}

export function useCreateMember() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId = useSelectedAdminTenantId();

  return useMutation<void, AppError, CreateMemberInput>({
    mutationFn: async (input: CreateMemberInput): Promise<void> => {
      const response = await fetch(withTenant('/api/admin/members', tenantId), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw await parseError(response, 'MEMBER_CREATE_FAILED');
      }
    },
    onSuccess: () => {
      showSuccessToast(t('member_list.invite_success', 'Member invited'));
      queryClient.invalidateQueries({ queryKey: [MEMBER_LIST_QUERY_KEY] });
    },
    onError: (error: AppError) => {
      showErrorToast(
        error.userMessage ??
          error.message ??
          t('member_list.invite_error', 'Failed to invite member'),
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Update (role and/or status)
// ---------------------------------------------------------------------------

export interface UpdateMemberInput {
  memberId: string;
  role?: MembershipRole;
  status?: MembershipStatus;
}

export function useUpdateMember() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId = useSelectedAdminTenantId();

  return useMutation<void, AppError, UpdateMemberInput>({
    mutationFn: async ({ memberId, role, status }: UpdateMemberInput): Promise<void> => {
      const response = await fetch(
        withTenant(`/api/admin/members/${memberId}`, tenantId),
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, status }),
        },
      );
      if (!response.ok) {
        throw await parseError(response, 'MEMBER_UPDATE_FAILED');
      }
    },
    onSuccess: () => {
      showSuccessToast(t('member_list.update_success', 'Member updated'));
      queryClient.invalidateQueries({ queryKey: [MEMBER_LIST_QUERY_KEY] });
    },
    onError: (error: AppError) => {
      showErrorToast(
        error.userMessage ??
          error.message ??
          t('member_list.update_error', 'Failed to update member'),
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Delete (soft)
// ---------------------------------------------------------------------------

export function useDeleteMember() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId = useSelectedAdminTenantId();

  return useMutation<void, AppError, string>({
    mutationFn: async (memberId: string): Promise<void> => {
      const response = await fetch(
        withTenant(`/api/admin/members/${memberId}`, tenantId),
        { method: 'DELETE', credentials: 'include' },
      );
      if (!response.ok) {
        throw await parseError(response, 'MEMBER_DELETE_FAILED');
      }
    },
    onSuccess: () => {
      showSuccessToast(t('member_list.delete_success', 'Member removed'));
      queryClient.invalidateQueries({ queryKey: [MEMBER_LIST_QUERY_KEY] });
    },
    onError: (error: AppError) => {
      showErrorToast(
        error.userMessage ??
          error.message ??
          t('member_list.delete_error', 'Failed to remove member'),
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------

export type BulkMemberAction = 'activate' | 'suspend' | 'revoke' | 'delete';

export interface BulkMemberInput {
  action: BulkMemberAction;
  memberIds: string[];
}

export function useBulkMember() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId = useSelectedAdminTenantId();

  return useMutation<{ updatedCount: number }, AppError, BulkMemberInput>({
    mutationFn: async (input: BulkMemberInput): Promise<{ updatedCount: number }> => {
      const response = await fetch(
        withTenant('/api/admin/members/bulk', tenantId),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      if (!response.ok) {
        throw await parseError(response, 'MEMBER_BULK_FAILED');
      }
      const json = (await response.json()) as { data?: { updatedCount?: number } };
      return { updatedCount: json.data?.updatedCount ?? 0 };
    },
    onSuccess: (result) => {
      showSuccessToast(
        t('member_list.bulk_success', '{{count}} member(s) updated', {
          count: result.updatedCount,
        }),
      );
      queryClient.invalidateQueries({ queryKey: [MEMBER_LIST_QUERY_KEY] });
    },
    onError: (error: AppError) => {
      showErrorToast(
        error.userMessage ??
          error.message ??
          t('member_list.bulk_error', 'Failed to perform bulk operation'),
      );
    },
  });
}
