'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@components/atoms/Button';
import { FormField } from '@components/molecules/FormField';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { loginSchema, type LoginFormData } from '../validation/loginSchema';
import { useLoginViewModel } from '../viewModel/useLoginViewModel';

export function LoginScreen() {
  const { login, isPending, isError, error } = useLoginViewModel();

  const methods = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = methods.handleSubmit(data => {
    login(data);
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Login
        </h2>

        {isError && (
          <ErrorMessage
            message={error?.message ?? 'An error occurred during login'}
          />
        )}

        <FormField
          name="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          required
        />

        <FormField
          name="password"
          label="Password"
          type="password"
          placeholder="Enter your password"
          required
        />

        <Button type="submit" loading={isPending} className="w-full">
          Sign In
        </Button>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Don&apos;t have an account?{' '}
          <a
            href="/register"
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
            Register
          </a>
        </p>
      </form>
    </FormProvider>
  );
}
