'use client';

/**
 * useOrgUnitTreeViewModel — ViewModel for the OrgUnit Tree screen.
 *
 * Provides state and actions for:
 * - Fetching hierarchical OrgUnit tree with React Query
 * - Managing expand/collapse state (persisted via adminUiStore)
 * - Managing search/filter state with highlighting
 * - Managing selected OrgUnit state
 * - Permission-based action visibility
 * - Drag-and-drop move operations with validation
 *
 * This ViewModel follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * @see Requirements 7.1-7.12 (OrgUnit Hierarchy Tree View)
 * @see Requirements 10.1-10.11 (OrgUnit Reparenting)
 * @see Design Components > 6. OrgUnit Hierarchy Tree
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@presentation/hooks/usePermissions';
import { useAdminUiStore } from '@infrastructure/stateManagement/adminUiStore';
import { useToastStore } from '@infrastructure/stateManagement/toastStore';
import { useSelectedAdminTenantId } from '@infrastructure/stateManagement/adminTenantSelectionStore';
import type { OrgUnitNode } from '@core/domains/orgunit/entities/OrgUnitNode';
import type { OrgUnitType } from '@core/domains/orgunit/types';
import { canMoveToParent } from '@core/domains/orgunit/types';
import type { AppError } from '@core/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * React Query cache key for OrgUnit tree queries.
 */
export const ORGUNIT_TREE_QUERY_KEY = 'orgUnitTree';

/**
 * Debounce delay for search input (ms).
 */
const SEARCH_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Pending move operation details for confirmation dialog.
 */
export interface PendingMoveOperation {
  /**
   * Source OrgUnit being moved.
   */
  readonly source: OrgUnitNode;

  /**
   * Target parent OrgUnit.
   */
  readonly target: OrgUnitNode;

  /**
   * Count of descendants that will be affected.
   */
  readonly affectedDescendantCount: number;
}

/**
 * Context menu move operation state.
 */
export interface ContextMenuMoveState {
  /**
   * Whether the move target selection dialog is open.
   */
  readonly isDialogOpen: boolean;

  /**
   * The source OrgUnit for the context menu move operation.
   */
  readonly source: OrgUnitNode | null;
}

/**
 * Move validation result for drag-and-drop.
 */
export interface MoveValidationResult {
  /**
   * Whether the move is valid.
   */
  readonly valid: boolean;

  /**
   * i18n error key if move is invalid.
   */
  readonly errorKey?: string;

  /**
   * Error details for debugging.
   */
  readonly errorDetails?: string;

  /**
   * Count of descendants that will be affected.
   */
  readonly affectedDescendantCount?: number;
}

/**
 * Return type of useOrgUnitTreeViewModel hook.
 */
export interface OrgUnitTreeViewModel {
  // ---------------------------------------------------------------------------
  // Data State (React Query)
  // ---------------------------------------------------------------------------

  /**
   * Hierarchical OrgUnit tree data.
   */
  hierarchy: OrgUnitNode[];

  /**
   * Whether data is being fetched.
   */
  isLoading: boolean;

  /**
   * Whether fetch has failed.
   */
  isError: boolean;

  /**
   * Error details if fetch failed.
   */
  error: AppError | null;

  // ---------------------------------------------------------------------------
  // Selection State
  // ---------------------------------------------------------------------------

  /**
   * Currently selected OrgUnit (for details panel).
   */
  selectedOrgUnit: OrgUnitNode | null;

  /**
   * ID of the currently selected OrgUnit.
   */
  selectedId: string | null;

  // ---------------------------------------------------------------------------
  // Expansion State (Persisted)
  // ---------------------------------------------------------------------------

  /**
   * Set of expanded OrgUnit IDs.
   */
  expandedIds: Set<string>;

  // ---------------------------------------------------------------------------
  // Search/Filter State
  // ---------------------------------------------------------------------------

  /**
   * Current search query string.
   */
  searchQuery: string;

  /**
   * Set of OrgUnit IDs that match the search (for highlighting).
   */
  highlightedIds: Set<string>;

  /**
   * Filtered hierarchy based on search (only shows matching nodes and ancestors).
   */
  filteredHierarchy: OrgUnitNode[];

  /**
   * Whether any search filter is active.
   */
  hasActiveSearch: boolean;

  // ---------------------------------------------------------------------------
  // Permission State
  // ---------------------------------------------------------------------------

  /**
   * Whether user has orgunit:read permission.
   */
  canRead: boolean;

  /**
   * Whether user has orgunit:write permission.
   */
  canWrite: boolean;

