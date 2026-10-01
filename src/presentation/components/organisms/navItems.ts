/**
 * Shared navigation item definitions used by the desktop Sidebar, the mobile
 * in-screen menu grid, and the mobile bottom navigation bar.
 *
 * Single source of truth so role-based visibility stays consistent across all
 * navigation surfaces.
 *
 * @see Requirements 22.3 (Permission-Based UI Rendering)
 * @see Requirements 25.1-25.11 (Navigation and Routing)
 */

import { MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// NavItem Interface — Enhanced to support permission-based visibility
// ---------------------------------------------------------------------------

/**
 * NavItem — Navigation item definition supporting both legacy role-based
 * and new permission-based visibility.
 *
 * @property id - Unique identifier for the nav item (used for grouping and testing)
 * @property labelKey - i18n translation key for the label (fallback to label if not translated)
 * @property label - Display label (used as fallback when translation not available)
 * @property path - Route path (href)
 * @property href - Alias for path for backward compatibility
 * @property icon - Emoji icon key rendered by the nav surfaces
 * @property requiredPermissions - Permission codes required to see this item (all must be present)
 * @property requiredRole - MembershipRole required (used for PLATFORM_ADMIN-only items)
 * @property roles - Legacy role filter (string array, for backward compatibility)
 * @property children - Nested navigation items (for grouped navigation)
 * @property category - Navigation category for grouping in sidebar
 *
 * @see Requirements 22.3 — Permission-based visibility
 * @see Requirements 25.3 — Navigation links conditionally rendered based on permissions
 */
export interface NavItem {
  /** Unique identifier for the nav item */
  id?: string;
  /** i18n translation key for the label */
  labelKey?: string;
  /** Display label (fallback when translation not available) */
  label: string;
  /** Route path */
  path?: string;
  /** Alias for path (backward compatibility) */
  href: string;
  /** Emoji icon rendered by nav surfaces */
  icon: string;
  /** Permission codes required to see this item (all must be present) */
  requiredPermissions?: string[];
  /** MembershipRole required to see this item (e.g., PLATFORM_ADMIN only) */
  requiredRole?: MembershipRole;
  /** Legacy role filter (string array, for backward compatibility) */
  roles?: string[];
  /** Nested navigation items (for grouped navigation) */
  children?: NavItem[];
  /** Navigation category for grouping in sidebar */
  category?: NavCategory;
}

/**
 * Navigation categories for grouping sidebar items.
 *
 * @see Requirements 25.2 — Navigation sidebar groups by category
 */
export type NavCategory =
  | 'main'
  | 'membership'
  | 'organization'
  | 'settings'
  | 'platform'
  | 'security'
  | 'community';

// ---------------------------------------------------------------------------
// Administration Navigation Items
// ---------------------------------------------------------------------------

/**
 * Administration section navigation items.
 * These are permission-gated based on the new multi-tenant authorization model.
 *
 * @see Requirements 25.3 — Navigation conditionally rendered based on permissions
 * @see Requirements 2.1 (Member List requires membership:read)
 * @see Requirements 7.1 (OrgUnit Tree requires orgunit:read)
 * @see Requirements 11.2 (Tenant Settings requires tenant:manage)
 * @see Requirements 14.2 (Subscription requires tenant:manage)
 * @see Requirements 17.2 (Audit Log requires audit:read or tenant:manage)
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    id: 'admin-members',
    labelKey: 'nav.admin.members',
    label: 'Members',
    path: '/admin/members',
    href: '/admin/members',
    icon: '👥',
    requiredPermissions: ['membership:read'],
    category: 'membership',
  },
  {
    id: 'admin-org-units',
    labelKey: 'nav.admin.org_units',
    label: 'Organization Units',
    path: '/admin/org-units',
    href: '/admin/org-units',
    icon: '🏛️',
    requiredPermissions: ['orgunit:read'],
    category: 'organization',
  },
  {
    id: 'admin-settings',
    labelKey: 'nav.admin.settings',
    label: 'Settings',
    path: '/admin/settings',
    href: '/admin/settings',
    icon: '⚙️',
    requiredPermissions: ['tenant:manage'],
    category: 'settings',
  },
  {
    id: 'admin-subscription',
    labelKey: 'nav.admin.subscription',
    label: 'Subscription',
    path: '/admin/subscription',
    href: '/admin/subscription',
    icon: '💳',
    requiredPermissions: ['tenant:manage'],
    category: 'settings',
  },
  {
    id: 'admin-audit-log',
    labelKey: 'nav.admin.audit_log',
    label: 'Audit Log',
    path: '/admin/audit-log',
    href: '/admin/audit-log',
    icon: '📜',
    // Audit log requires audit:read OR tenant:manage (handled via visibility logic)
    // We mark it with audit:read as primary; tenant:manage users will also see it
    requiredPermissions: ['audit:read'],
    category: 'settings',
  },
];

// ---------------------------------------------------------------------------
// Platform Admin Navigation Items
// ---------------------------------------------------------------------------

/**
 * Platform Admin section navigation items.
 * These are ONLY visible to users with PLATFORM_ADMIN role.
 *
 * CRITICAL: Platform admin items require explicit PLATFORM_ADMIN role check,
 * NOT just permission checks, because PLATFORM_ADMIN has no tenant-level
 * permissions (L11 principle).
 *
 * @see Requirements 19.1 (Platform Dashboard requires PLATFORM_ADMIN role)
 * @see Requirements 20.1-20.9 (Platform Admin Tenant Operations)
 * @see Requirements 21.1-21.10 (Security Event Alerts)
 */
export const PLATFORM_ADMIN_NAV_ITEMS: NavItem[] = [
  {
    id: 'platform-dashboard',
    labelKey: 'nav.platform.dashboard',
    label: 'Dashboard',
    path: '/platform/dashboard',
    href: '/platform/dashboard',
    icon: '📊',
    requiredRole: MembershipRole.PLATFORM_ADMIN,
    category: 'platform',
  },
  {
    id: 'platform-tenants',
    labelKey: 'nav.platform.tenants',
    label: 'Tenants',
    path: '/platform/tenants',
    href: '/platform/tenants',
    icon: '🏢',
    requiredRole: MembershipRole.PLATFORM_ADMIN,
    category: 'platform',
  },
  {
    id: 'platform-security',
    labelKey: 'nav.platform.security',
    label: 'Security Events',
    path: '/platform/security',
    href: '/platform/security',
    icon: '🔒',
    requiredRole: MembershipRole.PLATFORM_ADMIN,
    category: 'platform',
  },
];

// ---------------------------------------------------------------------------
// Legacy Navigation Items (Backward Compatibility)
// ---------------------------------------------------------------------------

/** Full navigation list (desktop sidebar + mobile menu grid). */
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', icon: '🏠', category: 'main' },
  { id: 'residents', label: 'Residents', href: '/residents', icon: '👥', roles: ['Ketua_RT', 'Pengurus', 'Super_Admin'], category: 'community' },
  { id: 'users', label: 'Users', href: '/users', icon: '👤', roles: ['Ketua_RT', 'Super_Admin'], category: 'membership' },
  { id: 'tenants-legacy', label: 'Tenants', href: '/admin/tenants', icon: '🏢', roles: ['Super_Admin'], category: 'platform' },
  { id: 'finance', label: 'Finance', href: '/finance', icon: '💰', category: 'community' },
  { id: 'voting', label: 'Voting', href: '/voting', icon: '🗳️', category: 'community' },
  { id: 'announcements', label: 'Announcements', href: '/announcements', icon: '📢', category: 'community' },
  { id: 'events', label: 'Events', href: '/events', icon: '📅', category: 'community' },
  { id: 'map', label: 'Map', href: '/map', icon: '🗺️', category: 'community' },
  { id: 'door-monitoring', label: 'Pintu Warga', href: '/door-monitoring', icon: '🚪', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'], category: 'security' },
  { id: 'door-request', label: 'Ajukan Sensor', href: '/door-monitoring/request', icon: '📨', roles: ['Ketua_RT', 'Pengurus'], category: 'security' },
  { id: 'door-sensors', label: 'Registrasi Sensor', href: '/admin/door-sensors', icon: '🔧', roles: ['Super_Admin'], category: 'settings' },
  { id: 'patrols', label: 'Security', href: '/security/patrols', icon: '🛡️', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'], category: 'security' },
  { id: 'incidents', label: 'Incidents', href: '/security/incidents', icon: '⚠️', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'], category: 'security' },
  { id: 'visitors', label: 'Visitors', href: '/visitors', icon: '🚶', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'], category: 'security' },
  { id: 'packages', label: 'Packages', href: '/packages', icon: '📦', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'], category: 'security' },
  { id: 'administration', label: 'Administration', href: '/administration/letters', icon: '📋', category: 'settings' },
  { id: 'emergency-contacts', label: 'Nomor Darurat', href: '/emergency-contacts', icon: '📞', category: 'community' },
  { id: 'notifications', label: 'Notifications', href: '/notifications', icon: '🔔', category: 'main' },
  { id: 'audit-log-legacy', label: 'Audit Log', href: '/audit', icon: '📜', roles: ['Ketua_RT', 'Super_Admin'], category: 'settings' },
];

/** Primary destinations shown in the mobile bottom navigation bar. */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { id: 'bottom-home', label: 'Home', href: '/', icon: '🏠' },
  { id: 'bottom-announcements', label: 'Announcements', href: '/announcements', icon: '📢' },
  { id: 'bottom-events', label: 'Events', href: '/events', icon: '📅' },
  { id: 'bottom-notifications', label: 'Notifications', href: '/notifications', icon: '🔔' },
];

// ---------------------------------------------------------------------------
// Visibility Functions
// ---------------------------------------------------------------------------

/**
 * Filter nav items by the current user's role (legacy).
 * Use visibleNavItemsWithPermissions for permission-based filtering.
 *
 * @param items - Navigation items to filter
 * @param userRole - Current user's role string (legacy format)
 * @returns Filtered navigation items visible to the user
 */
export function visibleNavItems(items: NavItem[], userRole: string): NavItem[] {
  return items.filter(item => !item.roles || item.roles.includes(userRole));
}

/**
 * Filter nav items by permissions and role.
 * Supports both legacy role-based and new permission-based visibility.
 *
 * @param items - Navigation items to filter
 * @param permissions - Set of permissions the user has
 * @param role - Current user's MembershipRole (optional)
 * @param legacyRole - Legacy role string for backward compatibility (optional)
 * @returns Filtered navigation items visible to the user
 *
 * @see Requirements 22.3, 22.4 — Permission-based visibility
 * @see Requirements 25.3 — Navigation links conditionally rendered based on permissions
 */
export function visibleNavItemsWithPermissions(
  items: NavItem[],
  permissions: Set<string>,
  role?: MembershipRole,
  legacyRole?: string,
): NavItem[] {
  return items.filter(item => {
    // Check required role (e.g., PLATFORM_ADMIN)
    if (item.requiredRole) {
      if (role !== item.requiredRole) {
        return false;
      }
    }

    // Check required permissions (all must be present)
    if (item.requiredPermissions && item.requiredPermissions.length > 0) {
      const hasAllPermissions = item.requiredPermissions.every(perm =>
        permissions.has(perm),
      );
      if (!hasAllPermissions) {
        return false;
      }
    }

    // Legacy role check (backward compatibility)
    if (item.roles && item.roles.length > 0) {
      if (!legacyRole || !item.roles.includes(legacyRole)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Check if a user can see an admin nav item based on permissions.
 * Special handling for audit log which requires audit:read OR tenant:manage.
 *
 * @param item - The navigation item to check
 * @param permissions - Set of permissions the user has
 * @returns true if the user can see the item
 *
 * @see Requirements 17.2 — Audit log requires audit:read OR tenant:manage
 */
export function canSeeAdminNavItem(
  item: NavItem,
  permissions: Set<string>,
): boolean {
  // Special case for audit log: requires audit:read OR tenant:manage
  if (item.id === 'admin-audit-log') {
    return permissions.has('audit:read') || permissions.has('tenant:manage');
  }

  // Standard permission check: all required permissions must be present
  if (item.requiredPermissions && item.requiredPermissions.length > 0) {
    return item.requiredPermissions.every(perm => permissions.has(perm));
  }

  return true;
}

/**
 * Get all visible admin navigation items for a user.
 *
 * @param permissions - Set of permissions the user has
 * @returns Admin navigation items visible to the user
 *
 * @see Requirements 25.3 — Navigation links conditionally rendered based on permissions
 */
export function getVisibleAdminNavItems(permissions: Set<string>): NavItem[] {
  return ADMIN_NAV_ITEMS.filter(item => canSeeAdminNavItem(item, permissions));
}

/**
 * Get all visible platform admin navigation items for a user.
 * Only returns items if user has PLATFORM_ADMIN role.
 *
 * @param role - Current user's MembershipRole
 * @returns Platform admin navigation items (empty if not PLATFORM_ADMIN)
 *
 * @see Requirements 19.1 — Platform Dashboard requires PLATFORM_ADMIN role
 */
export function getVisiblePlatformAdminNavItems(
  role?: MembershipRole,
): NavItem[] {
  if (role !== MembershipRole.PLATFORM_ADMIN) {
    return [];
  }
  return [...PLATFORM_ADMIN_NAV_ITEMS];
}

/**
 * Group navigation items by category.
 *
 * @param items - Navigation items to group
 * @returns Map of category to navigation items
 *
 * @see Requirements 25.2 — Navigation sidebar groups by category
 */
export function groupNavItemsByCategory(
  items: NavItem[],
): Map<NavCategory, NavItem[]> {
  const grouped = new Map<NavCategory, NavItem[]>();

  for (const item of items) {
    const category = item.category ?? 'main';
    const existing = grouped.get(category) ?? [];
    existing.push(item);
    grouped.set(category, existing);
  }

  return grouped;
}

/**
 * Get category display information for sidebar grouping.
 *
 * @param category - Navigation category
 * @returns Category display info with i18n key and icon
 *
 * @see Requirements 25.2 — Navigation sidebar groups by category
 */
export function getCategoryInfo(category: NavCategory): {
  labelKey: string;
  label: string;
  icon: string;
} {
  const categoryMap: Record<
    NavCategory,
    { labelKey: string; label: string; icon: string }
  > = {
    main: { labelKey: 'nav.category.main', label: 'Main', icon: '🏠' },
    membership: {
      labelKey: 'nav.category.membership',
      label: 'Membership',
      icon: '👥',
    },
    organization: {
      labelKey: 'nav.category.organization',
      label: 'Organization',
      icon: '🏛️',
    },
    settings: {
      labelKey: 'nav.category.settings',
      label: 'Settings',
      icon: '⚙️',
    },
    platform: {
      labelKey: 'nav.category.platform',
      label: 'Platform',
      icon: '🔧',
    },
    security: {
      labelKey: 'nav.category.security',
      label: 'Security',
      icon: '🛡️',
    },
    community: {
      labelKey: 'nav.category.community',
      label: 'Community',
      icon: '🏘️',
    },
  };

  return categoryMap[category];
}
