'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { getTenantSubdomain } from '@presentation/utils/getTenantSubdomain';
import type { RegisterFormData } from '../validation/registerSchema';

interface RegisterResponse {
  data: { userId: string; name: string; email: string; role: string };
}

interface TenantResolveResponse {
  data: { id: string; name: string; subdomain: string };
}

async function resolveTenant(subdomain: string): Promise<TenantResolveResponse> {
  const res = await fetch(`/api/tenants/resolve?subdomain=${encodeURIComponent(subdomain)}`);
  if (!res.ok) throw new Error('Tenant not found');
  return (await res.json()) as TenantResolveResponse;
}

async function registerRequest(
  data: RegisterFormData & { tenantId: string; consentVersion: string },
): Promise<RegisterResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      password: data.password,
      invitationToken: data.invitationToken,
      consentVersion: data.consentVersion,
      tenantId: data.tenantId,
    }),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Registration failed');
  }

  return (await res.json()) as RegisterResponse;
}

export function useRegisterViewModel() {
  const subdomain = getTenantSubdomain();

  const tenantQuery = useQuery({
    queryKey: ['tenant-resolve', subdomain],
    queryFn: () => resolveTenant(subdomain),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (data: RegisterFormData) => {
      const tenantId = tenantQuery.data?.data.id;
      if (!tenantId) throw new Error('Tenant not resolved');
      return registerRequest({
        ...data,
        tenantId,
        consentVersion: '1.0',
      });
    },
  });

  return {
    register: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    tenantName: tenantQuery.data?.data.name,
    tenantLoading: tenantQuery.isLoading,
  };
}
