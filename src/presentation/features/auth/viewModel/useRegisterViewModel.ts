'use client';

import { useMutation } from '@tanstack/react-query';
import type { RegisterFormData } from '../validation/registerSchema';

interface RegisterResponse {
  message: string;
}

async function registerRequest(data: RegisterFormData): Promise<RegisterResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      password: data.password,
      invitationToken: data.invitationToken,
    }),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Registration failed');
  }

  return (await res.json()) as RegisterResponse;
}

export function useRegisterViewModel() {
  const mutation = useMutation({
    mutationFn: registerRequest,
  });

  return {
    register: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  };
}
