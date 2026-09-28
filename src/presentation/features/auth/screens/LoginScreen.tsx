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
  membershipRole?: string;
}> = [
  // Platform Admin (existing)
  { tenant: 'Platform', role: 'Super Admin', email: 'superadmin@societ.app', subdomain: 'platform' },
  { tenant: 'Platform', role: 'Admin', email: 'admin@societ-rt.com', subdomain: 'platform' },

  // Tenant: Kelurahan Menteng (Enterprise Plan)
  { tenant: 'Menteng', role: 'Ketua RT', email: 'budi@menteng.societ-rt.id', subdomain: 'menteng', membershipRole: 'TENANT_OWNER' },
  { tenant: 'Menteng', role: 'Pengurus', email: 'siti@menteng.societ-rt.id', subdomain: 'menteng', membershipRole: 'ORG_ADMIN' },
  { tenant: 'Menteng', role: 'Ketua RT', email: 'ahmad@menteng.societ-rt.id', subdomain: 'menteng', membershipRole: 'RT_ADMIN' },
  { tenant: 'Menteng', role: 'Security', email: 'dewi@menteng.societ-rt.id', subdomain: 'menteng', membershipRole: 'SECURITY' },
  { tenant: 'Menteng', role: 'Warga', email: 'eko@menteng.societ-rt.id', subdomain: 'menteng', membershipRole: 'RESIDENT' },
  { tenant: 'Menteng', role: 'Warga', email: 'fitri@menteng.societ-rt.id', subdomain: 'menteng', membershipRole: 'RESIDENT' },

  // Tenant: Kelurahan Kemang (Pro Plan)
  { tenant: 'Kemang', role: 'Ketua RT', email: 'gunawan@kemang.societ-rt.id', subdomain: 'kemang', membershipRole: 'TENANT_OWNER' },
  { tenant: 'Kemang', role: 'Pengurus', email: 'hesti@kemang.societ-rt.id', subdomain: 'kemang', membershipRole: 'ORG_ADMIN' },
  { tenant: 'Kemang', role: 'Ketua RT', email: 'irfan@kemang.societ-rt.id', subdomain: 'kemang', membershipRole: 'RT_ADMIN' },
  { tenant: 'Kemang', role: 'Security', email: 'joko@kemang.societ-rt.id', subdomain: 'kemang', membershipRole: 'SECURITY' },
  { tenant: 'Kemang', role: 'Warga', email: 'kartika@kemang.societ-rt.id', subdomain: 'kemang', membershipRole: 'RESIDENT' },

  // Tenant: Kelurahan Sudirman (Free Plan)
  { tenant: 'Sudirman', role: 'Ketua RT', email: 'lukman@sudirman.societ-rt.id', subdomain: 'sudirman', membershipRole: 'TENANT_OWNER' },
  { tenant: 'Sudirman', role: 'Ketua RT', email: 'maya@sudirman.societ-rt.id', subdomain: 'sudirman', membershipRole: 'RT_ADMIN' },
  { tenant: 'Sudirman', role: 'Warga', email: 'nanda@sudirman.societ-rt.id', subdomain: 'sudirman', membershipRole: 'RESIDENT' },
];

export function LoginScreen() {
  const { login, isPending, isError, error } = useLoginViewModel();

  const methods = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = methods.handleSubmit(data => {
    console.log('[LoginScreen] Manual submit:', data);
    login(data);
  });

  const loginWithDemoAccount = (email: string, subdomain: string) => {
    console.log('[LoginScreen] Demo account clicked:', { email, subdomain, isPending });
    methods.setValue('email', email, { shouldValidate: true });
    methods.setValue('password', DEMO_PASSWORD, { shouldValidate: true });
    console.log('[LoginScreen] Form values set, calling login...');
    login({ email, password: DEMO_PASSWORD, subdomain });
  };

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
            <ul className="flex max-h-64 flex-col divide-y divide-amber-100 overflow-y-auto dark:divide-amber-900/30">
              {DEMO_ACCOUNTS.map(account => (
                <li key={account.email} >
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={(e) => {
                      console.log('test')
                      e.preventDefault();
                      e.stopPropagation();
                      alert('Clicked: ' + account.email); console.log('[LoginScreen] Button onClick fired for:', account.email);
                      loginWithDemoAccount(account.email, account.subdomain);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-amber-100/70 disabled:opacity-50 dark:hover:bg-amber-900/30">
                    <span className="inline-flex w-16 shrink-0 justify-center rounded-md bg-amber-200/70 px-1 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                      {account.tenant}
                    </span>
                    <span className="w-20 shrink-0 font-medium text-amber-900 dark:text-amber-100">
                      {account.role}
                    </span>
                    {account.membershipRole && (
                      <span className="w-24 shrink-0 rounded bg-gray-200/70 px-1 py-0.5 text-[9px] text-gray-600 dark:bg-gray-700/50 dark:text-gray-300">
                        {account.membershipRole}
                      </span>
                    )}
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

