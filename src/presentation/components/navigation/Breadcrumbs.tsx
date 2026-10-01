'use client';

/**
 * Breadcrumbs — Auto-generated navigation breadcrumbs from current route.
 *
 * Features:
 * - Auto-generates breadcrumbs from current route path
 * - Support custom labels via page metadata/configuration
 * - Clickable breadcrumb items for navigation
 * - Dynamic route segment support (e.g., /platform/tenants/[id])
 * - i18n support for breadcrumb labels
 * - Accessible with proper ARIA labels
 *
 * @see Requirements 25.9
 * @see Design > Routing & Navigation
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';

// ============================================================================
// Types
// ============================================================================

/**
 * Single breadcrumb item representation.
 */
export interface BreadcrumbItem {
  /** Display label (supports i18n keys) */
  label: string;
  /** Route path for navigation */
  href: string;
  /** Whether this is the current/active page */
  isCurrent: boolean;
  /** Original path segment (for debugging/custom logic) */
  segment: string;
}

/**
 * Custom label configuration for specific routes.
 */
export interface BreadcrumbLabelConfig {
  /** Path pattern (can include [param] placeholders) */
  pattern: string;
  /** Label to display (i18n key or plain text) */
  label: string;
  /** Optional: Skip this segment in breadcrumbs */
  skip?: boolean;
}

