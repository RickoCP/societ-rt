'use client';

/**
 * Sidebar — Enhanced navigation sidebar with collapsible sections.
 *
 * Features:
 * - Renders admin navigation items from navItems configuration
 * - Collapsible sections for Administration and Platform Admin
 * - Permission-based rendering (uses usePermissions hook)
 * - Active route highlighting
 * - Mobile responsive with slide-out menu support
 * - i18n support for section labels
 *
 * @see Requirements 22.4, 25.1-25.4, 25.10
 * @see Design > Navigation Item Configuration
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@presentation/hooks/usePermissions';

// ============================================================================
// Types
// ============================================================================

/**
 * Extended navigation item with permission support.
 */
export interface NavItem {
  /** Display label (i18n key or plain text) */
  label: string;
  /** Target route */
  href: string;
  /** Emoji or icon identifier */
  icon: string;
  /** Role-based visibility (legacy support) */
  roles?: string[];
  /** Permission-based visibility (new) */
  permissions?: string[];
  /**
   * Permission mode:
   * - 'all' (default): require ALL permissions
   * - 'any': require ANY of the permissions
   */
  permissionMode?: 'all' | 'any';
}

/**
 * Navigation section with collapsible items.
 */
export interface NavSection {
  /** Section identifier */
  id: string;
  /** Section label (i18n key) */
  label: string;
  /** Icon for collapsed state */
  icon?: string;
  /** Navigation items within this section */
  items: NavItem[];
  /** Roles that can see this section */
  roles?: string[];
  /** Permissions required to see this section */
  permissions?: string[];
  /** Permission mode for section */
  permissionMode?: 'all' | 'any';
  /** Whether section is collapsible */
  collapsible?: boolean;
  /** Default expanded state */
  defaultExpanded?: boolean;
}