  // ---------------------------------------------------------------------------
  // Drag-and-Drop State
  // ---------------------------------------------------------------------------

  /**
   * Pending move operation awaiting confirmation.
   */
  pendingMove: PendingMoveOperation | null;

  /**
   * Whether a move operation is in progress.
   */
  isMoving: boolean;

  // ---------------------------------------------------------------------------
  // Context Menu Move State
  // ---------------------------------------------------------------------------

  /**
   * State for context menu move operation.
   */
  contextMenuMove: ContextMenuMoveState;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Toggle expand/collapse state of a single OrgUnit.
   * @param id - OrgUnit ID to toggle
   */
  toggleExpand: (id: string) => void;

  /**
   * Expand all OrgUnits in the tree.
   */
  expandAll: () => void;

  /**
   * Collapse all OrgUnits in the tree.
   */
  collapseAll: () => void;

  /**
   * Select an OrgUnit (for details panel).
   * @param id - OrgUnit ID to select
   */
  selectOrgUnit: (id: string) => void;

  /**
   * Clear OrgUnit selection.
   */
  clearSelection: () => void;

  /**
   * Update search query.
   * @param query - Search string
   */
  setSearchQuery: (query: string) => void;

  /**
   * Clear search query.
   */
  clearSearch: () => void;

  /**
   * Refetch the OrgUnit tree.
   */
  refetch: () => void;

  /**
   * Get all OrgUnit IDs from the hierarchy (for expand all).
   */
  getAllIds: () => Set<string>;

  /**
   * Find an OrgUnit node by ID.
   * @param id - OrgUnit ID to find
   */
  findNodeById: (id: string) => OrgUnitNode | null;

  // ---------------------------------------------------------------------------
  // Drag-and-Drop Actions
  // ---------------------------------------------------------------------------

  /**
   * Check if an OrgUnit can be dragged.
   * Non-root OrgUnits with orgunit:write permission can be dragged.
   * @param id - OrgUnit ID to check
   */
  canDrag: (id: string) => boolean;

  /**
   * Validate if a move from source to target is valid.
   * Used for drag-over highlighting.
   * @param sourceId - Source OrgUnit ID
   * @param targetId - Target parent OrgUnit ID
   */
  isValidDropTarget: (sourceId: string, targetId: string) => boolean;

  /**
   * Handle drop event - shows confirmation dialog.
   * @param sourceId - Source OrgUnit ID
   * @param targetId - Target parent OrgUnit ID
   */
  handleDrop: (sourceId: string, targetId: string) => void;

  /**
   * Confirm and execute the pending move operation.
   */
  confirmMove: () => Promise<void>;

  /**
   * Cancel the pending move operation.
   */
  cancelMove: () => void;

  // ---------------------------------------------------------------------------
  // Context Menu Move Actions
  // ---------------------------------------------------------------------------

  /**
   * Open the move target selection dialog for an OrgUnit (via context menu).
   * @param orgUnitId - The OrgUnit ID to move
   */
  openMoveDialog: (orgUnitId: string) => void;

  /**
   * Close the move target selection dialog.
   */
  closeMoveDialog: () => void;

