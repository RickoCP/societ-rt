'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@components/atoms/Button';
import { FormField } from '@components/molecules/FormField';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import {
  registerSchema,
  type RegisterFormData,
} from '../validation/registerSchema';
import { useRegisterViewModel } from '../viewModel/useRegisterViewModel';

export function RegisterScreen() {
  const { register, isPending, isError, error, isSuccess } =
    useRegisterViewModel();

  const methods = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      invitationToken: '',
    },
  });

  const onSubmit = methods.handleSubmit(data => {
    register(data);
  });

  if (isSuccess) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-green-700 dark:text-green-400">
          Registration Successful
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          You can now{' '}
          <a
            href="/login"
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
            login
          </a>{' '}
          with your credentials.
        </p>
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Register
        </h2>

        {isError && (
          <ErrorMessage
            message={error?.message ?? 'An error occurred during registration'}
          />
        )}

        <FormField name="name" label="Full Name" placeholder="Your name" required />

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
          placeholder="Min. 8 characters"
          required
        />

        <FormField
          name="confirmPassword"
          label="Confirm Password"
          type="password"
          placeholder="Repeat your password"
          required
        />

        <FormField
          name="invitationToken"
          label="Invitation Token"
          placeholder="Paste your invitation token"
          required
        />

        <Button type="submit" loading={isPending} className="w-full">
          Create Account
        </Button>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <a
            href="/login"
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
            Login
          </a>
        </p>
      </form>
    </FormProvider>
  );
}
