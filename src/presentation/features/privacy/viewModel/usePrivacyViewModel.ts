'use client';

import { useMutation } from '@tanstack/react-query';

async function requestDataExport(): Promise<{ downloadUrl: string }> {
  const res = await fetch('/api/privacy/export', { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to request data export');
  }
  return (await res.json()) as { downloadUrl: string };
}

async function requestDataDeletion(): Promise<{ requestId: string }> {
  const res = await fetch('/api/privacy/deletion', { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to request data deletion');
  }
  return (await res.json()) as { requestId: string };
}

async function updateConsent(consent: {
  analytics: boolean;
  marketing: boolean;
}): Promise<void> {
  const res = await fetch('/api/privacy/consent', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(consent),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to update consent');
  }
}

export function usePrivacyViewModel() {
  const exportMutation = useMutation({ mutationFn: requestDataExport });
  const deletionMutation = useMutation({ mutationFn: requestDataDeletion });
  const consentMutation = useMutation({ mutationFn: updateConsent });

  return {
    requestExport: exportMutation.mutate,
    isExporting: exportMutation.isPending,
    exportData: exportMutation.data ?? null,
    exportError: exportMutation.error,

    requestDeletion: deletionMutation.mutate,
    isDeleting: deletionMutation.isPending,
    deletionData: deletionMutation.data ?? null,
    deletionError: deletionMutation.error,

    updateConsent: consentMutation.mutate,
    isUpdatingConsent: consentMutation.isPending,
    consentError: consentMutation.error,
    consentSuccess: consentMutation.isSuccess,
  };
}
