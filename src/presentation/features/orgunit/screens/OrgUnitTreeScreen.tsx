'use client';

/**
 * OrgUnitTreeScreen — Admin screen for viewing and managing OrgUnit hierarchy.
 *
 * Displays a hierarchical tree view of organizational units within the user's
 * authorization scope. Supports search, expand/collapse, and selection for details.
 *
 * This screen follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * Features:
 * - TreeView for hierarchy visualization
 * - OrgUnit icons based on type
 * - Member count and type badge per node
 * - Expand/collapse with state persistence
 * - Search/filter by OrgUnit name with highlighting
 * - Loading skeleton while fetching
 * - Error state with retry button
 * - Delete with confirmation (Task 11.4)
 *
 * @see Requirements 7.1-7.12 (OrgUnit Hierarchy Tree View)
 * @see Requirements 8.9, 8.10 (OrgUnit Delete)
 * @see Design Components > 6. OrgUnit Hierarchy Tree
 */

import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PermissionGuard } from '@presentation/components/atoms/PermissionGuard';
import { TreeView, type TreeNode } from '@presentation/components/organisms/TreeView';
import { Button } from '@presentation/components/atoms/Button';
import { Spinner } from '@presentation/components/atoms/Spinner';
import { ConfirmDialog } from '@presentation/components/molecules/ConfirmDialog';
import { ContextMenu, type ContextMenuItem, type ContextMenuContent } from '@presentation/components/molecules/ContextMenu';
import { useOrgUnitTreeViewModel } from '../viewModel/useOrgUnitTreeViewModel';
import { useDeleteOrgUnit } from '../hooks/useDeleteOrgUnit';
import { OrgUnitDetailsPanel } from '../components/OrgUnitDetailsPanel';
import { MoveTargetSelectionDialog } from '../components/MoveTargetSelectionDialog';
import type { OrgUnitNode } from '@core/domains/orgunit/entities/OrgUnitNode';
import { OrgUnitType } from '@core/domains/orgunit/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * OrgUnit type display configuration.
 */
const ORGUNIT_TYPE_CONFIG: Record<
  OrgUnitType,
  { label: string; icon: string; badgeColor: string }
