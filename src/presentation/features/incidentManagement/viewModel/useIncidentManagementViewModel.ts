'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentCategory = 'theft' | 'vandalism' | 'fire' | 'intrusion' | 'accident' | 'other';

export interface Incident {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  category: IncidentCategory;
  location: string;
  latitude: number | null;
  longitude: number | null;
  reportedBy: string;
  assignedTo: string | null;
  evidenceUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IncidentStatusEntry {
  id: string;
  status: IncidentStatus;
  notes: string;
  updatedBy: string;
  createdAt: string;
}

export interface IncidentFilters {
  status: IncidentStatus | '';
  severity: IncidentSeverity | '';
  category: IncidentCategory | '';
}

interface IncidentListResponse {
  data: Incident[];
  total: number;
  page: number;
  totalPages: number;
}

interface CreateIncidentInput {
  title: string;
  description: string;
  severity: IncidentSeverity;
  category: IncidentCategory;
  location: string;
  latitude?: number;
  longitude?: number;
}

interface UpdateStatusInput {
  incidentId: string;
  status: IncidentStatus;
  notes: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchIncidents(
  page: number,
  filters: IncidentFilters,
): Promise<IncidentListResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.status) params.set('status', filters.status);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.category) params.set('category', filters.category);

  const res = await fetch(`/api/security/incidents?${params.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch incidents');
  }
  return (await res.json()) as IncidentListResponse;
}

async function fetchIncidentDetail(id: string): Promise<Incident> {
  const res = await fetch(`/api/security/incidents/${id}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch incident detail');
  }
  const json = (await res.json()) as { data: Incident };
  return json.data;
}

async function fetchIncidentTimeline(id: string): Promise<IncidentStatusEntry[]> {
  const res = await fetch(`/api/security/incidents/${id}/timeline`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch timeline');
  }
  const json = (await res.json()) as { data: IncidentStatusEntry[] };
  return json.data;
}

async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const res = await fetch('/api/security/incidents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to create incident');
  }
  const json = (await res.json()) as { data: Incident };
  return json.data;
}

async function updateIncidentStatus(input: UpdateStatusInput): Promise<void> {
  const res = await fetch(`/api/security/incidents/${input.incidentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: input.status, notes: input.notes }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to update status');
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIncidentManagementViewModel() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<IncidentFilters>({
    status: '',
    severity: '',
    category: '',
  });
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['incidents', page, filters],
    queryFn: () => fetchIncidents(page, filters),
  });

  const detailQuery = useQuery({
    queryKey: ['incident-detail', selectedIncidentId],
    queryFn: () => fetchIncidentDetail(selectedIncidentId!),
    enabled: !!selectedIncidentId,
  });

  const timelineQuery = useQuery({
    queryKey: ['incident-timeline', selectedIncidentId],
    queryFn: () => fetchIncidentTimeline(selectedIncidentId!),
    enabled: !!selectedIncidentId,
  });

  const createMutation = useMutation({
    mutationFn: createIncident,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: updateIncidentStatus,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      await queryClient.invalidateQueries({ queryKey: ['incident-detail', selectedIncidentId] });
      await queryClient.invalidateQueries({ queryKey: ['incident-timeline', selectedIncidentId] });
    },
  });

  const updateFilters = useCallback((newFilters: Partial<IncidentFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPage(1);
  }, []);

  return {
    // List
    incidents: listQuery.data?.data ?? [],
    total: listQuery.data?.total ?? 0,
    totalPages: listQuery.data?.totalPages ?? 1,
    page,
    setPage,
    filters,
    updateFilters,
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    error: listQuery.error,

    // Detail
    selectedIncidentId,
    setSelectedIncidentId,
    incidentDetail: detailQuery.data ?? null,
    isLoadingDetail: detailQuery.isLoading,
    timeline: timelineQuery.data ?? [],

    // Create
    createIncident: createMutation.mutate,
    isCreating: createMutation.isPending,
    createError: createMutation.error,

    // Update status
    updateStatus: updateStatusMutation.mutate,
    isUpdatingStatus: updateStatusMutation.isPending,
    updateStatusError: updateStatusMutation.error,
  };
}