export interface BreadcrumbsProps {
  /** Custom label configurations for specific routes */
  customLabels?: BreadcrumbLabelConfig[];
  /** Dynamic labels for route parameters (e.g., { tenantId: 'Tenant ABC' }) */
  dynamicLabels?: Record<string, string>;
  /** Whether to show home/dashboard as first breadcrumb */
  showHome?: boolean;
  /** Custom home label (defaults to 'Dashboard') */
  homeLabel?: string;
  /** Home route (defaults to '/') */
  homePath?: string;
  /** Maximum number of breadcrumbs to show (truncates middle items) */
  maxItems?: number;
  /** Separator between breadcrumb items */
  separator?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Callback when breadcrumb is clicked (for analytics/tracking) */
  onNavigate?: (item: BreadcrumbItem) => void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default breadcrumb label mappings.
 * Maps route segments to i18n keys or display labels.
 */
const DEFAULT_LABEL_MAPPINGS: Record<string, string> = {
  // Root
  dashboard: 'breadcrumb.dashboard',
  // Administration section
  administration: 'breadcrumb.administration',
  members: 'breadcrumb.members',
  orgunit: 'breadcrumb.orgunit',
  settings: 'breadcrumb.settings',
  subscription: 'breadcrumb.subscription',
  audit: 'breadcrumb.audit',
  // Profile/Config/Lifecycle tabs
  profile: 'breadcrumb.profile',
  config: 'breadcrumb.config',
  configuration: 'breadcrumb.configuration',
  lifecycle: 'breadcrumb.lifecycle',
  // Platform admin section
  admin: 'breadcrumb.admin',
  platform: 'breadcrumb.platform',
  tenants: 'breadcrumb.tenants',
  security: 'breadcrumb.security',
  // Other common segments
  invite: 'breadcrumb.invite',
  edit: 'breadcrumb.edit',
  create: 'breadcrumb.create',
  users: 'breadcrumb.users',
  notifications: 'breadcrumb.notifications',
  events: 'breadcrumb.events',
  announcements: 'breadcrumb.announcements',
  finance: 'breadcrumb.finance',
  voting: 'breadcrumb.voting',
  map: 'breadcrumb.map',
  visitors: 'breadcrumb.visitors',
  packages: 'breadcrumb.packages',
  residents: 'breadcrumb.residents',
};

/**
 * Default translations for breadcrumb labels.
 * These are used as fallbacks if i18n keys are not found.
 */
const FALLBACK_LABELS: Record<string, string> = {
  'breadcrumb.dashboard': 'Dashboard',
  'breadcrumb.administration': 'Administration',
  'breadcrumb.members': 'Members',
  'breadcrumb.orgunit': 'Organization',
  'breadcrumb.settings': 'Settings',
  'breadcrumb.subscription': 'Subscription',
  'breadcrumb.audit': 'Audit Log',
  'breadcrumb.profile': 'Profile',
  'breadcrumb.config': 'Configuration',
  'breadcrumb.configuration': 'Configuration',
  'breadcrumb.lifecycle': 'Lifecycle',
  'breadcrumb.admin': 'Admin',
  'breadcrumb.platform': 'Platform',
  'breadcrumb.tenants': 'Tenants',
  'breadcrumb.security': 'Security',
  'breadcrumb.invite': 'Invite',
  'breadcrumb.edit': 'Edit',
  'breadcrumb.create': 'Create',
  'breadcrumb.users': 'Users',
  'breadcrumb.notifications': 'Notifications',
  'breadcrumb.events': 'Events',
  'breadcrumb.announcements': 'Announcements',
  'breadcrumb.finance': 'Finance',
  'breadcrumb.voting': 'Voting',
  'breadcrumb.map': 'Map',
  'breadcrumb.visitors': 'Visitors',
  'breadcrumb.packages': 'Packages',
  'breadcrumb.residents': 'Residents',
};

/**
 * Segments to skip in breadcrumbs (route groups, etc.)
 */
const SKIP_SEGMENTS = new Set(['(dashboard)', '(auth)', '(public)']);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Checks if a segment is a dynamic route parameter (e.g., [id], [tenantId]).
 */
function isDynamicSegment(segment: string): boolean {
  return segment.startsWith('[') && segment.endsWith(']');
}

/**
 * Extracts the parameter name from a dynamic segment.
 */
function extractParamName(segment: string): string {
  return segment.slice(1, -1);
}

/**
 * Capitalizes the first letter of each word in a string.
 */
function capitalizeWords(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Matches a path against a pattern with [param] placeholders.
 */
function matchPattern(path: string, pattern: string): boolean {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);

  if (pathParts.length !== patternParts.length) {
    return false;
  }

  return patternParts.every((part, index) => {
    if (isDynamicSegment(part)) {
      return true; // Dynamic segments match anything
    }
    return part === pathParts[index];
  });
}

/**
 * Gets the label for a breadcrumb segment.
 */
function getSegmentLabel(
  segment: string,
  fullPath: string,
  customLabels: BreadcrumbLabelConfig[],
  dynamicLabels: Record<string, string>,
  t: (key: string, defaultValue?: string) => string,
): string | null {
  // Check if this segment should be skipped
  if (SKIP_SEGMENTS.has(segment)) {
    return null;
  }

  // Check custom labels first
  const customConfig = customLabels.find(config => matchPattern(fullPath, config.pattern));
  if (customConfig) {
    if (customConfig.skip) {
      return null;
    }
    const translated = t(customConfig.label, FALLBACK_LABELS[customConfig.label] ?? '');
    return translated || customConfig.label;
  }

  // Check if it's a dynamic segment
  if (isDynamicSegment(segment)) {
    const paramName = extractParamName(segment);
    // Look up in dynamic labels
    if (dynamicLabels[paramName]) {
      return dynamicLabels[paramName];
    }
    // Fallback to the parameter name capitalized
    return capitalizeWords(paramName);
  }

  // Check default label mappings
  const lowerSegment = segment.toLowerCase();
  const i18nKey = DEFAULT_LABEL_MAPPINGS[lowerSegment];
  if (i18nKey) {
    const translated = t(i18nKey, FALLBACK_LABELS[i18nKey] ?? '');
    return translated || capitalizeWords(segment);
  }

  // Fallback: capitalize the segment
  return capitalizeWords(segment);
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to generate breadcrumb items from the current route.
 */
function useBreadcrumbItems(
  customLabels: BreadcrumbLabelConfig[],
  dynamicLabels: Record<string, string>,
  showHome: boolean,
  homeLabel: string,
  homePath: string,
  t: (key: string, defaultValue?: string) => string,
): BreadcrumbItem[] {
  const pathname = usePathname();

  return useMemo(() => {
    const items: BreadcrumbItem[] = [];

    // Add home breadcrumb if enabled and not already on home
    if (showHome && pathname !== homePath) {
      const translatedHomeLabel = t(homeLabel, FALLBACK_LABELS[homeLabel] ?? 'Dashboard');
      items.push({
        label: translatedHomeLabel || 'Dashboard',
        href: homePath,
        isCurrent: false,
        segment: 'home',
      });
    }

    // Split pathname into segments
    const segments = pathname.split('/').filter(Boolean);

    // Build breadcrumb items
    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === segments.length - 1;

      const label = getSegmentLabel(
        segment,
        currentPath,
        customLabels,
        dynamicLabels,
        t,
      );

      // Skip if label is null (segment should be hidden)
      if (label === null) {
        return;
      }

      items.push({
        label,
        href: currentPath,
        isCurrent: isLast,
        segment,
      });
    });

    return items;
  }, [pathname, customLabels, dynamicLabels, showHome, homeLabel, homePath, t]);
}

