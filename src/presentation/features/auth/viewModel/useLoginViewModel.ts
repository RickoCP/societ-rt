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

export type LoginInput = LoginFormData & { subdomain?: string };

export function useLoginViewModel() {
  const router = useRouter();
  const hostSubdomain = getTenantSubdomain();

  const tenantQuery = useQuery({
    queryKey: ['tenant-resolve', hostSubdomain],
    queryFn: () => resolveTenant(hostSubdomain),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async ({ subdomain, ...credentials }: LoginInput) => {
      // Subdomain efektif: override dari pemanggil (mis. pilihan akun demo)
      // atau fallback ke subdomain yang di-resolve dari host.
      const effectiveSubdomain = subdomain ?? hostSubdomain;

      // Jika subdomain sama dengan host dan sudah ter-resolve, gunakan cache.
      // Jika berbeda (override), resolve ulang secara on-demand.
      const tenantId =
        effectiveSubdomain === hostSubdomain
          ? tenantQuery.data?.data.id
          : (await resolveTenant(effectiveSubdomain)).data.id;

      if (!tenantId) throw new Error('Tenant not resolved');
      return loginRequest({ ...credentials, tenantId });
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
