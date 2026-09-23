'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@components/atoms/Button';
import { FormField } from '@components/molecules/FormField';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { loginSchema, type LoginFormData } from '../validation/loginSchema';
import { useLoginViewModel } from '../viewModel/useLoginViewModel';

const DEMO_PASSWORD = 'Admin@123456';

const DEMO_ACCOUNTS: ReadonlyArray<{
  tenant: string;
  role: string;
  email: string;
  subdomain: string;
}> = [
  { tenant: 'Platform', role: 'Super Admin', email: 'admin@societ-rt.com', subdomain: 'platform' },
  { tenant: 'Platform', role: 'Super Admin', email: 'superadmin@societ.app', subdomain: 'platform' },
  { tenant: 'Platform', role: 'Operator', email: 'operator@societ.app', subdomain: 'platform' },
  { tenant: 'RT 01', role: 'Ketua RT', email: 'ketua@rt01.societ.app', subdomain: 'rt01' },
  { tenant: 'RT 01', role: 'Sekretaris', email: 'sekretaris@rt01.societ.app', subdomain: 'rt01' },
  { tenant: 'RT 01', role: 'Bendahara', email: 'bendahara@rt01.societ.app', subdomain: 'rt01' },
  { tenant: 'RT 01', role: 'Warga', email: 'ahmad@rt01.societ.app', subdomain: 'rt01' },
  { tenant: 'RT 01', role: 'Warga', email: 'warga2@rt01.societ.app', subdomain: 'rt01' },
  { tenant: 'RT 01', role: 'Satpam', email: 'satpam@rt01.societ.app', subdomain: 'rt01' },
  { tenant: 'RT 01', role: 'Satpam', email: 'satpam2@rt01.societ.app', subdomain: 'rt01' },
  { tenant: 'RT 02', role: 'Ketua RT', email: 'ketua@rt02.societ.app', subdomain: 'rt02' },
  { tenant: 'RT 02', role: 'Bendahara', email: 'bendahara@rt02.societ.app', subdomain: 'rt02' },
  { tenant: 'RT 02', role: 'Sekretaris', email: 'sekretaris@rt02.societ.app', subdomain: 'rt02' },
  { tenant: 'RT 02', role: 'Warga', email: 'rizki@rt02.societ.app', subdomain: 'rt02' },
  { tenant: 'RT 02', role: 'Warga', email: 'warga2@rt02.societ.app', subdomain: 'rt02' },
  { tenant: 'RT 02', role: 'Satpam', email: 'satpam@rt02.societ.app', subdomain: 'rt02' },
];

export function LoginScreen() {
  const { login, isPending, isError, error } = useLoginViewModel();

  const methods = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = methods.handleSubmit(data => {
    // Login manual memakai subdomain dari host (atau default env).
    login(data);
  });

  const loginWithDemoAccount = (email: string, subdomain: string) => {
    methods.setValue('email', email, { shouldValidate: true });
    methods.setValue('password', DEMO_PASSWORD, { shouldValidate: true });
    // Login langsung dengan subdomain akun tersebut agar tenant ter-resolve
    // dengan benar meski diakses via localhost (tanpa subdomain host).
    login({ email, password: DEMO_PASSWORD, subdomain });
  };

  // Tampilkan panel akun demo di non-production, atau saat flag diaktifkan
  // secara eksplisit (mis. lingkungan staging demo).
  const showDemoCredentials =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === 'true';

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Selamat datang kembali 👋
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Masuk untuk mengelola komunitas RT Anda
          </p>
        </div>

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
          placeholder="Masukkan password"
          required
        />

        <Button
          type="submit"
          loading={isPending}
          className="mt-1 w-full bg-gradient-to-r from-emerald-500 to-teal-600 py-2.5 text-base shadow-lg shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-700 focus-visible:ring-emerald-500">
          Masuk
        </Button>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Belum punya akun?{' '}
          <a
            href="/register"
            className="font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400">
            Daftar sekarang
          </a>
        </p>

        {showDemoCredentials && (
          <div className="mt-2 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-900/15">
            <div className="border-b border-amber-200/70 bg-amber-100/60 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/25">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                <span>🔑</span> Akun Demo
                <span className="font-normal text-amber-600 dark:text-amber-400">
                  · klik untuk login
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                Password:{' '}
                <code className="rounded bg-amber-200/60 px-1 py-0.5 font-mono dark:bg-amber-900/40">
                  {DEMO_PASSWORD}
                </code>
              </p>
            </div>
            <ul className="flex max-h-52 flex-col divide-y divide-amber-100 overflow-y-auto dark:divide-amber-900/30">
              {DEMO_ACCOUNTS.map(account => (
                <li key={account.email}>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      loginWithDemoAccount(account.email, account.subdomain)
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-amber-100/70 disabled:opacity-50 dark:hover:bg-amber-900/30">
                    <span className="inline-flex w-11 shrink-0 justify-center rounded-md bg-amber-200/70 px-1 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                      {account.tenant}
                    </span>
                    <span className="w-20 shrink-0 font-medium text-amber-900 dark:text-amber-100">
                      {account.role}
                    </span>
                    <span className="truncate font-mono text-amber-700 dark:text-amber-300">
                      {account.email}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </FormProvider>
  );
}
