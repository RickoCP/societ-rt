'use client';

/**
 * MoveTargetSelectionDialog — Dialog for selecting target parent when moving an OrgUnit.
 *
 * Provides an accessible alternative to drag-and-drop for moving OrgUnits.
 * Displays a tree view of valid target OrgUnits, filtering out invalid destinations.
 *
 * Features:
 * - Tree view of valid target OrgUnits
 * - Invalid targets (self, descendants, incompatible types) are disabled
 * - Search/filter within the target tree
 * - Keyboard accessible
 * - Shows path breadcrumb for context
 * - Confirmation step with move preview
 *
 * @see Requirements 10.11 (Context menu as alternative to drag-and-drop)
 * @see Design Components > 6.5 Drag and Drop Validation
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { TreeView, type TreeNode } from '@presentation/components/organisms/TreeView';
import type { OrgUnitNode } from '@core/domains/orgunit/entities/OrgUnitNode';
import { OrgUnitType, canMoveToParent } from '@core/domains/orgunit/types';

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
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the MoveTargetSelectionDialog component.
 */
export interface MoveTargetSelectionDialogProps {
  /**
   * Whether the dialog is open.
   */
  open: boolean;

  /**
   * The OrgUnit being moved.
   */
  source: OrgUnitNode | null;

  /**
   * Full OrgUnit hierarchy for target selection.
   */
  hierarchy: OrgUnitNode[];

  /**
   * Whether the move operation is in progress.
   */
  loading?: boolean;

  /**
   * Callback when a target is selected and confirmed.
   * @param targetId - Selected target parent OrgUnit ID
   */
  onConfirm: (targetId: string) => void;

