'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface MapMarkerData {
  id: string;
  lat: number;
  lng: number;
  householdNumber: string;
  address: string;
  headOfHousehold: string;
  residentCount: number;
  block: string;
  status: string;
  categories: string[];
}

interface MapMarkersResponse {
  data: Array<{
    householdId: string;
    householdNumber: string;
    address: string;
    block: string;
    latitude: number | null;
    longitude: number | null;
    residentCount: number;
    headOfHousehold: string;
  }>;
}

async function fetchMapMarkers(filters: {
  block?: string;
  status?: string;
  category?: string;
}): Promise<{ data: MapMarkerData[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.block) params.set('block', filters.block);
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('categories', filters.category);

  const res = await fetch(`/api/map?${params.toString()}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch map markers');
  }

  const json = (await res.json()) as MapMarkersResponse;
  const mapped = json.data
    .filter(m => m.latitude != null && m.longitude != null)
    .map(m => ({
      id: m.householdId,
      lat: m.latitude!,
      lng: m.longitude!,
      householdNumber: m.householdNumber,
      address: m.address,
      headOfHousehold: m.headOfHousehold ?? '-',
      residentCount: m.residentCount ?? 0,
      block: m.block ?? '',
      status: 'active',
      categories: [],
    }));

  return { data: mapped, total: mapped.length };
}

export function useMapViewModel() {
  const [blockFilter, setBlockFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const query = useQuery({
    queryKey: ['mapMarkers', blockFilter, statusFilter, categoryFilter],
    queryFn: () =>
      fetchMapMarkers({
        block: blockFilter || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
      }),
  });

  return {
    markers: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    blockFilter,
    setBlockFilter,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    refetch: query.refetch,
  };
}
