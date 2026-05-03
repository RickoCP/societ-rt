'use client';

import { useQuery } from '@tanstack/react-query';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  details: string;
  createdAt: string;
}

interface AuditLogResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchAuditLog(
  page: number,
  filters?: { action?: string; entityType?: string },
): Promise<AuditLogResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (filters?.action) params.set('action', filters.action);
  if (filters?.entityType) params.set('entityType', filters.entityType);

  const res = await fetch(`/api/audit?${params.toString()}`);
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch audit log');
  }
  return (await res.json()) as AuditLogResponse;
}

export function useAuditLogViewModel(
  page = 1,
  filters?: { action?: string; entityType?: string },
) {
  const query = useQuery({
    queryKey: ['audit-log', page, filters],
    queryFn: () => fetchAuditLog(page, filters),
  });

  return {
    entries: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