  /**
   * Callback when the dialog is cancelled.
   */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if targetId is a descendant of sourceId (cycle detection).
 */
function isDescendantOf(
  nodes: OrgUnitNode[],
  targetId: string,
  sourceId: string,
): boolean {
  const findNode = (nodeList: OrgUnitNode[], id: string): OrgUnitNode | null => {
    for (const node of nodeList) {
      if (node.id === id) return node;
      if (node.children.length > 0) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const sourceNode = findNode(nodes, sourceId);
  if (!sourceNode) return false;

  const checkDescendants = (node: OrgUnitNode): boolean => {
    if (node.id === targetId) return true;
    return node.children.some(child => checkDescendants(child));
  };

  return sourceNode.children.some(child => checkDescendants(child));
}

/**
 * Count descendants of a node.
 */
function countDescendants(node: OrgUnitNode): number {
  let count = 0;
  const traverse = (n: OrgUnitNode) => {
    count += n.children.length;
    n.children.forEach(traverse);
  };
  traverse(node);
  return count;
}

/**
 * Find a node by ID in the tree.
 */
function findNodeInTree(
  nodes: OrgUnitNode[],
  targetId: string,
): OrgUnitNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }
    if (node.children.length > 0) {
      const found = findNodeInTree(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Collect all OrgUnit IDs from the tree.
 */
function collectAllIds(nodes: OrgUnitNode[]): Set<string> {
  const ids = new Set<string>();

  const traverse = (nodeList: OrgUnitNode[]) => {
    for (const node of nodeList) {
      ids.add(node.id);
      if (node.children.length > 0) {
        traverse(node.children);
      }
    }
  };

  traverse(nodes);
  return ids;
}

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

/**
 * Validation result for a potential target.
 */
interface TargetValidation {
  valid: boolean;
  reason?: string;
}

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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * MoveTargetSelectionDialog — Dialog for selecting target parent for OrgUnit move.
 *
 * @example
 * ```tsx
 * <MoveTargetSelectionDialog
 *   open={showMoveDialog}
 *   source={selectedOrgUnit}
 *   hierarchy={orgUnitHierarchy}
 *   loading={isMoving}
 *   onConfirm={handleMoveConfirm}
 *   onCancel={() => setShowMoveDialog(false)}
 * />
 * ```
 */
export function MoveTargetSelectionDialog({
  open,
  source,
  hierarchy,
  loading = false,
  onConfirm,
  onCancel,
}: MoveTargetSelectionDialogProps) {
  const { t } = useTranslation();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const treeData = useMemo(() => toTreeNodes(hierarchy), [hierarchy]);

  const selectedTarget = useMemo(() => {
    if (!selectedTargetId) return null;
    return findNodeInTree(hierarchy, selectedTargetId);
  }, [hierarchy, selectedTargetId]);

  const affectedDescendantCount = useMemo(() => {
    if (!source) return 0;
    return countDescendants(source);
  }, [source]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate if a target OrgUnit is valid for the move operation.
   */
  const validateTarget = useCallback(
    (targetId: string): TargetValidation => {
      if (!source) {
        return { valid: false, reason: t('orgunit.move_no_source', 'No source selected') };
      }

      // Cannot move to self
      if (targetId === source.id) {
        return { valid: false, reason: t('orgunit.move_to_self_error', 'Cannot move to itself') };
      }

      const targetNode = findNodeInTree(hierarchy, targetId);
      if (!targetNode) {
        return { valid: false, reason: t('orgunit.move_target_not_found', 'Target not found') };
      }

      // Check cross-tenant (should not happen in same tree, but safety check)
      if (source.tenantId !== targetNode.tenantId) {
        return {
          valid: false,
          reason: t('orgunit.move_cross_tenant_error', 'Cannot move to a different tenant'),
        };
      }

      // Check type compatibility
      if (!canMoveToParent(source.type, targetNode.type)) {
        return {
          valid: false,
          reason: t('orgunit.move_type_error', 'Incompatible organization unit type'),
        };
      }

      // Check cycle prevention (target is a descendant of source)
      if (isDescendantOf(hierarchy, targetId, source.id)) {
        return {
          valid: false,
          reason: t('orgunit.move_cycle_error', 'Cannot move to a descendant'),
        };
      }

      // Check if it's the current parent (no change)
      if (source.parentId === targetId) {
        return {
          valid: false,
          reason: t('orgunit.move_same_parent', 'Already under this parent'),
        };
      }

      return { valid: true };
    },
    [source, hierarchy, t],
  );

  /**
   * Check if a target is valid (used for TreeView selection).
   */
  const isValidTarget = useCallback(
    (targetId: string): boolean => {
      return validateTarget(targetId).valid;
    },
    [validateTarget],
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleSelect = useCallback(
    (id: string) => {
      if (isValidTarget(id)) {
        setSelectedTargetId(id);
      }
    },
    [isValidTarget],
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(collectAllIds(hierarchy));
  }, [hierarchy]);

  const handleProceedToConfirm = useCallback(() => {
    if (selectedTargetId && isValidTarget(selectedTargetId)) {
      setShowConfirmation(true);
    }
  }, [selectedTargetId, isValidTarget]);

  const handleBackToSelection = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedTargetId) {
      onConfirm(selectedTargetId);
    }
  }, [selectedTargetId, onConfirm]);

  const handleCancel = useCallback(() => {
    setSelectedTargetId(null);
    setShowConfirmation(false);
    setSearchQuery('');
    onCancel();
  }, [onCancel]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTargetId(null);
      setShowConfirmation(false);
      setSearchQuery('');
      // Expand first two levels by default
      const initialExpanded = new Set<string>();
      hierarchy.forEach(node => {
        initialExpanded.add(node.id);
        node.children.forEach(child => initialExpanded.add(child.id));
      });
      setExpandedIds(initialExpanded);
    }
  }, [open, hierarchy]);

  // ---------------------------------------------------------------------------
  // Node Renderer
  // ---------------------------------------------------------------------------

