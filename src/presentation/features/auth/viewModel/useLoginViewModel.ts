'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { LoginFormData } from '../validation/loginSchema';

interface LoginResponse {
  message: string;
}

async function loginRequest(data: LoginFormData): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...data,
      tenantId: '00000000-0000-0000-0000-000000000010',
    }),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Login failed');
  }

  return (await res.json()) as LoginResponse;
}

export function useLoginViewModel() {
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: () => {
      router.push('/');
    },
  });

  return {
    login: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  };
}
