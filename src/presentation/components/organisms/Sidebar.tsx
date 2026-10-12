'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type NavItem, visibleNavItems } from './navItems';

export interface SidebarProps {
  items: NavItem[];
  userRole: string;
  className?: string;
  onNavigate?: () => void;
}

// Admin roles that can see admin section.
// Includes both legacy role strings (Super_Admin, Ketua_RT, Pengurus) and the
// normalized MembershipRole strings returned by /api/auth/me via mapLegacyRole
// (PLATFORM_ADMIN, TENANT_OWNER, RT_ADMIN, ORG_ADMIN). Keeping both avoids the
// role-string mismatch that previously hid the admin menus.
const ADMIN_ROLES = [
  'Super_Admin',
  'Ketua_RT',
  'Pengurus',
  'PLATFORM_ADMIN',
  'TENANT_OWNER',
  'RT_ADMIN',
  'ORG_ADMIN',
];
// Platform admin roles that can see platform section
const PLATFORM_ADMIN_ROLES = ['Super_Admin', 'PLATFORM_ADMIN'];

export function Sidebar({ items, userRole, className = '', onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const visibleItems = visibleNavItems(items, userRole);
  
  // Separate items into sections
  const mainItems = visibleItems.filter(item => 
    !item.id?.startsWith('admin-') && !item.id?.startsWith('platform-')
  );
  const adminItems = visibleItems.filter(item => item.id?.startsWith('admin-'));
  const platformItems = visibleItems.filter(item => item.id?.startsWith('platform-'));

  const isAdmin = ADMIN_ROLES.includes(userRole);
  const isPlatformAdmin = PLATFORM_ADMIN_ROLES.includes(userRole);

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
    const icon = item.icon ?? '•';

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
            isActive
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
          }`}
          aria-current={isActive ? 'page' : undefined}
          title={collapsed ? item.label : undefined}>
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm ${
            isActive
              ? 'bg-blue-100 dark:bg-blue-900/50'
              : 'bg-gray-100 group-hover:bg-gray-200 dark:bg-gray-800 dark:group-hover:bg-gray-700'
          }`} aria-hidden="true">
            {icon}
          </span>
          {!collapsed && <span className="truncate">{item.label}</span>}
          {isActive && !collapsed && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
          )}
        </Link>
      </li>
    );
  };

  const renderSectionHeader = (title: string, icon: string) => {
    if (collapsed) {
      return (
        <div className="my-2 flex justify-center">
          <span className="text-xs text-gray-400">{icon}</span>
        </div>
      );
    }
    return (
      <div className="mb-2 mt-4 flex items-center gap-2 px-3">
        <span className="text-xs">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </span>
      </div>
    );
  };

  return (
    <aside
      className={`relative z-30 flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-200 dark:border-gray-700 dark:bg-gray-900 ${collapsed ? 'w-[68px]' : 'w-60'} ${className}`}
      aria-label="Sidebar navigation">
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              S
            </div>
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">
              SocieT-RT
            </span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            S
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setCollapsed(prev => !prev)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex w-full items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300">
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={collapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'} />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {/* Main Navigation */}
        <ul className="space-y-0.5">
          {mainItems.map(renderNavItem)}
        </ul>

        {/* Admin Section */}
        {isAdmin && adminItems.length > 0 && (
          <>
            {renderSectionHeader('Administration', '⚙️')}
            <ul className="space-y-0.5">
              {adminItems.map(renderNavItem)}
            </ul>
          </>
        )}

        {/* Platform Admin Section */}
        {isPlatformAdmin && platformItems.length > 0 && (
          <>
            {renderSectionHeader('Platform', '🔧')}
            <ul className="space-y-0.5">
              {platformItems.map(renderNavItem)}
            </ul>
          </>
        )}
      </nav>
    </aside>
  );
}