  const renderNode = useCallback(
    (node: TreeNode<OrgUnitNode>, depth: number, isExpanded: boolean) => {
      const { data } = node;
      const config = ORGUNIT_TYPE_CONFIG[data.type];
      const validation = validateTarget(data.id);
      const isSelected = selectedTargetId === data.id;
      const isDisabled = !validation.valid;

      // Check if name matches search
      const matchesSearch =
        !searchQuery.trim() ||
        data.name.toLowerCase().includes(searchQuery.toLowerCase().trim());

      return (
        <div
          className={`flex items-center gap-2 py-1 ${
            isSelected
              ? 'rounded bg-blue-50 dark:bg-blue-900/20'
              : isDisabled
                ? 'opacity-50'
                : ''
          } ${!matchesSearch ? 'opacity-30' : ''}`}
          title={isDisabled ? validation.reason : undefined}>
          {/* Type Icon */}
          <span className="flex-shrink-0 text-lg" role="img" aria-label={config.label}>
            {config.icon}
          </span>

          {/* Name */}
          <span
            className={`flex-1 truncate font-medium ${
              isSelected
                ? 'text-blue-700 dark:text-blue-400'
                : isDisabled
                  ? 'text-gray-400 dark:text-gray-500'
                  : 'text-gray-900 dark:text-white'
            }`}>
            {data.name}
          </span>

          {/* Type Badge */}
          <TypeBadge type={data.type} />

          {/* Disabled indicator */}
          {isDisabled && (
            <svg
              className="h-4 w-4 flex-shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          )}

          {/* Selected indicator */}
          {isSelected && (
            <svg
              className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
      );
    },
    [selectedTargetId, validateTarget, searchQuery],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!open || !source) return null;

  const sourcePath =
    source.path.length > 0 ? source.path.join(' > ') : source.name;
  const targetPath =
    selectedTarget && selectedTarget.path.length > 0
      ? [...selectedTarget.path, selectedTarget.name].join(' > ')
      : selectedTarget?.name ?? '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-target-dialog-title">
      <div className="mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2
            id="move-target-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-white">
            {showConfirmation
              ? t('orgunit.move_confirm_title', 'Confirm Move')
              : t('orgunit.move_select_target', 'Select Target Location')}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label={t('common.close', 'Close')}>
            <svg
              className="h-5 w-5"
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
        </div>

        {/* Source Info */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-700 dark:bg-gray-700/50">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('orgunit.move_moving', 'Moving')}
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

        {/* Content */}
        <div className="flex-1 overflow-hidden px-6 py-4">
          {showConfirmation ? (
            /* Confirmation View */
            <div className="space-y-4">
              {/* Target Info */}
              <div className="rounded-md bg-gray-50 p-4 dark:bg-gray-700/50">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t('orgunit.move_target', 'New location')}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="text-lg"
                    role="img"
                    aria-label={
                      selectedTarget
                        ? ORGUNIT_TYPE_CONFIG[selectedTarget.type].label
                        : ''
                    }>
                    {selectedTarget
                      ? ORGUNIT_TYPE_CONFIG[selectedTarget.type].icon
                      : ''}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {selectedTarget?.name}
                  </span>
                  {selectedTarget && <TypeBadge type={selectedTarget.type} />}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('orgunit.target_path', 'Path')}: {targetPath}
                </p>
              </div>

              {/* Descendants Warning */}
              {affectedDescendantCount > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-900/20">
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
                        {t(
                          'orgunit.move_descendants_warning_title',
                          'Descendant units will also be moved',
                        )}
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

              {/* Confirmation Message */}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t(
                  'orgunit.move_confirm_description',
                  'Are you sure you want to move this organizational unit? This will update the hierarchy structure.',
                )}
              </p>
            </div>
          ) : (
            /* Selection View */
            <div className="flex h-full flex-col space-y-4">
              {/* Search & Actions */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onClear={() => setSearchQuery('')}
                    placeholder={t(
                      'orgunit.move_search_placeholder',
                      'Search organization units...',
                    )}
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={handleExpandAll}>
                  {t('orgunit_tree.expand_all', 'Expand All')}
                </Button>
              </div>

              {/* Instructions */}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t(
                  'orgunit.move_select_instruction',
                  'Select a target location for the organization unit. Invalid targets are disabled.',
                )}
              </p>

              {/* Tree View */}
              <div className="flex-1 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                {treeData.length > 0 ? (
                  <TreeView<OrgUnitNode>
                    data={treeData}
                    renderNode={renderNode}
                    expandedIds={expandedIds}
                    onToggleExpand={handleToggleExpand}
                    selectedId={selectedTargetId ?? undefined}
                    onSelect={handleSelect}
                    ariaLabel={t('orgunit.move_target_tree', 'Target selection tree')}
                    className="min-h-[200px]"
                  />
                ) : (
                  <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                    {t('orgunit.move_no_targets', 'No available targets')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          {showConfirmation ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToSelection}
                disabled={loading}>
                {t('common.back', 'Back')}
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={loading}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirm}
                  loading={loading}>
                  {t('orgunit.confirm_move', 'Move')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {selectedTargetId && selectedTarget
                  ? t('orgunit.move_selected', 'Selected: {{name}}', {
                      name: selectedTarget.name,
                    })
                  : t('orgunit.move_no_selection', 'No target selected')}
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleProceedToConfirm}
                  disabled={!selectedTargetId || !isValidTarget(selectedTargetId)}>
                  {t('common.next', 'Next')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MoveTargetSelectionDialog;
