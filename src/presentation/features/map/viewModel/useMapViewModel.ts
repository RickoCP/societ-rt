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
  data: MapMarkerData[];
  total: number;
}

async function fetchMapMarkers(filters: {
  block?: string;
  status?: string;
  category?: string;
}): Promise<MapMarkersResponse> {
  const params = new URLSearchParams();
  if (filters.block) params.set('block', filters.block);
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);

  const res = await fetch(`/api/map?${params.toString()}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch map markers');
  }

  return (await res.json()) as MapMarkersResponse;
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
