'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  rtRwNumber: string;
  region: string;
  sirenDeviceId: string | null;
  createdAt: string;
}

interface TenantListResponse {
  data: Tenant[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchTenants(page: number): Promise<TenantListResponse> {
  const res = await fetch(`/api/tenants?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch tenants');
  }

  return (await res.json()) as TenantListResponse;
}

interface UpdateSirenParams {
  tenantId: string;
  sirenDeviceId: string | null;
}

async function updateSirenRequest({
  tenantId,
  sirenDeviceId,
}: UpdateSirenParams): Promise<void> {
  const res = await fetch(`/api/tenants/${tenantId}/siren`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sirenDeviceId }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal menyimpan device id sirine');
  }
}

export interface SirenImportSummary {
  updatedCount: number;
  clearedCount: number;
  skippedRows: Array<{ row: number; reason: string }>;
}

async function importSirenCsvRequest(file: File): Promise<SirenImportSummary> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/tenants/siren/import', {
    method: 'POST',
    body: formData,
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: SirenImportSummary;
    message?: string;
  };

  if (!res.ok || !json.data) {
    throw new Error(json.message ?? 'Gagal mengimpor CSV device id sirine');
  }

  return json.data;
}

export function useTenantListViewModel(page = 1) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['tenants', page],
    queryFn: () => fetchTenants(page),
  });

  const sirenMutation = useMutation({
    mutationFn: updateSirenRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  const importMutation = useMutation({
    mutationFn: importSirenCsvRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  return {
    tenants: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? 1,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    // Per-tenant siren device management
    updateSirenDevice: sirenMutation.mutateAsync,
    isSavingSiren: sirenMutation.isPending,
    // Bulk CSV import (Excel) of siren device ids
    importSirenCsv: importMutation.mutateAsync,
    isImportingSiren: importMutation.isPending,
    // URL to download the CSV export / template
    sirenExportUrl: '/api/tenants/siren/export',
  };
}
