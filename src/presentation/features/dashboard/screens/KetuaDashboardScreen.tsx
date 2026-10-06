'use client';

import { useRouter } from 'next/navigation';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useKetuaDashboardViewModel } from '../viewModel/useKetuaDashboardViewModel';
import { MobileDashboard } from './MobileDashboard';
import { usePermissions, invalidatePermissionsCache } from '@presentation/hooks/usePermissions';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: string;
  bgColor: string;
  iconBg: string;
  href?: string;
}

function MetricCard({ label, value, icon, bgColor, iconBg, href }: MetricCardProps) {
  const content = (
    <div className={`relative overflow-hidden rounded-xl border border-gray-200 p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconBg}`}>
          <span className="text-xl">{icon}</span>
        </div>
      </div>
    </div>
  );

  if (href) {
    return <a href={href} className="block no-underline">{content}</a>;
  }
  return content;
}

interface QuickActionProps {
  label: string;
  icon: string;
  href: string;
  color: string;
}

function QuickAction({ label, icon, href, color }: QuickActionProps) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800 no-underline"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <span className="text-lg">{icon}</span>
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
    </a>
  );
}

export function KetuaDashboardScreen() {
  const router = useRouter();
  const { metrics, isLoading, isError, error } = useKetuaDashboardViewModel();
  
  // Use shared permission hook (no separate /api/auth/me call needed)
  const { userContext } = usePermissions();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    invalidatePermissionsCache();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile: app-style home screen (sidebar rendered as in-screen menu) */}
      <div className="md:hidden">
        <MobileDashboard
          userName={userContext?.name ?? 'Warga'}
          userRole={userContext?.role ?? 'Warga'}
          metrics={metrics}
          isLoading={isLoading}
          onLogout={handleLogout}
        />
      </div>

      {/* Desktop: existing dashboard */}
      <div className="hidden md:block">
        <DesktopDashboard
          metrics={metrics}
          isLoading={isLoading}
          isError={isError}
          error={error}
        />
      </div>
    </>
  );
}

interface DesktopDashboardProps {
  metrics: {
    totalResidents: number;
    totalHouseholds: number;
    pendingLetters: number;
    activeEmergencies: number;
    upcomingEvents: number;
    unpaidIuran: number;
    currentBalance: number;
  } | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

function DesktopDashboard({ metrics, isLoading, isError, error }: DesktopDashboardProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {/* Skeleton header */}
        <div className="animate-pulse rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 p-6 dark:from-gray-800 dark:to-gray-800">
          <div className="h-7 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-4 w-72 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        {/* Skeleton cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-7 w-16 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage message={error?.message ?? 'Failed to load dashboard'} />
    );
  }

  if (!metrics) {
    return <ErrorMessage message="No dashboard data available" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome Banner */}
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg">
        <h1 className="text-2xl font-bold">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-blue-100">
          Ringkasan informasi komunitas RT Anda
        </p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Warga"
          value={metrics.totalResidents}
          icon="👥"
          bgColor="bg-white dark:bg-gray-800"
          iconBg="bg-blue-100 dark:bg-blue-900/40"
          href="/residents"
        />
        <MetricCard
          label="Rumah Tangga"
          value={metrics.totalHouseholds}
          icon="🏠"
          bgColor="bg-white dark:bg-gray-800"
          iconBg="bg-green-100 dark:bg-green-900/40"
          href="/map"
        />
        <MetricCard
          label="Surat Pending"
          value={metrics.pendingLetters}
          icon="📋"
          bgColor="bg-white dark:bg-gray-800"
          iconBg="bg-amber-100 dark:bg-amber-900/40"
          href="/administration/letters"
        />
        <MetricCard
          label="Darurat Aktif"
          value={metrics.activeEmergencies}
          icon="🚨"
          bgColor={metrics.activeEmergencies > 0 ? 'bg-red-50 dark:bg-red-900/10' : 'bg-white dark:bg-gray-800'}
          iconBg={metrics.activeEmergencies > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-700'}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Event Mendatang"
          value={metrics.upcomingEvents}
          icon="📅"
          bgColor="bg-white dark:bg-gray-800"
          iconBg="bg-purple-100 dark:bg-purple-900/40"
          href="/events"
        />
        <MetricCard
          label="Iuran Belum Lunas"
          value={metrics.unpaidIuran}
          icon="💳"
          bgColor={metrics.unpaidIuran > 0 ? 'bg-orange-50 dark:bg-orange-900/10' : 'bg-white dark:bg-gray-800'}
          iconBg="bg-orange-100 dark:bg-orange-900/40"
          href="/finance/iuran"
        />
        <MetricCard
          label="Saldo Kas"
          value={`Rp ${(metrics.currentBalance ?? 0).toLocaleString('id-ID')}`}
          icon="💰"
          bgColor="bg-white dark:bg-gray-800"
          iconBg="bg-emerald-100 dark:bg-emerald-900/40"
          href="/finance"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">
          Aksi Cepat
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <QuickAction label="Buat Pengumuman" icon="📢" href="/announcements/create" color="bg-blue-100 dark:bg-blue-900/40" />
          <QuickAction label="Buat Voting" icon="🗳️" href="/voting/create" color="bg-indigo-100 dark:bg-indigo-900/40" />
          <QuickAction label="Buat Event" icon="🎉" href="/events/create" color="bg-green-100 dark:bg-green-900/40" />
          <QuickAction label="Ajukan Surat" icon="📄" href="/administration/letters" color="bg-amber-100 dark:bg-amber-900/40" />
          <QuickAction label="Lihat Peta" icon="🗺️" href="/map" color="bg-purple-100 dark:bg-purple-900/40" />
        </div>
      </div>
    </div>
  );
}
