/**
 * Shared navigation item definitions used by the desktop Sidebar, the mobile
 * in-screen menu grid, and the mobile bottom navigation bar.
 *
 * Single source of truth so role-based visibility stays consistent across all
 * navigation surfaces.
 */

export interface NavItem {
  label: string;
  href: string;
  /** Emoji icon key rendered by the nav surfaces. */
  icon: string;
  /** If present, only these roles see the item. Absent = visible to everyone. */
  roles?: string[];
}

/** Full navigation list (desktop sidebar + mobile menu grid). */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: '🏠' },
  { label: 'Residents', href: '/residents', icon: '👥', roles: ['Ketua_RT', 'Pengurus', 'Super_Admin'] },
  { label: 'Users', href: '/users', icon: '👤', roles: ['Ketua_RT', 'Super_Admin'] },
  { label: 'Tenants', href: '/admin/tenants', icon: '🏢', roles: ['Super_Admin'] },
  { label: 'Finance', href: '/finance', icon: '💰' },
  { label: 'Voting', href: '/voting', icon: '🗳️' },
  { label: 'Announcements', href: '/announcements', icon: '📢' },
  { label: 'Events', href: '/events', icon: '📅' },
  { label: 'Map', href: '/map', icon: '🗺️' },
  { label: 'Pintu Warga', href: '/door-monitoring', icon: '🚪', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Ajukan Sensor', href: '/door-monitoring/request', icon: '📨', roles: ['Ketua_RT', 'Pengurus'] },
  { label: 'Registrasi Sensor', href: '/admin/door-sensors', icon: '🔧', roles: ['Super_Admin'] },
  { label: 'Security', href: '/security/patrols', icon: '🛡️', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Incidents', href: '/security/incidents', icon: '⚠️', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Visitors', href: '/visitors', icon: '🚶', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Packages', href: '/packages', icon: '📦', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Administration', href: '/administration/letters', icon: '📋' },
  { label: 'Nomor Darurat', href: '/emergency-contacts', icon: '📞' },
  { label: 'Notifications', href: '/notifications', icon: '🔔' },
  { label: 'Audit Log', href: '/audit', icon: '📜', roles: ['Ketua_RT', 'Super_Admin'] },
];

/** Primary destinations shown in the mobile bottom navigation bar. */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/', icon: '🏠' },
  { label: 'Announcements', href: '/announcements', icon: '📢' },
  { label: 'Events', href: '/events', icon: '📅' },
  { label: 'Notifications', href: '/notifications', icon: '🔔' },
];

/** Filter nav items by the current user's role. */
export function visibleNavItems(items: NavItem[], userRole: string): NavItem[] {
  return items.filter(item => !item.roles || item.roles.includes(userRole));
}
