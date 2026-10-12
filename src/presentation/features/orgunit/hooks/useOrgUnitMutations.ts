'use client';

/**
 * useCreateOrgUnit / useUpdateOrgUnit — React Query mutation hooks for OrgUnit
 * create and edit, mirroring the useDeleteOrgUnit pattern.
 *
 * Both forward the PLATFORM_ADMIN-selected tenant via `?tenantId=` so
 * cross-tenant writes are scoped correctly (honored server-side for platform
 * admins only). On success they invalidate the tree query so the UI refreshes.
 *
 * @see Requirements 8.4 (Create), 8.7-8.8 (Edit — name only)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  showSuccessToast,
  showErrorToast,
} from '@infrastructure/stateManagement/toastStore';
import { useSelectedAdminTenantId } from '@infrastructure/stateManagement';
import type { OrgUnitType } from '@core/domains/orgunit/types';
import type { AppError } from '@core/utils';
import { ORGUNIT_TREE_QUERY_KEY } from '../viewModel/useOrgUnitTreeViewModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
            : 'technical',
    code: body.code ?? fallbackCode,
    message: body.message ?? `Request failed: ${response.status}`,
    userMessage: body.userMessage,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateOrgUnitInput {
  parentId: string;
  name: string;
  type: OrgUnitType;
}

export function useCreateOrgUnit() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId = useSelectedAdminTenantId();

  return useMutation<void, AppError, CreateOrgUnitInput>({
    mutationFn: async (input: CreateOrgUnitInput): Promise<void> => {
      const response = await fetch(withTenant('/api/admin/orgunit', tenantId), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw await parseError(response, 'ORGUNIT_CREATE_FAILED');
      }
    },
    onSuccess: () => {
      showSuccessToast(t('orgunit.create_success', 'Organization unit created'));
      queryClient.invalidateQueries({ queryKey: [ORGUNIT_TREE_QUERY_KEY] });
    },
    onError: (error: AppError) => {
      showErrorToast(
        error.userMessage ??
          error.message ??
          t('orgunit.create_error', 'Failed to create organization unit'),
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Update (name only)
// ---------------------------------------------------------------------------

export interface UpdateOrgUnitInput {
  orgUnitId: string;
  name: string;
}

export function useUpdateOrgUnit() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId = useSelectedAdminTenantId();

  return useMutation<void, AppError, UpdateOrgUnitInput>({
    mutationFn: async ({ orgUnitId, name }: UpdateOrgUnitInput): Promise<void> => {
      const response = await fetch(
        withTenant(`/api/admin/orgunit/${orgUnitId}`, tenantId),
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        },
      );
      if (!response.ok) {
        throw await parseError(response, 'ORGUNIT_UPDATE_FAILED');
      }
    },
    onSuccess: () => {
      showSuccessToast(t('orgunit.update_success', 'Organization unit updated'));
      queryClient.invalidateQueries({ queryKey: [ORGUNIT_TREE_QUERY_KEY] });
    },
    onError: (error: AppError) => {
      showErrorToast(
        error.userMessage ??
          error.message ??
          t('orgunit.update_error', 'Failed to update organization unit'),
      );
    },
  });
}
