'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NAV_ITEMS, visibleNavItems } from '@components/organisms/navItems';

interface MobileDashboardMetrics {
  totalResidents: number;
  totalHouseholds: number;
  pendingLetters: number;
  activeEmergencies: number;
  upcomingEvents: number;
  unpaidIuran: number;
  currentBalance: number;
}

export interface MobileDashboardProps {
  userName: string;
  userRole: string;
  metrics: MobileDashboardMetrics | null;
  isLoading: boolean;
  onLogout?: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

function todayLabel(): string {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatCurrency(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
}

// Rotating accent palette so menu tiles are easier to scan at a glance.
const MENU_ACCENTS = [
  'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300',
  'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300',
  'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300',
  'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300',
];

/**
 * App-style home screen shown only on mobile (md:hidden). Presents a greeting
 * header, summary stats, and the navigation menu as in-screen tiles instead of
 * a hidden sidebar drawer. The emergency SOS action lives in the bottom nav
 * panic button.
 */
export function MobileDashboard({
  userName,
  userRole,
  metrics,
  isLoading,
  onLogout,
}: MobileDashboardProps) {
  const menuItems = visibleNavItems(NAV_ITEMS, userRole).filter(
    item => item.href !== '/',
  );

  // greeting() and todayLabel() depend on the current time and the user's
  // locale/timezone, which can differ between the server and the client and
  // cause a hydration mismatch. Compute them only after mount so the first
  // client render matches the server-rendered HTML.
  const [mounted, setMounted] = useState(false);
  // Mount detection to avoid a time/locale hydration mismatch. Setting state
  // once on mount is the intended React pattern here (not a cascading render).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const greetingText = mounted ? greeting() : 'Selamat datang';
  const dateText = mounted ? todayLabel() : 'SocieT-RT';

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* App header — sticky so it stays visible while the content scrolls */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 rounded-b-[2.25rem] bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 px-5 pb-10 pt-7 text-white shadow-xl shadow-emerald-900/20 sm:-mx-6 [overflow:clip]">
        {/* Decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-8 h-44 w-44 rounded-full bg-teal-300/20 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_45%)]"
        />

        <div className="relative flex items-start justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-base font-bold ring-2 ring-white/40 backdrop-blur">
                {initials(userName) || '👤'}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-emerald-600 bg-lime-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-emerald-50/90">{greetingText},</p>
              <h1 className="truncate text-xl font-bold leading-tight">
                {userName}
              </h1>
              <p className="mt-0.5 text-xs text-emerald-100/80">{dateText}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              aria-label="Notifikasi"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg backdrop-blur transition-transform active:scale-90">
              🔔
            </Link>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                aria-label="Keluar"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg backdrop-blur transition-transform active:scale-90">
                ⎋
              </button>
            )}
          </div>
        </div>

        {/* Balance highlight card */}
        <Link
          href="/finance"
          className="relative mt-6 block rounded-2xl border border-white/15 bg-white/15 p-4 backdrop-blur-md transition-transform active:scale-[0.99]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-50/80">
              💰 Saldo Kas RT
            </p>
            <span className="text-[11px] font-semibold text-white/90">
              Detail →
            </span>
          </div>
          {isLoading ? (
            <div className="mt-2 h-9 w-48 animate-pulse rounded-lg bg-white/30" />
          ) : (
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {formatCurrency(metrics?.currentBalance ?? 0)}
            </p>
          )}

          {/* Inline mini-metrics */}
          <div className="mt-3 flex items-center gap-4 border-t border-white/15 pt-3 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-50/90">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/20">
                📅
              </span>
              {isLoading ? '—' : `${metrics?.upcomingEvents ?? 0} event`}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-50/90">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/20">
                💳
              </span>
              {isLoading ? '—' : `${metrics?.unpaidIuran ?? 0} iuran`}
            </span>
          </div>
        </Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Total Warga"
          value={metrics?.totalResidents}
          icon="👥"
          isLoading={isLoading}
          href="/residents"
          accent="bg-gradient-to-br from-blue-500 to-indigo-500"
        />
        <StatTile
          label="Rumah Tangga"
          value={metrics?.totalHouseholds}
          icon="🏠"
          isLoading={isLoading}
          href="/map"
          accent="bg-gradient-to-br from-emerald-500 to-teal-500"
        />
        <StatTile
          label="Surat Pending"
          value={metrics?.pendingLetters}
          icon="📋"
          isLoading={isLoading}
          href="/administration/letters"
          accent="bg-gradient-to-br from-amber-500 to-orange-500"
        />
        <StatTile
          label="Darurat Aktif"
          value={metrics?.activeEmergencies}
          icon="🚨"
          isLoading={isLoading}
          accent="bg-gradient-to-br from-red-500 to-rose-500"
          highlight={(metrics?.activeEmergencies ?? 0) > 0}
        />
      </div>

      {/* Menu grid — the sidebar rendered as in-screen tiles */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Menu
          </h2>
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
            {menuItems.length} layanan
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {menuItems.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col items-center gap-1.5 rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md active:scale-95 dark:border-gray-800 dark:bg-gray-800 dark:hover:border-emerald-800">
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl transition-transform group-hover:scale-110 ${
                  MENU_ACCENTS[i % MENU_ACCENTS.length]
                }`}
                aria-hidden="true">
                {item.icon}
              </span>
              <span className="w-full break-words hyphens-auto text-[11px] font-medium leading-tight text-gray-600 dark:text-gray-300">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: number | undefined;
  icon: string;
  isLoading: boolean;
  /** When omitted, the tile is rendered as a non-clickable card. */
  href?: string;
  accent: string;
  highlight?: boolean;
}

function StatTile({
  label,
  value,
  icon,
  isLoading,
  href,
  accent,
  highlight = false,
}: StatTileProps) {
  const className = `relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3 shadow-sm transition-all ${
    href ? 'hover:-translate-y-0.5 hover:shadow-md active:scale-95' : ''
  } ${
    highlight
      ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10'
      : 'border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-800'
  }`;

  const inner = (
    <>
      <span
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-white shadow-sm ${accent}`}
        aria-hidden="true">
        {icon}
        {highlight && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-xl bg-red-400/50" />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {label}
        </p>
        {isLoading ? (
          <div className="mt-1 h-6 w-10 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        ) : (
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {value ?? 0}
          </p>
        )}
      </div>
    </>
  );

  if (!href) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
