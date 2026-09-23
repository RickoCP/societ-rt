'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BOTTOM_NAV_ITEMS, visibleNavItems, type NavItem } from './navItems';
import { PanicButton } from './PanicButton';

export interface BottomNavProps {
  userRole: string;
}

/**
 * Mobile-only bottom tab bar with a modern floating card design and a centered
 * panic button that raises an emergency alert on a 3-second press-and-hold.
 *
 * Hidden on md+ screens where the desktop Sidebar is used instead. The nav
 * items are split evenly around the center button, and the Emergency
 * destination is intentionally excluded here since the panic button replaces
 * it as the primary emergency affordance.
 */
export function BottomNav({ userRole }: BottomNavProps) {
  const pathname = usePathname();

  // The SOS/panic button replaces a dedicated emergency menu entry here.
  const items = visibleNavItems(BOTTOM_NAV_ITEMS, userRole);

  // Split the visible items into two balanced groups around the center button.
  const mid = Math.ceil(items.length / 2);
  const leftItems = items.slice(0, mid);
  const rightItems = items.slice(mid);

  const isItemActive = (item: NavItem) =>
    pathname === item.href ||
    (item.href !== '/' && pathname.startsWith(item.href));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      {/* Background covering only the bottom half of the bar */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 top-1/2 -z-10 bg-gray-50 dark:bg-gray-950"
        aria-hidden="true"
      />
      <nav
        aria-label="Bottom navigation"
        className="pointer-events-auto relative flex w-full max-w-md items-stretch justify-between rounded-3xl border border-gray-200/70 bg-white/90 px-2 shadow-xl shadow-black/10 backdrop-blur-lg dark:border-gray-800/70 dark:bg-gray-900/90">
        {/* Center panic button, overlapping the bar */}
        <PanicButton />

        <div className="flex flex-1 items-stretch justify-around">
          {leftItems.map(item => (
            <NavTab key={item.href} item={item} active={isItemActive(item)} />
          ))}
        </div>

        {/* Spacer reserving room for the floating center button */}
        <div className="w-20 shrink-0" aria-hidden="true" />

        <div className="flex flex-1 items-stretch justify-around">
          {rightItems.map(item => (
            <NavTab key={item.href} item={item} active={isItemActive(item)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

interface NavTabProps {
  item: NavItem;
  active: boolean;
}

function NavTab({ item, active }: NavTabProps) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
        active
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-gray-400 dark:text-gray-500'
      }`}>
      <span
        className={`text-lg leading-none transition-transform ${
          active ? 'scale-110' : ''
        }`}
        aria-hidden="true">
        {item.icon}
      </span>
      <span className="max-w-[4.5rem] truncate">{item.label}</span>
    </Link>
  );
}
