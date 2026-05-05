'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getTenantSubdomain } from '@presentation/utils/getTenantSubdomain';
import type { LoginFormData } from '../validation/loginSchema';

interface LoginResponse {
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

async function loginRequest(data: LoginFormData & { tenantId: string }): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Login failed');
  }

  return (await res.json()) as LoginResponse;
}

export function useLoginViewModel() {
  const router = useRouter();
  const subdomain = getTenantSubdomain();

  const tenantQuery = useQuery({
    queryKey: ['tenant-resolve', subdomain],
    queryFn: () => resolveTenant(subdomain),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (data: LoginFormData) => {
      const tenantId = tenantQuery.data?.data.id;
      if (!tenantId) throw new Error('Tenant not resolved');
      return loginRequest({ ...data, tenantId });
    },
    onSuccess: (response) => {
      const role = response.data.role;
      switch (role) {
        case 'Super_Admin':
          router.push('/admin');
          break;
        case 'Ketua_RT':
          router.push('/');
          break;
        case 'Pengurus':
          router.push('/residents');
          break;
        case 'Warga':
          router.push('/announcements');
          break;
        case 'Security_Guard':
          router.push('/visitors');
          break;
        default:
          router.push('/');
      }
    },
  });

  return {
    login: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    tenantName: tenantQuery.data?.data.name,
    tenantLoading: tenantQuery.isLoading,
    tenantError: tenantQuery.isError,
  };
}
