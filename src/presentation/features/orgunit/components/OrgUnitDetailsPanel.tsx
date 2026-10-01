'use client';

/**
 * OrgUnitDetailsPanel — Component displaying detailed information about an OrgUnit.
 *
 * This component renders when a user clicks on an OrgUnit_Node in the tree view.
 * It displays:
 * - Full name, type, path breadcrumb
 * - Member count, child count, dates
 * - Tabbed interface: Details, Members
 * - Conditionally rendered Edit/Delete buttons based on permissions
 *
 * SECURITY CONSIDERATIONS:
 * - UI permission checks are for UX only; server-side authorization is enforced
 * - Delete button is permission-gated and requires confirmation
 * - Edit functionality requires `orgunit:write` permission
 *
 * @see Requirements 7.8 (OrgUnit Hierarchy Tree View - details panel)
 * @see Design Section 6.4 (OrgUnit Details Panel)
 */

import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { Badge } from '@presentation/components/atoms/Badge';
import { PermissionGuard } from '@presentation/components/atoms/PermissionGuard';
import { OrgUnitType } from '@core/domains/orgunit/types';
import type { OrgUnit } from '@core/domains/orgunit/entities/OrgUnit';
import type { OrgUnitNode } from '@core/domains/orgunit/entities/OrgUnitNode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tab options for the details panel.
 *
 * @see Design Section 6.4 (OrgUnit Details Panel - Tabs: Details, Members)
 */
export type OrgUnitDetailTab = 'details' | 'members';

/**
 * OrgUnit display data with computed path names for breadcrumb display.
 */
export interface OrgUnitDisplayData {
  /** The OrgUnit ID */
  id: string;
  /** Full name of the OrgUnit */
  name: string;
  /** Type of the OrgUnit */
  type: OrgUnitType;
  /** Path of OrgUnit IDs from root to this node */
  pathIds: string[];
  /** Resolved path names for breadcrumb display */
  pathNames: string[];
  /** Number of members directly assigned to this OrgUnit */
  memberCount: number;
  /** Number of direct children OrgUnits */
  childCount: number;
  /** When the OrgUnit was created */
  createdAt: Date;
  /** When the OrgUnit was last updated */
  updatedAt: Date;
  /** Parent OrgUnit ID (null for root) */
  parentId: string | null;
  /** Tenant ID (security boundary) */
  tenantId: string;
}

/**
 * Props for OrgUnitDetailsPanel component.
 */
export interface OrgUnitDetailsPanelProps {
  /** The OrgUnit to display (null when no selection) */
  orgUnit: OrgUnit | OrgUnitNode | OrgUnitDisplayData | null;

  /** Number of members directly assigned to this OrgUnit */
  memberCount: number;

  /** Number of direct children OrgUnits */
  childCount: number;

  /** Resolved path names for breadcrumb display (optional - will use IDs if not provided) */
  pathNames?: string[];

  /** Callback when Edit button is clicked */
  onEdit: () => void;

  /** Callback when Delete button is clicked */
  onDelete: () => void;

  /** Callback when "Add Child" button is clicked */
  onAddChild?: () => void;

  /** Callback when "Assign Members" button is clicked */
  onAssignMembers?: () => void;

  /** Callback when "View Members" or Members tab is clicked */
  onViewMembers?: () => void;

  /** Whether the user has write permission for OrgUnits */
  canWrite?: boolean;

  /** Whether to show loading skeleton */
  isLoading?: boolean;

