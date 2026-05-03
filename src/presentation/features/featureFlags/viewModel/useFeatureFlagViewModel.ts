'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface FeatureFlag {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  overriddenForTenant: boolean;
}

interface FeatureFlagListResponse {
  data: FeatureFlag[];
}

async function fetchFeatureFlags(): Promise<FeatureFlagListResponse> {
  const res = await fetch('/api/feature-flags');
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch feature flags');
  }
  return (await res.json()) as FeatureFlagListResponse;
}

async function toggleOverride(input: {
  flagKey: string;
  enabled: boolean;
  tenantId: string;
}): Promise<void> {
  const res = await fetch('/api/feature-flags/override', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to toggle feature flag');
  }
}

export function useFeatureFlagViewModel() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['feature-flags'],
    queryFn: fetchFeatureFlags,
  });

  const overrideMutation = useMutation({
    mutationFn: toggleOverride,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });

  return {
    flags: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    toggleOverride: overrideMutation.mutate,
    isToggling: overrideMutation.isPending,
  };
}