  /**
   * Execute move from context menu dialog (target already selected).
   * @param targetId - The target parent OrgUnit ID
   */
  executeContextMenuMove: (targetId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch OrgUnit hierarchy tree from the API.
 */
async function fetchOrgUnitTree(
  targetTenantId: string | null,
): Promise<OrgUnitNode[]> {
  const query = targetTenantId
    ? `?tenantId=${encodeURIComponent(targetTenantId)}`
    : '';
  const response = await fetch(`/api/admin/orgunit/tree${query}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type:
        response.status === 401
          ? 'authentication'
          : response.status === 403
            ? 'authorization'
            : 'technical',
      code: errorData.code ?? 'ORGUNIT_TREE_FETCH_ERROR',
      message: errorData.message ?? `Failed to fetch OrgUnit tree: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: OrgUnitNode[] };

  if (!json.data) {
    throw {
      type: 'technical',
      code: 'ORGUNIT_TREE_INVALID_RESPONSE',
      message: 'Invalid response format from OrgUnit tree API',
    } as AppError;
  }

  return json.data;
}

/**
 * Move OrgUnit API call.
 */
async function moveOrgUnit(params: {
  orgUnitId: string;
  newParentId: string;
}): Promise<{ affectedDescendantCount: number }> {
  const response = await fetch('/api/admin/orgunit/move', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type: response.status === 400 ? 'business' : 'technical',
      code: errorData.code ?? 'ORGUNIT_MOVE_FAILED',
      message: errorData.message ?? `Failed to move OrgUnit: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: { affectedDescendantCount: number } };
  return json.data ?? { affectedDescendantCount: 0 };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Recursively collect all OrgUnit IDs from the tree.
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
 * Check if a node or any of its descendants match the search query.
 * Returns matching node IDs.
 */
function findMatchingNodes(
  nodes: OrgUnitNode[],
  query: string,
): Set<string> {
  const matchingIds = new Set<string>();
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) return matchingIds;

  const traverse = (nodeList: OrgUnitNode[]) => {
    for (const node of nodeList) {
      // Check if name matches
      if (node.name.toLowerCase().includes(normalizedQuery)) {
        matchingIds.add(node.id);
      }
      // Recursively check children
      if (node.children.length > 0) {
        traverse(node.children);
      }
    }
  };

  traverse(nodes);
  return matchingIds;
}

/**
 * Get all ancestor IDs for a set of node IDs.
 */
function getAncestorIds(
  nodes: OrgUnitNode[],
  targetIds: Set<string>,
): Set<string> {
  const ancestorIds = new Set<string>();

  const traverse = (nodeList: OrgUnitNode[], parentPath: string[]): boolean => {
    for (const node of nodeList) {
      const currentPath = [...parentPath, node.id];
      let hasMatchingDescendant = false;

      // Check if this node is a target
      if (targetIds.has(node.id)) {
        hasMatchingDescendant = true;
      }

      // Check children
      if (node.children.length > 0) {
        if (traverse(node.children, currentPath)) {
          hasMatchingDescendant = true;
        }
      }

      // If this node or any descendant matches, all ancestors need to be included
      if (hasMatchingDescendant) {
        parentPath.forEach(id => ancestorIds.add(id));
      }
    }

    return [...nodeList].some(
      n => targetIds.has(n.id) || ancestorIds.has(n.id),
    );
  };

  traverse(nodes, []);
  return ancestorIds;
}

/**
 * Filter tree to only include nodes that match or have matching descendants.
 */
function filterTree(
  nodes: OrgUnitNode[],
  matchingIds: Set<string>,
  ancestorIds: Set<string>,
): OrgUnitNode[] {
  return nodes
    .filter(node => matchingIds.has(node.id) || ancestorIds.has(node.id))
    .map(node => ({
      ...node,
      children: filterTree(node.children, matchingIds, ancestorIds),
    }));
}

/**
 * Check if targetId is a descendant of sourceId (cycle detection).
 */
function isDescendantOf(
  nodes: OrgUnitNode[],
  targetId: string,
  sourceId: string,
): boolean {
  const sourceNode = findNodeInTree(nodes, sourceId);
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

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useOrgUnitTreeViewModel — React hook for the OrgUnit Tree screen.
 *
 * @returns OrgUnitTreeViewModel with state and actions
 *
 * @example
 * ```tsx
 * const vm = useOrgUnitTreeViewModel();
 *
 * return (
 *   <TreeView
 *     data={vm.filteredHierarchy}
 *     expandedIds={vm.expandedIds}
 *     onToggleExpand={vm.toggleExpand}
 *     selectedId={vm.selectedId}
 *     onSelect={vm.selectOrgUnit}
 *     draggable={vm.canWrite}
 *     isValidDropTarget={vm.isValidDropTarget}
 *     onDrop={vm.handleDrop}
 *   />
 * );
 * ```
 */
export function useOrgUnitTreeViewModel(): OrgUnitTreeViewModel {
  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();

  const canRead = hasPermission('orgunit:read');
  // Write actions (create/edit/delete/move) are gated on orgunit:manage —
  // the actual permission PLATFORM_ADMIN and TENANT_OWNER hold (there is no
  // 'orgunit:write' permission code in the registry).
  const canWrite = hasPermission('orgunit:manage');

  // Selected tenant for PLATFORM_ADMIN cross-tenant viewing (null = own tenant).
  const selectedTenantId = useSelectedAdminTenantId();

  // ---------------------------------------------------------------------------
  // Admin UI Store (Persisted Expansion State)
  // ---------------------------------------------------------------------------

  const {
    orgUnitExpandedIds,
    toggleOrgUnitExpand,
    expandAllOrgUnits,
    collapseAllOrgUnits,
  } = useAdminUiStore();

  // ---------------------------------------------------------------------------
  // Toast Store
  // ---------------------------------------------------------------------------

  const { addToast } = useToastStore();

  // ---------------------------------------------------------------------------
  // Query Client
  // ---------------------------------------------------------------------------

  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Local State
  // ---------------------------------------------------------------------------

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQueryState] = useState<string>('');
  const [pendingMove, setPendingMove] = useState<PendingMoveOperation | null>(null);
  const [contextMenuMoveSource, setContextMenuMoveSource] = useState<OrgUnitNode | null>(null);
  const [isContextMenuDialogOpen, setIsContextMenuDialogOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // React Query
  // ---------------------------------------------------------------------------

  const {
    data: hierarchy,
    isLoading: isQueryLoading,
    isError,
    error: queryError,
    refetch,
  } = useQuery<OrgUnitNode[], AppError>({
    queryKey: [ORGUNIT_TREE_QUERY_KEY, selectedTenantId],
    queryFn: () => fetchOrgUnitTree(selectedTenantId),
    enabled: canRead && !isPermissionsLoading,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ---------------------------------------------------------------------------
  // Move Mutation
  // ---------------------------------------------------------------------------

  const moveMutation = useMutation({
    mutationFn: moveOrgUnit,
    onSuccess: (data, variables) => {
      // Invalidate and refetch the tree
      queryClient.invalidateQueries({ queryKey: [ORGUNIT_TREE_QUERY_KEY] });
      
      // Show success toast
      addToast({
        type: 'success',
        message: `OrgUnit berhasil dipindahkan${data.affectedDescendantCount > 0 ? ` (${data.affectedDescendantCount} turunan terpengaruh)` : ''}`,
      });
    },
    onError: (error: AppError) => {
      // Show error toast
      addToast({
        type: 'error',
        message: error.message ?? 'Gagal memindahkan OrgUnit',
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const treeData = hierarchy ?? [];
  const isLoading = isPermissionsLoading || isQueryLoading;
  const isMoving = moveMutation.isPending;

  // Context menu move state
  const contextMenuMove: ContextMenuMoveState = useMemo(
    () => ({
      isDialogOpen: isContextMenuDialogOpen,
      source: contextMenuMoveSource,
    }),
    [isContextMenuDialogOpen, contextMenuMoveSource],
  );

  const error = useMemo<AppError | null>(() => {
    if (!queryError) return null;
    return queryError;
  }, [queryError]);

  // Search/filter state
  const hasActiveSearch = searchQuery.trim().length > 0;

  const highlightedIds = useMemo(() => {
    if (!hasActiveSearch) return new Set<string>();
    return findMatchingNodes(treeData, searchQuery);
  }, [treeData, searchQuery, hasActiveSearch]);

  const ancestorIds = useMemo(() => {
    if (!hasActiveSearch) return new Set<string>();
    return getAncestorIds(treeData, highlightedIds);
  }, [treeData, highlightedIds, hasActiveSearch]);

  const filteredHierarchy = useMemo(() => {
    if (!hasActiveSearch) return treeData;
    return filterTree(treeData, highlightedIds, ancestorIds);
  }, [treeData, highlightedIds, ancestorIds, hasActiveSearch]);

  // Selected OrgUnit
  const selectedOrgUnit = useMemo(() => {
    if (!selectedId) return null;
    return findNodeInTree(treeData, selectedId);
  }, [treeData, selectedId]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const toggleExpand = useCallback(
    (id: string) => {
      toggleOrgUnitExpand(id);
    },
    [toggleOrgUnitExpand],
  );

  const getAllIds = useCallback((): Set<string> => {
    return collectAllIds(treeData);
  }, [treeData]);

  const expandAll = useCallback(() => {
    const allIds = collectAllIds(treeData);
    expandAllOrgUnits(allIds);
  }, [treeData, expandAllOrgUnits]);

  const collapseAll = useCallback(() => {
    collapseAllOrgUnits();
  }, [collapseAllOrgUnits]);

  const selectOrgUnit = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    // Auto-expand matching nodes when searching
    if (query.trim()) {
      const matchIds = findMatchingNodes(treeData, query);
      const ancestors = getAncestorIds(treeData, matchIds);
      // Expand all ancestors of matching nodes
      const toExpand = new Set([...ancestors, ...matchIds]);
      expandAllOrgUnits(toExpand);
    }
  }, [treeData, expandAllOrgUnits]);

  const clearSearch = useCallback(() => {
    setSearchQueryState('');
  }, []);

  const findNodeById = useCallback(
    (id: string): OrgUnitNode | null => {
      return findNodeInTree(treeData, id);
    },
    [treeData],
  );

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  // ---------------------------------------------------------------------------
  // Drag-and-Drop Actions
  // ---------------------------------------------------------------------------

  const canDrag = useCallback(
    (id: string): boolean => {
      if (!canWrite) return false;
      
      const node = findNodeInTree(treeData, id);
      if (!node) return false;
      
      // Cannot drag root OrgUnits (no parent)
      return node.parentId !== null;
    },
    [canWrite, treeData],
  );

  const isValidDropTarget = useCallback(
    (sourceId: string, targetId: string): boolean => {
      // Cannot drop on self
      if (sourceId === targetId) return false;
      
      const sourceNode = findNodeInTree(treeData, sourceId);
      const targetNode = findNodeInTree(treeData, targetId);
      
      if (!sourceNode || !targetNode) return false;
      
      // Check 1: Cross-tenant (in this context, all nodes are same tenant)
      if (sourceNode.tenantId !== targetNode.tenantId) return false;
      
      // Check 2: Root OrgUnit cannot be moved
      if (sourceNode.parentId === null) return false;
      
      // Check 3: Type compatibility - source type must be valid child of target type
      if (!canMoveToParent(sourceNode.type, targetNode.type)) return false;
      
      // Check 4: Cycle detection - target cannot be a descendant of source
      if (isDescendantOf(treeData, targetId, sourceId)) return false;
      
      // Check 5: Cannot move to current parent (no-op)
      if (sourceNode.parentId === targetId) return false;
      
      return true;
    },
    [treeData],
  );

  const handleDrop = useCallback(
    (sourceId: string, targetId: string) => {
      // Validate the drop
      if (!isValidDropTarget(sourceId, targetId)) {
        return;
      }
      
      const sourceNode = findNodeInTree(treeData, sourceId);
      const targetNode = findNodeInTree(treeData, targetId);
      
      if (!sourceNode || !targetNode) return;
      
      // Count affected descendants
      const affectedDescendantCount = countDescendants(sourceNode);
      
      // Set pending move for confirmation dialog
      setPendingMove({
        source: sourceNode,
        target: targetNode,
        affectedDescendantCount,
      });
    },
    [treeData, isValidDropTarget],
  );

  const confirmMove = useCallback(async () => {
    if (!pendingMove) return;
    
    await moveMutation.mutateAsync({
      orgUnitId: pendingMove.source.id,
      newParentId: pendingMove.target.id,
    });
    
    setPendingMove(null);
  }, [pendingMove, moveMutation]);

  const cancelMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Context Menu Move Actions
  // ---------------------------------------------------------------------------

  const openMoveDialog = useCallback(
    (orgUnitId: string) => {
      const node = findNodeInTree(treeData, orgUnitId);
      if (!node) return;
      
      // Check if the node can be moved (not root)
      if (node.parentId === null) return;
      
      setContextMenuMoveSource(node);
      setIsContextMenuDialogOpen(true);
    },
    [treeData],
  );

  const closeMoveDialog = useCallback(() => {
    setContextMenuMoveSource(null);
    setIsContextMenuDialogOpen(false);
  }, []);

  const executeContextMenuMove = useCallback(
    async (targetId: string) => {
      if (!contextMenuMoveSource) return;
      
      await moveMutation.mutateAsync({
        orgUnitId: contextMenuMoveSource.id,
        newParentId: targetId,
      });
      
      closeMoveDialog();
    },
    [contextMenuMoveSource, moveMutation, closeMoveDialog],
  );

  // ---------------------------------------------------------------------------
  // Return ViewModel
  // ---------------------------------------------------------------------------

  return {
    // Data
    hierarchy: treeData,
    isLoading,
    isError,
    error,

    // Selection
    selectedOrgUnit,
    selectedId,

    // Expansion
    expandedIds: orgUnitExpandedIds,

    // Search
    searchQuery,
    highlightedIds,
    filteredHierarchy,
    hasActiveSearch,

    // Permissions
    canRead,
    canWrite,

    // Drag-and-Drop
    pendingMove,
    isMoving,

    // Context Menu Move
    contextMenuMove,

    // Actions
    toggleExpand,
    expandAll,
    collapseAll,
    selectOrgUnit,
    clearSelection,
    setSearchQuery,
    clearSearch,
    refetch: handleRefetch,
    getAllIds,
    findNodeById,

    // Drag-and-Drop Actions
    canDrag,
    isValidDropTarget,
    handleDrop,
    confirmMove,
    cancelMove,

    // Context Menu Move Actions
    openMoveDialog,
    closeMoveDialog,
    executeContextMenuMove,
  };
}

export default useOrgUnitTreeViewModel;