export interface SidebarProps {
  /** Flat navigation items (legacy support) */
  items?: NavItem[];
  /** Grouped navigation sections (new) */
  sections?: NavSection[];
  /** User role for visibility filtering */
  userRole: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when navigation occurs (for mobile menu close) */
  onNavigate?: () => void;
  /** Whether sidebar is collapsed (controlled) */
  collapsed?: boolean;
  /** Callback when collapse state changes */
  onCollapseChange?: (collapsed: boolean) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Default navigation sections for admin UI */
export const DEFAULT_ADMIN_SECTIONS: NavSection[] = [
  {
    id: 'main',
    label: 'sidebar.sections.main',
    items: [
      { label: 'Dashboard', href: '/', icon: '🏠' },
    ],
    collapsible: false,
  },
  {
    id: 'general',
    label: 'sidebar.sections.general',
    items: [
      { label: 'Announcements', href: '/announcements', icon: '📢' },
      { label: 'Events', href: '/events', icon: '📅' },
      { label: 'Finance', href: '/finance', icon: '💰' },
      { label: 'Voting', href: '/voting', icon: '🗳️' },
      { label: 'Map', href: '/map', icon: '🗺️' },
    ],
    collapsible: true,
    defaultExpanded: true,
  },
  {
    id: 'administration',
    label: 'sidebar.sections.administration',
    icon: '⚙️',
    collapsible: true,
    defaultExpanded: true,
    permissions: ['membership:read', 'orgunit:read', 'tenant:manage'],
    permissionMode: 'any',
    items: [
      {
        label: 'Members',
        href: '/administration/members',
        icon: '👥',
        permissions: ['membership:read'],
      },
      {
        label: 'Organization',
        href: '/administration/orgunit',
        icon: '🏛️',
        permissions: ['orgunit:read'],
      },
      {
        label: 'Tenant Settings',
        href: '/administration/settings',
        icon: '⚙️',
        permissions: ['tenant:manage'],
      },
      {
        label: 'Subscription',
        href: '/administration/subscription',
        icon: '💳',
        permissions: ['tenant:manage'],
      },
      {
        label: 'Audit Log',
        href: '/administration/audit',
        icon: '📜',
        permissions: ['audit:read', 'tenant:manage'],
        permissionMode: 'any',
      },
    ],
  },
  {
    id: 'security',
    label: 'sidebar.sections.security',
    icon: '🛡️',
    collapsible: true,
    defaultExpanded: false,
    roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'],
    items: [
      { label: 'Security', href: '/security/patrols', icon: '🛡️', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
      { label: 'Incidents', href: '/security/incidents', icon: '⚠️', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
      { label: 'Visitors', href: '/visitors', icon: '🚶', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
      { label: 'Packages', href: '/packages', icon: '📦', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
      { label: 'Pintu Warga', href: '/door-monitoring', icon: '🚪', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
    ],
  },
  {
    id: 'platform-admin',
    label: 'sidebar.sections.platform_admin',
    icon: '🌐',
    collapsible: true,
    defaultExpanded: false,
    roles: ['Super_Admin', 'PLATFORM_ADMIN'],
    items: [
      {
        label: 'Platform Dashboard',
        href: '/admin/platform',
        icon: '🌐',
        roles: ['Super_Admin', 'PLATFORM_ADMIN'],
      },
      {
        label: 'All Tenants',
        href: '/admin/tenants',
        icon: '🏢',
        roles: ['Super_Admin', 'PLATFORM_ADMIN'],
      },
      {
        label: 'Security Events',
        href: '/admin/security',
        icon: '🔒',
        roles: ['Super_Admin', 'PLATFORM_ADMIN'],
      },
      {
        label: 'Users',
        href: '/users',
        icon: '👤',
        roles: ['Ketua_RT', 'Super_Admin'],
      },
      {
        label: 'Residents',
        href: '/residents',
        icon: '👥',
        roles: ['Ketua_RT', 'Pengurus', 'Super_Admin'],
      },
      {
        label: 'Registrasi Sensor',
        href: '/admin/door-sensors',
        icon: '🔧',
        roles: ['Super_Admin'],
      },
    ],
  },
  {
    id: 'other',
    label: 'sidebar.sections.other',
    collapsible: true,
    defaultExpanded: false,
    items: [
      { label: 'Ajukan Sensor', href: '/door-monitoring/request', icon: '📨', roles: ['Ketua_RT', 'Pengurus'] },
      { label: 'Administration', href: '/administration/letters', icon: '📋' },
      { label: 'Nomor Darurat', href: '/emergency-contacts', icon: '📞' },
      { label: 'Notifications', href: '/notifications', icon: '🔔' },
      { label: 'Audit Log', href: '/audit', icon: '📜', roles: ['Ketua_RT', 'Super_Admin'] },
    ],
  },
];

// ============================================================================
// Visibility Helpers
// ============================================================================

/**
 * Check if a navigation item should be visible based on role and permissions.
 */
function isItemVisible(
  item: NavItem,
  userRole: string,
  hasAllPermissions: (perms: string[]) => boolean,
  hasAnyPermission: (perms: string[]) => boolean,
): boolean {
  // Check role-based visibility first (legacy support)
  if (item.roles && item.roles.length > 0) {
    if (!item.roles.includes(userRole)) {
      return false;
    }
  }

  // Check permission-based visibility
  if (item.permissions && item.permissions.length > 0) {
    const mode = item.permissionMode ?? 'all';
    if (mode === 'all') {
      return hasAllPermissions(item.permissions);
    } else {
      return hasAnyPermission(item.permissions);
    }
  }

  return true;
}

/**
 * Check if a section should be visible based on role and permissions.
 */
function isSectionVisible(
  section: NavSection,
  userRole: string,
  hasAllPermissions: (perms: string[]) => boolean,
  hasAnyPermission: (perms: string[]) => boolean,
  visibleItems: NavItem[],
): boolean {
  // If no visible items, hide section
  if (visibleItems.length === 0) {
    return false;
  }

  // Check role-based visibility
  if (section.roles && section.roles.length > 0) {
    if (!section.roles.includes(userRole)) {
      return false;
    }
  }

  // Check permission-based visibility
  if (section.permissions && section.permissions.length > 0) {
    const mode = section.permissionMode ?? 'all';
    if (mode === 'all') {
      return hasAllPermissions(section.permissions);
    } else {
      return hasAnyPermission(section.permissions);
    }
  }

  return true;
}

/**
 * Filter items in a section based on role and permissions.
 */
function filterSectionItems(
  section: NavSection,
  userRole: string,
  hasAllPermissions: (perms: string[]) => boolean,
  hasAnyPermission: (perms: string[]) => boolean,
): NavItem[] {
  return section.items.filter(item =>
    isItemVisible(item, userRole, hasAllPermissions, hasAnyPermission),
  );
}

// ============================================================================
// Sidebar Component
// ============================================================================

export function Sidebar({
  items,
  sections = DEFAULT_ADMIN_SECTIONS,
  userRole,
  className = '',
  onNavigate,
  collapsed: controlledCollapsed,
  onCollapseChange,
}: SidebarProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { hasAllPermissions, hasAnyPermission, isLoading: permissionsLoading } = usePermissions();

  // Internal collapsed state (controlled or uncontrolled)
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;

  // Section expansion state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    sections.forEach(section => {
      if (section.defaultExpanded !== false && section.collapsible !== false) {
        initial.add(section.id);
      }
    });
    return initial;
  });

  // Persist expansion state to localStorage
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-expanded-sections');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        setExpandedSections(new Set(parsed));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'sidebar-expanded-sections',
      JSON.stringify(Array.from(expandedSections)),
    );
  }, [expandedSections]);

  // Toggle collapse state
  const handleCollapse = useCallback(() => {
    const newCollapsed = !collapsed;
    if (controlledCollapsed === undefined) {
      setInternalCollapsed(newCollapsed);
    }
    onCollapseChange?.(newCollapsed);
  }, [collapsed, controlledCollapsed, onCollapseChange]);

  // Toggle section expansion
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }, []);

  // Check if a route is active
  const isActiveRoute = useCallback(
    (href: string): boolean => {
      if (href === '/') {
        return pathname === '/';
      }
      return pathname === href || pathname.startsWith(href + '/');
    },
    [pathname],
  );

  // Process sections with visibility filtering
  const visibleSections = useMemo(() => {
    // If using legacy items prop, convert to a single section
    if (items && items.length > 0) {
      const visibleItems = items.filter(item =>
        isItemVisible(item, userRole, hasAllPermissions, hasAnyPermission),
      );
      return [
        {
          id: 'legacy',
          label: '',
          items: visibleItems,
          collapsible: false,
        } as NavSection,
      ];
    }

    // Process sections
    return sections
      .map(section => {
        const visibleItems = filterSectionItems(
          section,
          userRole,
          hasAllPermissions,
          hasAnyPermission,
        );
        return {
          ...section,
          items: visibleItems,
          _visible: isSectionVisible(
            section,
            userRole,
            hasAllPermissions,
            hasAnyPermission,
            visibleItems,
          ),
        };
      })
      .filter(section => section._visible);
  }, [items, sections, userRole, hasAllPermissions, hasAnyPermission]);

  // Translate section label
  const getSectionLabel = (section: NavSection): string => {
    if (!section.label) return '';
    // Try translation, fall back to original label
    const translated = t(section.label, { defaultValue: '' });
    return translated || section.label.split('.').pop() || section.label;
  };

  return (
    <aside
      className={`relative z-30 flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-200 dark:border-gray-700 dark:bg-gray-900 ${collapsed ? 'w-[68px]' : 'w-60'} ${className}`}
      aria-label={t('sidebar.aria_label', 'Sidebar navigation')}
      role="navigation"
    >
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
          onClick={handleCollapse}
          aria-label={collapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
          aria-expanded={!collapsed}
          className="flex w-full items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 overflow-y-auto px-3 pb-4"
        aria-label={t('sidebar.main_nav', 'Main navigation')}
      >
        {permissionsLoading ? (
          // Loading skeleton
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="h-9 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {visibleSections.map(section => (
              <SidebarSection
                key={section.id}
                section={section}
                collapsed={collapsed}
                isExpanded={expandedSections.has(section.id)}
                onToggleExpand={() => toggleSection(section.id)}
                isActiveRoute={isActiveRoute}
                onNavigate={onNavigate}
                getSectionLabel={getSectionLabel}
                t={t}
              />
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

interface SidebarSectionProps {
  section: NavSection;
  collapsed: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isActiveRoute: (href: string) => boolean;
  onNavigate?: () => void;
  getSectionLabel: (section: NavSection) => string;
  t: (key: string, defaultValue?: string) => string;
}

function SidebarSection({
  section,
  collapsed,
  isExpanded,
  onToggleExpand,
  isActiveRoute,
  onNavigate,
  getSectionLabel,
  t,
}: SidebarSectionProps) {
  const label = getSectionLabel(section);
  const isCollapsible = section.collapsible !== false;
  const showHeader = label && !collapsed && isCollapsible;

  // Check if any item in this section is active
  const hasActiveItem = section.items.some(item => isActiveRoute(item.href));

  return (
    <div className="mb-2">
      {/* Section Header (only for collapsible sections with labels) */}
      {showHeader && (
        <button
          type="button"
          onClick={onToggleExpand}
          className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider transition-colors ${
            hasActiveItem
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
          aria-expanded={isExpanded}
          aria-controls={`section-${section.id}`}
        >
          {section.icon && (
            <span className="text-sm" aria-hidden="true">
              {section.icon}
            </span>
          )}
          <span className="flex-1">{label}</span>
          <ChevronIcon
            direction={isExpanded ? 'down' : 'right'}
            className="h-3 w-3 text-gray-400 transition-transform group-hover:text-gray-600 dark:group-hover:text-gray-300"
          />
        </button>
      )}

      {/* Section Items */}
      <ul
        id={`section-${section.id}`}
        className={`space-y-0.5 ${showHeader && !isExpanded ? 'hidden' : ''} ${showHeader ? 'mt-1 pl-2' : ''}`}
        role="list"
      >
        {section.items.map(item => (
          <SidebarItem
            key={item.href}
            item={item}
            collapsed={collapsed}
            isActive={isActiveRoute(item.href)}
            onNavigate={onNavigate}
            t={t}
          />
        ))}
      </ul>
    </div>
  );
}

interface SidebarItemProps {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
  t: (key: string, defaultValue?: string) => string;
}

function SidebarItem({
  item,
  collapsed,
  isActive,
  onNavigate,
  t,
}: SidebarItemProps) {
  const icon = item.icon ?? '•';
  // Try to translate label, fall back to original
  const label = t(`sidebar.items.${item.label.toLowerCase().replace(/\s+/g, '_')}`, item.label);

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
          isActive
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
        }`}
        aria-current={isActive ? 'page' : undefined}
        title={collapsed ? label : undefined}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm ${
            isActive
              ? 'bg-blue-100 dark:bg-blue-900/50'
              : 'bg-gray-100 group-hover:bg-gray-200 dark:bg-gray-800 dark:group-hover:bg-gray-700'
          }`}
          aria-hidden="true"
        >
          {icon}
        </span>
        {!collapsed && <span className="truncate">{label}</span>}
        {isActive && !collapsed && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
        )}
      </Link>
    </li>
  );
}

// ============================================================================
// Icons
// ============================================================================

interface ChevronIconProps {
  direction: 'left' | 'right' | 'up' | 'down';
  className?: string;
}

function ChevronIcon({ direction, className = 'h-4 w-4' }: ChevronIconProps) {
  const paths: Record<string, string> = {
    left: 'M11 19l-7-7 7-7m8 14l-7-7 7-7',
    right: 'M13 5l7 7-7 7M5 5l7 7-7 7',
    up: 'M5 15l7-7 7 7',
    down: 'M19 9l-7 7-7-7',
  };

  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={paths[direction]}
      />
    </svg>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default Sidebar;
export type { SidebarProps, NavItem, NavSection };