> = {
  [OrgUnitType.ORGANIZATION]: {
    label: 'Organization',
    icon: '🏢',
    badgeColor:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  [OrgUnitType.CLUSTER]: {
    label: 'Cluster',
    icon: '🏘️',
    badgeColor:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  [OrgUnitType.RW]: {
    label: 'RW',
    icon: '🏠',
    badgeColor:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  [OrgUnitType.RT]: {
    label: 'RT',
    icon: '🚪',
    badgeColor:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * OrgUnit type badge component.
 */
function TypeBadge({ type }: { type: OrgUnitType }) {
  const config = ORGUNIT_TYPE_CONFIG[type];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeColor}`}>
      {config.label}
    </span>
  );
}

/**
 * Member count badge component.
 */
function MemberCountBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
      <svg
        className="mr-1 h-3 w-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
      {count}
    </span>
  );
}

/**
 * Search input component.
 */
function SearchInput({
  value,
  onChange,
  onClear,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <svg
          className="h-4 w-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-10 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute inset-y-0 right-0 flex items-center pr-3">
          <svg
            className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Loading skeleton for the OrgUnit tree.
 */
function OrgUnitTreeSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Search skeleton */}
      <div className="h-10 w-64 rounded bg-gray-200 dark:bg-gray-700" />

      {/* Tree skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700"
              style={{ marginLeft: `${i * 16}px` }}
            />
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
        {/* Nested items */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`nested-${i}`} className="flex items-center gap-2 pl-8">
            <div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Error state component with retry button.
 */
function OrgUnitTreeError({
  error,
  onRetry,
}: {
  error: { code: string; message: string } | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 py-12 dark:border-red-900 dark:bg-red-900/20">
      <svg
        className="mb-4 h-12 w-12 text-red-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h3 className="text-lg font-medium text-red-800 dark:text-red-200">
        {t('orgunit_tree.fetch_error', 'Failed to load OrgUnit hierarchy')}
      </h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
        {t(
          'orgunit_tree.generic_error',
          'An error occurred while fetching the hierarchy. Please try again.',
        )}
      </p>
      {error?.code && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-500">
          {t('common.error_code', 'Error code: {{code}}', { code: error.code })}
        </p>
      )}
      <Button variant="primary" size="sm" onClick={onRetry} className="mt-4">
        {t('orgunit_tree.retry', 'Retry')}
      </Button>
    </div>
  );
}

/**
 * Empty state component when no OrgUnits exist.
 */
function OrgUnitTreeEmpty({ hasSearch }: { hasSearch: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 py-12 dark:border-gray-700 dark:bg-gray-800/50">
      <svg
        className="mb-4 h-12 w-12 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
        {hasSearch
          ? t('orgunit_tree.no_results', 'No matching OrgUnits')
          : t('orgunit_tree.empty', 'No organizational units')}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {hasSearch
          ? t(
              'orgunit_tree.no_results_description',
              'Try adjusting your search to find what you\'re looking for.',
            )
          : t(
              'orgunit_tree.empty_description',
              'Create organizational units to get started.',
            )}
      </p>
    </div>
  );
}

/**
 * Highlighted text component for search results.
 */
function HighlightedText({
  text,
  query,
  isHighlighted,
}: {
  text: string;
  query: string;
  isHighlighted: boolean;
}) {
  if (!isHighlighted || !query.trim()) {
    return <span>{text}</span>;
  }

  const normalizedQuery = query.toLowerCase().trim();
  const index = text.toLowerCase().indexOf(normalizedQuery);

  if (index === -1) {
    return <span>{text}</span>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <span>
      {before}
      <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-800">
        {match}
      </mark>
      {after}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tree Node Renderer
// ---------------------------------------------------------------------------

/**
 * Convert OrgUnitNode to TreeNode format.
 */
function toTreeNodes(nodes: OrgUnitNode[]): TreeNode<OrgUnitNode>[] {
  return nodes.map(node => ({
    id: node.id,
    data: node,
    children: toTreeNodes(node.children),
  }));
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * BlockingErrorDialog — Dialog shown when deletion is blocked.
 *
 * Displayed when attempting to delete an OrgUnit that has children or members.
 *
 * @see Requirements 8.9 (Blocking error for non-empty OrgUnits)
 */
function BlockingErrorDialog({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blocking-error-title">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* Error Icon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <svg
            className="h-6 w-6 text-red-600 dark:text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Title */}
        <h2
          id="blocking-error-title"
          className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>

        {/* Message */}
        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {message}
        </p>

        {/* Close Button */}
        <div className="flex justify-center">
          <Button variant="primary" size="sm" onClick={onClose}>
            {t('common.understood', 'Understood')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * MoveConfirmationDialog — Dialog for confirming OrgUnit move/reparent operation.
 *
 * Displays source and target paths, and warns about descendants and scope effects.
 *
 * @see Requirements 10.5, 10.6 (Move confirmation with path display and warnings)
 */
function MoveConfirmationDialog({
  open,
  source,
  target,
  affectedDescendantCount,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  source: OrgUnitNode | null;
  target: OrgUnitNode | null;
  affectedDescendantCount: number;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  if (!open || !source || !target) return null;

  const sourcePath = source.path.length > 0 ? source.path.join(' > ') : source.name;
  const targetPath = target.path.length > 0 ? [...target.path, target.name].join(' > ') : target.name;
  const hasDescendants = affectedDescendantCount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-confirm-title">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* Move Icon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <svg
            className="h-6 w-6 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        </div>

        {/* Title */}
        <h2
          id="move-confirm-title"
          className="mb-4 text-center text-lg font-semibold text-gray-900 dark:text-white">
          {t('orgunit.move_confirm_title', 'Move Organization Unit')}
        </h2>

        {/* Source and Target Paths */}
        <div className="mb-4 space-y-3">
          {/* Source */}
          <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-700/50">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('orgunit.move_source', 'Moving')}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="text-lg"
                role="img"
                aria-label={ORGUNIT_TYPE_CONFIG[source.type].label}>
                {ORGUNIT_TYPE_CONFIG[source.type].icon}
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {source.name}
              </span>
              <TypeBadge type={source.type} />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('orgunit.current_path', 'Current path')}: {sourcePath}
            </p>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <svg
              className="h-6 w-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>

          {/* Target */}
          <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-700/50">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('orgunit.move_target', 'To under')}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="text-lg"
                role="img"
                aria-label={ORGUNIT_TYPE_CONFIG[target.type].label}>
                {ORGUNIT_TYPE_CONFIG[target.type].icon}
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {target.name}
              </span>
              <TypeBadge type={target.type} />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('orgunit.target_path', 'Path')}: {targetPath}
            </p>
          </div>
        </div>

        {/* Warning about descendants */}
        {hasDescendants && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-900/20">
            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {t('orgunit.move_descendants_warning_title', 'Descendant units will also be moved')}
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  {t(
                    'orgunit.move_descendants_warning',
                    'This operation will also move {{count}} descendant unit(s). Member scopes may be affected.',
                    { count: affectedDescendantCount },
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* General warning */}
        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t(
            'orgunit.move_confirm_description',
            'Are you sure you want to move this organizational unit? This will update the hierarchy structure.',
          )}
        </p>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} loading={loading}>
            {t('orgunit.confirm_move', 'Move')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * OrgUnitTreeContent — The main content of the OrgUnit Tree screen.
 */
function OrgUnitTreeContent() {
  const { t } = useTranslation();
  const vm = useOrgUnitTreeViewModel();
  
  // ---------------------------------------------------------------------------
  // Delete Hook (Task 11.4)
  // ---------------------------------------------------------------------------
  
  const {
    state: deleteState,
    initiateDelete,
    confirmDelete,
    cancelDelete,
    closeBlockingError,
  } = useDeleteOrgUnit();

  // ---------------------------------------------------------------------------
  // Tree Data Conversion
  // ---------------------------------------------------------------------------

  const treeData = useMemo<TreeNode<OrgUnitNode>[]>(() => {
    return toTreeNodes(vm.filteredHierarchy);
  }, [vm.filteredHierarchy]);

  // ---------------------------------------------------------------------------
  // Node Renderer
  // ---------------------------------------------------------------------------

  const renderNode = useCallback(
    (
      node: TreeNode<OrgUnitNode>,
      depth: number,
      isExpanded: boolean,
    ): React.ReactNode => {
      const { data } = node;
      const config = ORGUNIT_TYPE_CONFIG[data.type];
      const isHighlighted = vm.highlightedIds.has(data.id);
      const isSelected = vm.selectedId === data.id;
      const canMove = vm.canWrite && data.parentId !== null;

      // Build context menu items
      const contextMenuItems: ContextMenuContent[] = [];

      if (vm.canWrite) {
        // Move option - only for non-root OrgUnits
        contextMenuItems.push({
          id: 'move',
          label: t('orgunit.context_menu.move', 'Move to...'),
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          ),
          disabled: !canMove,
          disabledTooltip: t('orgunit.move_root_error', 'Root OrgUnits cannot be moved'),
          onClick: () => vm.openMoveDialog(data.id),
        });

        // Delete option - only for empty non-root OrgUnits
        const canDelete =
          data.parentId !== null &&
          data.childCount === 0 &&
          data.memberCount === 0;

        contextMenuItems.push({ type: 'separator' });
        contextMenuItems.push({
          id: 'delete',
          label: t('orgunit.context_menu.delete', 'Delete'),
          icon: (
            <svg
              className="h-4 w-4"
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
          ),
          disabled: !canDelete,
          disabledTooltip:
            data.parentId === null
              ? t('orgunit.delete_root_error', 'Root OrgUnits cannot be deleted')
              : data.childCount > 0
                ? t('orgunit.delete_has_children', 'Cannot delete OrgUnit with child units')
                : t('orgunit.delete_has_members', 'Cannot delete OrgUnit with assigned members'),
          destructive: true,
          onClick: () => initiateDelete(data),
        });
      }

      const nodeContent = (
        <div
          className={`flex items-center gap-2 py-1 ${
            isHighlighted && vm.hasActiveSearch
              ? 'rounded bg-yellow-50 dark:bg-yellow-900/10'
              : ''
          }`}>
          {/* Type Icon */}
          <span className="flex-shrink-0 text-lg" role="img" aria-label={config.label}>
            {config.icon}
          </span>

          {/* Name with highlighting */}
          <span
            className={`flex-1 truncate font-medium ${
              isSelected
                ? 'text-blue-700 dark:text-blue-400'
                : 'text-gray-900 dark:text-white'
            }`}>
            <HighlightedText
              text={data.name}
              query={vm.searchQuery}
              isHighlighted={isHighlighted}
            />
          </span>

          {/* Type Badge */}
          <TypeBadge type={data.type} />

          {/* Member Count */}
          <MemberCountBadge count={data.memberCount} />

          {/* Child Count Indicator */}
          {data.childCount > 0 && !isExpanded && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              +{data.childCount}
            </span>
          )}
        </div>
      );

      // Wrap with context menu if user has write permission
      if (vm.canWrite && contextMenuItems.length > 0) {
        return (
          <ContextMenu
            items={contextMenuItems}
            enabled={true}
            ariaLabel={t('orgunit.context_menu.aria_label', 'Actions for {{name}}', {
              name: data.name,
            })}>
            {nodeContent}
          </ContextMenu>
        );
      }

      return nodeContent;
    },
    [vm.highlightedIds, vm.hasActiveSearch, vm.selectedId, vm.searchQuery, vm.canWrite, vm.openMoveDialog, initiateDelete, t],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Loading state
  if (vm.isLoading) {
    return <OrgUnitTreeSkeleton />;
  }

  // Error state
  if (vm.isError) {
    return <OrgUnitTreeError error={vm.error} onRetry={vm.refetch} />;
  }

  // Empty state
  if (vm.filteredHierarchy.length === 0) {
    return (
      <div className="space-y-4">
        {/* Search input */}
        <div className="flex items-center gap-4">
          <div className="w-64">
            <SearchInput
              value={vm.searchQuery}
              onChange={vm.setSearchQuery}
              onClear={vm.clearSearch}
              placeholder={t(
                'orgunit_tree.search_placeholder',
                'Search OrgUnits...',
              )}
            />
          </div>
        </div>

        <OrgUnitTreeEmpty hasSearch={vm.hasActiveSearch} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t('orgunit_tree.title', 'Organizational Structure')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t(
              'orgunit_tree.description',
              'View and manage the organizational hierarchy.',
            )}
          </p>
        </div>

        {/* Action buttons (placeholder for Task 11) */}
        {vm.canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={vm.expandAll}>
              {t('orgunit_tree.expand_all', 'Expand All')}
            </Button>
            <Button variant="secondary" size="sm" onClick={vm.collapseAll}>
              {t('orgunit_tree.collapse_all', 'Collapse All')}
            </Button>
          </div>
        )}
      </div>

      {/* Search and filters bar */}
      <div className="flex items-center gap-4">
        <div className="w-64">
          <SearchInput
            value={vm.searchQuery}
            onChange={vm.setSearchQuery}
            onClear={vm.clearSearch}
            placeholder={t('orgunit_tree.search_placeholder', 'Search OrgUnits...')}
          />
        </div>

        {vm.hasActiveSearch && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t('orgunit_tree.search_results', '{{count}} result(s) found', {
              count: vm.highlightedIds.size,
            })}
          </span>
        )}
      </div>

      {/* Tree View */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <TreeView<OrgUnitNode>
          data={treeData}
          renderNode={renderNode}
          expandedIds={vm.expandedIds}
          onToggleExpand={vm.toggleExpand}
          selectedId={vm.selectedId ?? undefined}
          onSelect={vm.selectOrgUnit}
          draggable={vm.canWrite}
          onDrop={vm.handleDrop}
          isValidDropTarget={vm.isValidDropTarget}
          ariaLabel={t('orgunit_tree.aria_label', 'Organizational unit tree')}
          className="min-h-[200px]"
        />
      </div>

      {/* Drag hint for users with write permission */}
      {vm.canWrite && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t(
            'orgunit_tree.drag_hint',
            'Tip: Drag and drop OrgUnits to reorganize, or right-click for more options.',
          )}
        </p>
      )}

      {/* Selection info (when an OrgUnit is selected) */}
      {vm.selectedOrgUnit && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="text-2xl"
                role="img"
                aria-label={ORGUNIT_TYPE_CONFIG[vm.selectedOrgUnit.type].label}>
                {ORGUNIT_TYPE_CONFIG[vm.selectedOrgUnit.type].icon}
              </span>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {vm.selectedOrgUnit.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {vm.selectedOrgUnit.path.join(' > ') || 'Root'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TypeBadge type={vm.selectedOrgUnit.type} />
              <MemberCountBadge count={vm.selectedOrgUnit.memberCount} />
              {/* Delete Button (Task 11.4) - Permission gated */}
              {vm.canWrite && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => initiateDelete(vm.selectedOrgUnit!)}
                  disabled={
                    vm.selectedOrgUnit.childCount > 0 ||
                    vm.selectedOrgUnit.memberCount > 0 ||
                    vm.selectedOrgUnit.parentId === null
                  }
                  title={
                    vm.selectedOrgUnit.parentId === null
                      ? t('orgunit.delete_root_error', 'Root OrgUnits cannot be deleted')
                      : vm.selectedOrgUnit.childCount > 0
                        ? t('orgunit.delete_has_children', 'Cannot delete OrgUnit with child units')
                        : vm.selectedOrgUnit.memberCount > 0
                          ? t('orgunit.delete_has_members', 'Cannot delete OrgUnit with assigned members')
                          : undefined
                  }
                  aria-label={t('orgunit.actions.delete_aria', 'Delete {{name}}', {
                    name: vm.selectedOrgUnit.name,
                  })}>
                  <svg
                    className="h-4 w-4"
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
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={vm.clearSelection}
                aria-label={t('orgunit_tree.close_details', 'Close details')}>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </Button>
            </div>
          </div>
          {/* Additional details would go here - Task 10.5 */}
        </div>
      )}

      {/* Delete Confirmation Dialog (Task 11.4) */}
      <ConfirmDialog
        open={deleteState.isConfirmDialogOpen}
        title={t('orgunit.delete_confirm_title', 'Delete Organization Unit')}
        description={
          deleteState.orgUnitToDelete
            ? t(
                'orgunit.delete_confirm',
                'Are you sure you want to delete "{{name}}"? This action cannot be undone.',
                { name: deleteState.orgUnitToDelete.name },
              )
            : ''
        }
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={deleteState.isDeleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* Move Confirmation Dialog (Task 13.3 - Requirements 10.5, 10.6) */}
      <MoveConfirmationDialog
        open={vm.pendingMove !== null}
        source={vm.pendingMove?.source ?? null}
        target={vm.pendingMove?.target ?? null}
        affectedDescendantCount={vm.pendingMove?.affectedDescendantCount ?? 0}
        loading={vm.isMoving}
        onConfirm={vm.confirmMove}
        onCancel={vm.cancelMove}
      />

      {/* Move Target Selection Dialog (Task 13.4 - Requirements 10.11) */}
      <MoveTargetSelectionDialog
        open={vm.contextMenuMove.isDialogOpen}
        source={vm.contextMenuMove.source}
        hierarchy={vm.hierarchy}
        loading={vm.isMoving}
        onConfirm={vm.executeContextMenuMove}
        onCancel={vm.closeMoveDialog}
      />

      {/* Blocking Error Dialog (Task 11.4 - Requirements 8.9) */}
      <BlockingErrorDialog
        open={deleteState.isBlockingErrorOpen}
        title={t('orgunit.delete_blocked_title', 'Cannot Delete Organization Unit')}
        message={deleteState.blockingError?.blockingMessage ?? ''}
        onClose={closeBlockingError}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

/**
 * OrgUnitTreeScreen — The OrgUnit Tree screen wrapped with PermissionGuard.
 *
 * Requires `orgunit:read` permission to access.
 *
 * @example
 * ```tsx
 * // In app/dashboard/orgunit/page.tsx
 * import { OrgUnitTreeScreen } from '@presentation/features/orgunit/screens/OrgUnitTreeScreen';
 *
 * export default function OrgUnitPage() {
 *   return <OrgUnitTreeScreen />;
 * }
 * ```
 */
export function OrgUnitTreeScreen() {
  const { t } = useTranslation();

  return (
    <PermissionGuard
      permissions={['orgunit:read']}
      fallback={
        <div className="flex flex-col items-center justify-center py-12">
          <svg
            className="mb-4 h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            {t('orgunit_tree.unauthorized', 'Access Denied')}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t(
              'orgunit_tree.unauthorized_description',
              'You do not have permission to view the organizational structure.',
            )}
          </p>
        </div>
      }>
      <OrgUnitTreeContent />
    </PermissionGuard>
  );
}

export default OrgUnitTreeScreen;