// ============================================================================
// Components
// ============================================================================

/**
 * Default chevron separator component.
 */
function ChevronSeparator() {
  return (
    <svg
      className="mx-2 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
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
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

/**
 * Home icon component.
 */
function HomeIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
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
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

/**
 * Ellipsis component for truncated breadcrumbs.
 */
function EllipsisItem() {
  return (
    <li className="flex items-center">
      <ChevronSeparator />
      <span
        className="text-sm text-gray-400 dark:text-gray-500"
        aria-hidden="true"
      >
        …
      </span>
    </li>
  );
}

/**
 * Breadcrumbs Component
 *
 * Auto-generates navigation breadcrumbs from the current route path.
 * Supports custom labels, dynamic route parameters, and i18n.
 */
export function Breadcrumbs({
  customLabels = [],
  dynamicLabels = {},
  showHome = true,
  homeLabel = 'breadcrumb.dashboard',
  homePath = '/',
  maxItems,
  separator,
  className = '',
  onNavigate,
}: BreadcrumbsProps) {
  const { t } = useTranslation();

  const items = useBreadcrumbItems(
    customLabels,
    dynamicLabels,
    showHome,
    homeLabel,
    homePath,
    t,
  );

  // Truncate items if maxItems is specified
  const displayItems = useMemo(() => {
    if (!maxItems || items.length <= maxItems) {
      return { items, truncated: false };
    }

    // Keep first and last items, truncate middle
    const first = items.slice(0, 1);
    const last = items.slice(-(maxItems - 1));
    return {
      items: [...first, ...last],
      truncated: true,
      truncatedAt: 1,
    };
  }, [items, maxItems]);

  // Don't render if only home or current page
  if (items.length <= 1) {
    return null;
  }

  const handleClick = (item: BreadcrumbItem) => {
    onNavigate?.(item);
  };

  return (
    <nav
      className={`flex items-center ${className}`}
      aria-label={t('breadcrumb.aria_label', 'Breadcrumb navigation')}
    >
      <ol
        className="flex flex-wrap items-center gap-y-1"
        role="list"
      >
        {displayItems.items.map((item, index) => {
          const isFirst = index === 0;
          const showTruncation = displayItems.truncated && index === 1;

          return (
            <li
              key={item.href}
              className="flex items-center"
            >
              {/* Separator (not before first item) */}
              {!isFirst && (separator ?? <ChevronSeparator />)}

              {/* Ellipsis for truncated items */}
              {showTruncation && (
                <>
                  <span
                    className="mx-2 text-sm text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                  >
                    …
                  </span>
                  {separator ?? <ChevronSeparator />}
                </>
              )}

              {/* Breadcrumb item */}
              {item.isCurrent ? (
                <span
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  onClick={() => handleClick(item)}
                  className="group flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {/* Show home icon for first item if it's the home page */}
                  {isFirst && item.segment === 'home' && (
                    <HomeIcon />
                  )}
                  <span className="group-hover:underline">{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default Breadcrumbs;
export type { BreadcrumbsProps, BreadcrumbItem, BreadcrumbLabelConfig };