  /** Content to render in the Members tab */
  membersTabContent?: ReactNode;

  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Format a date for display using locale-aware formatting.
 *
 * @param date - Date to format
 * @param locale - Locale string (e.g., 'id-ID', 'en-US')
 * @returns Formatted date string
 */
function formatDate(date: Date | string | undefined, locale = 'id-ID'): string {
  if (!date) return '-';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return '-';
  
  return dateObj.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get the display label for an OrgUnit type.
 *
 * @param type - OrgUnit type
 * @returns Translation key for the type label
 */
function getTypeTranslationKey(type: OrgUnitType): string {
  const typeKeys: Record<OrgUnitType, string> = {
    [OrgUnitType.ORGANIZATION]: 'orgunit.type.organization',
    [OrgUnitType.CLUSTER]: 'orgunit.type.cluster',
    [OrgUnitType.RW]: 'orgunit.type.rw',
    [OrgUnitType.RT]: 'orgunit.type.rt',
  };
  return typeKeys[type] ?? 'orgunit.type.unknown';
}

/**
 * Get the badge color variant for an OrgUnit type.
 * Maps OrgUnit types to existing Badge component variants.
 *
 * @param type - OrgUnit type
 * @returns Badge color variant (matching BadgeVariant type)
 */
function getTypeBadgeVariant(
  type: OrgUnitType,
): 'info' | 'success' | 'warning' | 'danger' | 'default' {
  const variants: Record<OrgUnitType, 'info' | 'success' | 'warning' | 'danger'> = {
    [OrgUnitType.ORGANIZATION]: 'info',      // Blue/info for top-level
    [OrgUnitType.CLUSTER]: 'warning',        // Yellow/warning for cluster
    [OrgUnitType.RW]: 'success',             // Green/success for RW
    [OrgUnitType.RT]: 'danger',              // Red/danger for RT (leaf)
  };
  return variants[type] ?? 'default';
}

/**
 * Get CSS classes for the type icon container.
 *
 * @param type - OrgUnit type
 * @returns CSS classes for the icon container
 */
function getTypeIconClasses(type: OrgUnitType): string {
  switch (type) {
    case OrgUnitType.ORGANIZATION:
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
    case OrgUnitType.CLUSTER:
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400';
    case OrgUnitType.RW:
      return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
    case OrgUnitType.RT:
      return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  }
}

/**
 * Get icon SVG path for an OrgUnit type.
 *
 * @param type - OrgUnit type
 * @returns SVG path data for the icon
 */
function getTypeIcon(type: OrgUnitType): string {
  // Icons based on hierarchy level
  switch (type) {
    case OrgUnitType.ORGANIZATION:
      // Building icon
      return 'M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3';
    case OrgUnitType.CLUSTER:
      // Grid/cluster icon
      return 'M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zm10 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6zM4 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2zm10 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2z';
    case OrgUnitType.RW:
      // Community/group icon
      return 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75';
    case OrgUnitType.RT:
      // Home/unit icon
      return 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zm9 0v12M9 21V11h6v10';
    default:
      // Default folder icon
      return 'M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z';
  }
}

/**
 * Normalize OrgUnit data from different source types.
 *
 * @param data - OrgUnit, OrgUnitNode, or OrgUnitDisplayData
 * @param memberCount - Override member count
 * @param childCount - Override child count
 * @param pathNames - Optional path names for breadcrumb
 */
function normalizeOrgUnitData(
  data: OrgUnit | OrgUnitNode | OrgUnitDisplayData,
  memberCount: number,
  childCount: number,
  pathNames?: string[],
): OrgUnitDisplayData {
  // Check if it's already OrgUnitDisplayData
  if ('pathIds' in data && 'pathNames' in data) {
    return {
      ...data,
      memberCount,
      childCount,
      pathNames: pathNames ?? data.pathNames,
    };
  }

  // It's OrgUnit or OrgUnitNode
  const orgUnit = data as OrgUnit | OrgUnitNode;
  
  return {
    id: orgUnit.id,
    name: orgUnit.name,
    type: orgUnit.type,
    pathIds: orgUnit.path,
    pathNames: pathNames ?? orgUnit.path,
    memberCount: 'memberCount' in orgUnit ? orgUnit.memberCount : memberCount,
    childCount: 'childCount' in orgUnit ? orgUnit.childCount : childCount,
    createdAt: orgUnit.createdAt,
    updatedAt: orgUnit.updatedAt,
    parentId: orgUnit.parentId,
    tenantId: orgUnit.tenantId,
  };
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Loading skeleton for the details panel.
 */
function DetailsPanelSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse ${className}`}
      role="status"
      aria-label="Loading OrgUnit details">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>

      {/* Breadcrumb skeleton */}
      <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded mb-6" />

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
        ))}
      </div>

      {/* Tabs skeleton */}
      <div className="h-10 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

/**
 * Empty state when no OrgUnit is selected.
 */
function EmptySelectionState({ className = '' }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
      <div className="mb-4 text-gray-400 dark:text-gray-500">
        <svg
          className="w-16 h-16"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        {t('orgunit.details.no_selection_title')}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t('orgunit.details.no_selection_description')}
      </p>
    </div>
  );
}

/**
 * Breadcrumb component for OrgUnit path display.
 */
function PathBreadcrumb({
  pathNames,
  className = '',
}: {
  pathNames: string[];
  className?: string;
}) {
  const { t } = useTranslation();

  if (pathNames.length === 0) return null;

  return (
    <nav
      aria-label={t('orgunit.details.path_breadcrumb_label')}
      className={`flex items-center flex-wrap gap-1 text-sm text-gray-500 dark:text-gray-400 ${className}`}>
      {pathNames.map((name, index) => (
        <span key={index} className="flex items-center">
          {index > 0 && (
            <svg
              className="w-4 h-4 mx-1 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
          <span
            className={
              index === pathNames.length - 1
                ? 'font-medium text-gray-900 dark:text-gray-100'
                : ''
            }>
            {name}
          </span>
        </span>
      ))}
    </nav>
  );
}

/**
 * Statistics card for displaying count/date information.
 */
function StatCard({
  label,
  value,
  icon,
  className = '',
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg ${className}`}>
      {icon && (
        <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
          {label}
        </p>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Tab button component.
 */
function TabButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`
        px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${
          isActive
            ? 'text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-900 border-b-2 border-blue-500'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        }
      `}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * OrgUnitDetailsPanel — Displays detailed information about an OrgUnit.
 *
 * @example
 * ```tsx
 * <OrgUnitDetailsPanel
 *   orgUnit={selectedOrgUnit}
 *   memberCount={42}
 *   childCount={5}
 *   pathNames={['Organization A', 'Cluster 1', 'RW 01']}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 *   canWrite={hasOrgUnitWritePermission}
 * />
 * ```
 */
export function OrgUnitDetailsPanel({
  orgUnit,
  memberCount,
  childCount,
  pathNames,
  onEdit,
  onDelete,
  onAddChild,
  onAssignMembers,
  onViewMembers,
  canWrite = false,
  isLoading = false,
  membersTabContent,
  className = '',
}: OrgUnitDetailsPanelProps): ReactNode {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<OrgUnitDetailTab>('details');

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const displayData = useMemo(() => {
    if (!orgUnit) return null;
    return normalizeOrgUnitData(orgUnit, memberCount, childCount, pathNames);
  }, [orgUnit, memberCount, childCount, pathNames]);

  const typeLabel = useMemo(() => {
    if (!displayData) return '';
    return t(getTypeTranslationKey(displayData.type));
  }, [displayData, t]);

  const typeBadgeVariant = useMemo(() => {
    if (!displayData) return 'gray';
    return getTypeBadgeVariant(displayData.type);
  }, [displayData]);

  const typeIconClasses = useMemo(() => {
    if (!displayData) return '';
    return getTypeIconClasses(displayData.type);
  }, [displayData]);

  const typeIconPath = useMemo(() => {
    if (!displayData) return '';
    return getTypeIcon(displayData.type);
  }, [displayData]);

  const isRootOrgUnit = useMemo(() => {
    return displayData?.parentId === null;
  }, [displayData]);

  const canAddChild = useMemo(() => {
    if (!displayData || !canWrite) return false;
    // RT is a leaf node, cannot have children
    return displayData.type !== OrgUnitType.RT;
  }, [displayData, canWrite]);

  const canDeleteOrgUnit = useMemo(() => {
    if (!displayData || !canWrite) return false;
    // Cannot delete if has children or members
    return displayData.childCount === 0 && displayData.memberCount === 0;
  }, [displayData, canWrite]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleTabChange = useCallback(
    (tab: OrgUnitDetailTab) => {
      setActiveTab(tab);
      if (tab === 'members' && onViewMembers) {
        onViewMembers();
      }
    },
    [onViewMembers],
  );

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return <DetailsPanelSkeleton className={className} />;
  }

  // ---------------------------------------------------------------------------
  // Empty State
  // ---------------------------------------------------------------------------

  if (!orgUnit || !displayData) {
    return <EmptySelectionState className={className} />;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}
      role="region"
      aria-label={t('orgunit.details.panel_label', { name: displayData.name })}>
      {/* Header Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Type Icon */}
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${typeIconClasses}`}
              aria-hidden="true">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={typeIconPath} />
              </svg>
            </div>

            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {displayData.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={typeBadgeVariant}>
                  {typeLabel}
                </Badge>
                {isRootOrgUnit && (
                  <Badge variant="default">
                    {t('orgunit.details.root_badge')}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <PermissionGuard permissions={['orgunit:write']} showLoading={false}>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Add Child Button */}
              {canAddChild && onAddChild && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddChild}
                  aria-label={t('orgunit.actions.add_child_aria', {
                    name: displayData.name,
                  })}>
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t('orgunit.actions.add_child')}
                </Button>
              )}

              {/* Edit Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                aria-label={t('orgunit.actions.edit_aria', { name: displayData.name })}>
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                {t('common.edit')}
              </Button>

              {/* Delete Button */}
              <Button
                variant="danger"
                size="sm"
                onClick={onDelete}
                disabled={!canDeleteOrgUnit}
                title={
                  !canDeleteOrgUnit
                    ? t('orgunit.delete_has_children')
                    : undefined
                }
                aria-label={t('orgunit.actions.delete_aria', {
                  name: displayData.name,
                })}>
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"
                  />
                </svg>
                {t('common.delete')}
              </Button>
            </div>
          </PermissionGuard>
        </div>

        {/* Path Breadcrumb */}
        <PathBreadcrumb pathNames={displayData.pathNames} className="mt-3" />
      </div>

      {/* Statistics Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-3">
          {/* Member Count */}
          <StatCard
            label={t('orgunit.details.member_count_label')}
            value={displayData.memberCount.toLocaleString(i18n.language)}
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"
                />
              </svg>
            }
          />

          {/* Child Count */}
          <StatCard
            label={t('orgunit.details.child_count_label')}
            value={displayData.childCount.toLocaleString(i18n.language)}
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"
                />
              </svg>
            }
          />

          {/* Created Date */}
          <StatCard
            label={t('orgunit.details.created_at_label')}
            value={formatDate(displayData.createdAt, i18n.language)}
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"
                />
              </svg>
            }
          />

          {/* Updated Date */}
          <StatCard
            label={t('orgunit.details.updated_at_label')}
            value={formatDate(displayData.updatedAt, i18n.language)}
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"
                />
              </svg>
            }
          />
        </div>
      </div>

      {/* Tabs Section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab Headers */}
        <div
          className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
          role="tablist"
          aria-label={t('orgunit.details.tabs_label')}>
          <TabButton
            isActive={activeTab === 'details'}
            onClick={() => handleTabChange('details')}>
            {t('orgunit.details.tab_details')}
          </TabButton>
          <TabButton
            isActive={activeTab === 'members'}
            onClick={() => handleTabChange('members')}>
            {t('orgunit.details.tab_members')}
            <span className="ml-1.5 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {displayData.memberCount}
            </span>
          </TabButton>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-4" role="tabpanel">
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* OrgUnit ID */}
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('orgunit.details.field_id')}
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
                  {displayData.id}
                </dd>
              </div>

              {/* Full Name */}
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('orgunit.details.field_name')}
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {displayData.name}
                </dd>
              </div>

              {/* Type */}
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('orgunit.details.field_type')}
                </dt>
                <dd className="mt-1">
                  <Badge variant={typeBadgeVariant}>
                    {typeLabel}
                  </Badge>
                </dd>
              </div>

              {/* Hierarchy Path */}
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('orgunit.details.field_path')}
                </dt>
                <dd className="mt-1">
                  <PathBreadcrumb pathNames={displayData.pathNames} />
                </dd>
              </div>

              {/* Depth */}
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('orgunit.details.field_depth')}
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {displayData.pathIds.length - 1}
                </dd>
              </div>

              {/* Tenant ID */}
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('orgunit.details.field_tenant_id')}
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
                  {displayData.tenantId}
                </dd>
              </div>

              {/* Parent ID */}
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('orgunit.details.field_parent_id')}
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
                  {displayData.parentId ?? t('orgunit.details.no_parent')}
                </dd>
              </div>
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-4">
              {/* Assign Members Button (permission-gated) */}
              <PermissionGuard permissions={['membership:write']} showLoading={false}>
                {onAssignMembers && (
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onAssignMembers}
                      aria-label={t('orgunit.actions.assign_members_aria', {
                        name: displayData.name,
                      })}>
                      <svg
                        className="w-4 h-4 mr-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM3 20a6 6 0 0 1 12 0v1H3v-1z"
                        />
                      </svg>
                      {t('orgunit.actions.assign_members')}
                    </Button>
                  </div>
                )}
              </PermissionGuard>

              {/* Members Tab Content */}
              {membersTabContent ? (
                membersTabContent
              ) : displayData.memberCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 text-gray-400 dark:text-gray-500">
                    <svg
                      className="w-12 h-12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('orgunit.details.no_members')}
                  </p>
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  {t('orgunit.details.members_placeholder', {
                    count: displayData.memberCount,
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  formatDate,
  getTypeTranslationKey,
  getTypeBadgeVariant,
  getTypeIconClasses,
  getTypeIcon,
  normalizeOrgUnitData,
  DetailsPanelSkeleton,
  EmptySelectionState,
  PathBreadcrumb,
  StatCard,
  TabButton,
};

export default OrgUnitDetailsPanel;
