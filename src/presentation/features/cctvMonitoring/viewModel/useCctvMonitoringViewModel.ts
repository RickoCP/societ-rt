'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CameraStatus = 'online' | 'offline' | 'recording';

export interface Camera {
  id: string;
  name: string;
  status: CameraStatus;
  location: string;
  streamUrl: string | null;
  lastSnapshot: string | null;
  latitude: number | null;
  longitude: number | null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchCameras(): Promise<Camera[]> {
  const res = await fetch('/api/security/cctv');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch cameras');
  }
  const json = (await res.json()) as { data: Camera[] };
  return json.data;
}

async function captureSnapshot(cameraId: string): Promise<{ snapshotUrl: string }> {
  const res = await fetch(`/api/security/cctv/${cameraId}/snapshot`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to capture snapshot');
  }
  return (await res.json()) as { snapshotUrl: string };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCctvMonitoringViewModel() {
  const queryClient = useQueryClient();

  const camerasQuery = useQuery({
    queryKey: ['cctv-cameras'],
    queryFn: fetchCameras,
    refetchInterval: 10000,
  });

  const snapshotMutation = useMutation({
    mutationFn: captureSnapshot,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cctv-cameras'] });
    },
  });

  return {
    cameras: camerasQuery.data ?? [],
    isLoading: camerasQuery.isLoading,
    isError: camerasQuery.isError,
    error: camerasQuery.error,
    captureSnapshot: snapshotMutation.mutate,
    isCapturing: snapshotMutation.isPending,
  };
}
