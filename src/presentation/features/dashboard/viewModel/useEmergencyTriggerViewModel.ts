'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

interface TriggerParams {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Posts a new emergency alert to the shared /api/emergency endpoint.
 *
 * Kept separate from the full EmergencyViewModel so surfaces that only need to
 * raise an alert (e.g. the mobile dashboard SOS button) don't also pull in the
 * alert list query, status mutation, etc.
 */
async function triggerAlertRequest(params: TriggerParams): Promise<void> {
  const res = await fetch('/api/emergency', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal mengirim peringatan darurat');
  }
}

/**
 * Resolves the current geolocation with a short timeout, falling back to null
 * coordinates when unavailable or denied so the alert still goes through.
 */
function resolveCoordinates(): Promise<TriggerParams> {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) {
      resolve({ latitude: null, longitude: null });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      () => resolve({ latitude: null, longitude: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}

export function useEmergencyTriggerViewModel() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const coords = await resolveCoordinates();
      await triggerAlertRequest(coords);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['emergencies'] });
    },
  });

  return {
    trigger: mutation.mutate,
    isTriggering: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  };
}
