'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BOTTOM_NAV_ITEMS,
  visibleNavItems,
  type NavItem,
} from './navItems';
import { PanicButton } from './PanicButton';
import { usePermissions } from '@presentation/hooks/usePermissions';

export interface BottomNavProps {
  userRole: string;
}

/**
 * Mobile Admin Navigation Items.
 * Key admin sections displayed in the bottom navigation bar for mobile users
 * with appropriate permissions.
 *
 * @see Requirements 23.5 — Bottom navigation bar for mobile viewports with key actions
 * @see Requirements 25.3 — Navigation links conditionally rendered based on permissions
 */
export const MOBILE_ADMIN_NAV_ITEMS: NavItem[] = [
  {
    id: 'mobile-admin-members',
    labelKey: 'nav.admin.members',
    label: 'Members',
    path: '/admin/members',
    href: '/admin/members',
    icon: '👥',
    requiredPermissions: ['membership:read'],
    category: 'membership',
  },
  {
    id: 'mobile-admin-org',
    labelKey: 'nav.admin.org_units',
    label: 'Org',
    path: '/admin/org-units',
    href: '/admin/org-units',
    icon: '🏛️',
    requiredPermissions: ['orgunit:read'],
    category: 'organization',
  },
  {
    id: 'mobile-admin-settings',
    labelKey: 'nav.admin.settings',
    label: 'Settings',
    path: '/admin/settings',
    href: '/admin/settings',
    icon: '⚙️',
    requiredPermissions: ['tenant:manage'],
    category: 'settings',
  },
  {
    id: 'mobile-admin-audit',
    labelKey: 'nav.admin.audit_log',
    label: 'Audit',
    path: '/admin/audit-log',
    href: '/admin/audit-log',
    icon: '📜',
    // Audit log requires audit:read OR tenant:manage (handled via visibility logic)
    requiredPermissions: ['audit:read'],
    category: 'settings',
  },
];

/**
 * Filter mobile admin nav items based on user permissions.
 * Special handling for audit log which requires audit:read OR tenant:manage.
 *
 * @param items - Navigation items to filter
 * @param permissions - Set of permissions the user has
 * @param role - User's membership role (for PLATFORM_ADMIN check)
 * @returns Filtered navigation items visible to the user
 */
function getVisibleMobileAdminItems(
  items: NavItem[],
  permissions: ReadonlySet<string>,
  role: string | null,
): NavItem[] {
  return items.filter(item => {
    // Check required role (e.g., PLATFORM_ADMIN)
    if (item.requiredRole) {
      if (role !== item.requiredRole) {
        return false;
      }
    }

    // Special case for audit log: requires audit:read OR tenant:manage
    if (item.id === 'mobile-admin-audit') {
      return permissions.has('audit:read') || permissions.has('tenant:manage');
    }

    // Standard permission check: all required permissions must be present
    if (item.requiredPermissions && item.requiredPermissions.length > 0) {
      return item.requiredPermissions.every(perm => permissions.has(perm));
    }

    return true;
  });
}

/**
 * Mobile-only bottom tab bar with a modern floating card design and a centered
 * panic button that raises an emergency alert on a 3-second press-and-hold.
 *
 * Hidden on md+ screens where the desktop Sidebar is used instead. The nav
 * items are split evenly around the center button, and the Emergency
 * destination is intentionally excluded here since the panic button replaces
 * it as the primary emergency affordance.
 *
 * For users with admin permissions, the bottom nav also includes quick access
 * to key admin sections (Members, Organization, Settings, Audit).
 *
 * @see Requirements 23.5 — Bottom navigation bar for mobile viewports with key actions
 */
export function BottomNav({ userRole }: BottomNavProps) {
  const pathname = usePathname();
  const { permissions, role } = usePermissions();

  // The SOS/panic button replaces a dedicated emergency menu entry here.
  const baseItems = visibleNavItems(BOTTOM_NAV_ITEMS, userRole);

  // Get admin items based on user permissions
  const adminItems = getVisibleMobileAdminItems(
    MOBILE_ADMIN_NAV_ITEMS,
    permissions,
    role,
  );

  // Determine if we're in admin context (on admin pages)
  const isAdminContext = pathname.startsWith('/admin') || pathname.startsWith('/platform');

  // Use admin items when in admin context and user has permission to see any admin items
  // Otherwise use the default bottom nav items
  const items = isAdminContext && adminItems.length > 0 ? adminItems : baseItems;

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
        aria-label={isAdminContext && adminItems.length > 0 ? 'Admin bottom navigation' : 'Bottom navigation'}
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
