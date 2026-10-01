'use client';

import {
  type KeyboardEvent,
  type DragEvent,
  useCallback,
  useRef,
  useState,
  useEffect,
} from 'react';
import { useBreakpoint, MIN_TOUCH_TARGET_SIZE } from '@presentation/hooks/useMediaQuery';

/**
 * Generic tree node interface for TreeView component
 */
export interface TreeNode<T> {
  id: string;
  data: T;
  children: TreeNode<T>[];
}

/**
 * Props for the TreeView component
 */
export interface TreeViewProps<T> {
  /** Tree data structure */
  data: TreeNode<T>[];
  /** Function to render each node's content */
  renderNode: (
    node: TreeNode<T>,
    depth: number,
    isExpanded: boolean,
  ) => React.ReactNode;
  /** Set of expanded node IDs */
  expandedIds: Set<string>;
  /** Callback when expand/collapse is toggled */
  onToggleExpand: (id: string) => void;
  /** Currently selected node ID */
  selectedId?: string;
  /** Callback when a node is selected */
  onSelect?: (id: string) => void;
  /** Enable drag-and-drop functionality */
  draggable?: boolean;
  /** Callback when a node is dropped onto another */
  onDrop?: (sourceId: string, targetId: string) => void;
  /** Validation function for drop targets */
  isValidDropTarget?: (sourceId: string, targetId: string) => boolean;
  /** Callback for keyboard navigation events */
  onKeyboardNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label for the tree */
  ariaLabel?: string;
  /**
   * Enable responsive design with full-width layout on mobile.
   * @see Requirements 23.3 (OrgUnit Tree full-width on mobile)
   * @default true
   */
  responsive?: boolean;
}

/**
 * Internal interface for tracking drag state
 */
interface DragState {
  sourceId: string | null;
  targetId: string | null;
  isValidTarget: boolean;
}

/**
 * TreeView component for displaying hierarchical data with expand/collapse,
 * keyboard navigation, and drag-and-drop support.
 *
 * @example
 * ```tsx
 * <TreeView
 *   data={orgUnitTree}
 *   renderNode={(node, depth, isExpanded) => (
 *     <span>{node.data.name}</span>
 *   )}
 *   expandedIds={expandedIds}
 *   onToggleExpand={handleToggle}
 *   selectedId={selectedId}
 *   onSelect={handleSelect}
 *   draggable
 *   onDrop={handleDrop}
 *   isValidDropTarget={validateDropTarget}
 * />
 * ```
 */
export function TreeView<T>({
  data,
  renderNode,
  expandedIds,
  onToggleExpand,
  selectedId,
  onSelect,
  draggable = false,
  onDrop,
  isValidDropTarget,
  onKeyboardNavigate,
  className = '',
  ariaLabel = 'Tree view',
  responsive = true,
}: TreeViewProps<T>) {
  const { isMobile, isTablet } = useBreakpoint();
  const treeRef = useRef<HTMLUListElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    sourceId: null,
    targetId: null,
    isValidTarget: false,
  });

  // Disable drag-and-drop on touch devices for better UX
  const effectiveDraggable = draggable && !isMobile;

  // Calculate responsive padding for tree depth
  const getNodePadding = useCallback((depth: number): number => {
    if (!responsive) return depth * 20 + 8;
    // Use smaller indentation on mobile to maximize space
    const baseIndent = isMobile ? 12 : isTablet ? 16 : 20;
    const basePadding = isMobile ? 4 : 8;
    return depth * baseIndent + basePadding;
  }, [responsive, isMobile, isTablet]);

  // Build flat list of visible nodes for keyboard navigation
  const getVisibleNodes = useCallback((): TreeNode<T>[] => {
    const result: TreeNode<T>[] = [];

    const traverse = (nodes: TreeNode<T>[]) => {
      for (const node of nodes) {
        result.push(node);
        if (expandedIds.has(node.id) && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };

    traverse(data);
    return result;
  }, [data, expandedIds]);

  // Get parent node for a given node ID
  const getParentNode = useCallback(
    (targetId: string): TreeNode<T> | null => {
      const findParent = (
        nodes: TreeNode<T>[],
        parent: TreeNode<T> | null,
      ): TreeNode<T> | null => {
        for (const node of nodes) {
          if (node.id === targetId) {
            return parent;
          }
          if (node.children.length > 0) {
            const found = findParent(node.children, node);
            if (found !== null || node.children.some(c => c.id === targetId)) {
              return found ?? node;
            }
          }
        }
        return null;
      };

      return findParent(data, null);
    },
    [data],
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      const visibleNodes = getVisibleNodes();
      const currentIndex = visibleNodes.findIndex(n => n.id === focusedId);

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          if (currentIndex < visibleNodes.length - 1) {
            const nextNode = visibleNodes[currentIndex + 1];
            if (nextNode) {
              setFocusedId(nextNode.id);
            }
          }
          onKeyboardNavigate?.('down');
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          if (currentIndex > 0) {
            const prevNode = visibleNodes[currentIndex - 1];
            if (prevNode) {
              setFocusedId(prevNode.id);
            }
          }
          onKeyboardNavigate?.('up');
          break;
        }
        case 'ArrowRight': {
          event.preventDefault();
          if (focusedId) {
            const node = visibleNodes.find(n => n.id === focusedId);
            if (node && node.children.length > 0) {
              if (!expandedIds.has(focusedId)) {
                // Expand if collapsed
                onToggleExpand(focusedId);
              } else {
                // Move to first child if expanded
                const firstChild = node.children[0];
                if (firstChild) {
                  setFocusedId(firstChild.id);
                }
              }
            }
          }
          onKeyboardNavigate?.('right');
          break;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          if (focusedId) {
            const node = visibleNodes.find(n => n.id === focusedId);
            if (node) {
              if (expandedIds.has(focusedId) && node.children.length > 0) {
                // Collapse if expanded
                onToggleExpand(focusedId);
              } else {
                // Move to parent if collapsed or no children
                const parent = getParentNode(focusedId);
                if (parent) {
                  setFocusedId(parent.id);
                }
              }
            }
          }
          onKeyboardNavigate?.('left');
          break;
        }
        case 'Enter':
        case ' ': {
          event.preventDefault();
          if (focusedId) {
            onSelect?.(focusedId);
          }
          break;
        }
        case 'Escape': {
          event.preventDefault();
          setFocusedId(null);
          // Clear drag state if dragging
          if (dragState.sourceId) {
            setDragState({
              sourceId: null,
              targetId: null,
              isValidTarget: false,
            });
          }
          break;
        }
        case 'Home': {
          event.preventDefault();
          const firstNode = visibleNodes[0];
          if (firstNode) {
            setFocusedId(firstNode.id);
          }
          break;
        }
        case 'End': {
          event.preventDefault();
          const lastNode = visibleNodes[visibleNodes.length - 1];
          if (lastNode) {
            setFocusedId(lastNode.id);
          }
          break;
        }
      }
    },
    [
      focusedId,
      getVisibleNodes,
      expandedIds,
      onToggleExpand,
      onSelect,
      onKeyboardNavigate,
      getParentNode,
      dragState.sourceId,
    ],
  );

  // Initialize focus on first node if not set
  useEffect(() => {
    if (focusedId === null && data.length > 0) {
      const firstNode = data[0];
      if (firstNode) {
        setFocusedId(firstNode.id);
      }
    }
  }, [data, focusedId]);

  // Update focus when selectedId changes externally
  useEffect(() => {
    if (selectedId) {
      setFocusedId(selectedId);
    }
  }, [selectedId]);

  // Drag event handlers
  const handleDragStart = useCallback(
    (event: DragEvent<HTMLLIElement>, nodeId: string) => {
      if (!draggable) return;

      event.dataTransfer.setData('text/plain', nodeId);
      event.dataTransfer.effectAllowed = 'move';

      setDragState(prev => ({
        ...prev,
        sourceId: nodeId,
      }));
    },
    [draggable],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLLIElement>, targetId: string) => {
      if (!draggable || !dragState.sourceId) return;

      event.preventDefault();

      // Don't allow dropping on self
      if (targetId === dragState.sourceId) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      const isValid = isValidDropTarget
        ? isValidDropTarget(dragState.sourceId, targetId)
        : true;

      event.dataTransfer.dropEffect = isValid ? 'move' : 'none';

      setDragState(prev => ({
        ...prev,
        targetId,
        isValidTarget: isValid,
      }));
    },
    [draggable, dragState.sourceId, isValidDropTarget],
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLLIElement>) => {
      if (!draggable) return;

      // Only clear target if we're leaving the tree item entirely
      const relatedTarget = event.relatedTarget as Node | null;
      const currentTarget = event.currentTarget;

      if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
        setDragState(prev => ({
          ...prev,
          targetId: null,
          isValidTarget: false,
        }));
      }
    },
    [draggable],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLIElement>, targetId: string) => {
      if (!draggable || !dragState.sourceId) return;

      event.preventDefault();

      const isValid = isValidDropTarget
        ? isValidDropTarget(dragState.sourceId, targetId)
        : true;

      if (isValid && onDrop) {
        onDrop(dragState.sourceId, targetId);
      }

      // Reset drag state
      setDragState({
        sourceId: null,
        targetId: null,
        isValidTarget: false,
      });
    },
    [draggable, dragState.sourceId, isValidDropTarget, onDrop],
  );

  const handleDragEnd = useCallback(() => {
    setDragState({
      sourceId: null,
      targetId: null,
      isValidTarget: false,
    });
  }, []);

  // Render a single tree node
  const renderTreeNode = useCallback(
    (node: TreeNode<T>, depth: number): React.ReactNode => {
      const isExpanded = expandedIds.has(node.id);
      const isSelected = selectedId === node.id;
      const isFocused = focusedId === node.id;
      const hasChildren = node.children.length > 0;
      const isDragSource = dragState.sourceId === node.id;
      const isDragTarget = dragState.targetId === node.id;
      const isValidTarget = isDragTarget && dragState.isValidTarget;
      const isInvalidTarget = isDragTarget && !dragState.isValidTarget;

      // Touch-friendly expand/collapse button size (44px minimum on mobile)
      const expandButtonSize = isMobile ? 'w-11 h-11' : 'w-5 h-5';
      const iconSize = isMobile ? 'w-5 h-5' : 'w-4 h-4';

      return (
        <li
          key={node.id}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={isSelected}
          aria-level={depth + 1}
          tabIndex={isFocused ? 0 : -1}
          draggable={effectiveDraggable}
          onDragStart={e => handleDragStart(e, node.id)}
          onDragOver={e => handleDragOver(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, node.id)}
          onDragEnd={handleDragEnd}
          onClick={e => {
            e.stopPropagation();
            setFocusedId(node.id);
            onSelect?.(node.id);
          }}
          className={`
            outline-none
            ${isDragSource ? 'opacity-50' : ''}
            ${isValidTarget ? 'ring-2 ring-blue-500 ring-offset-1 rounded bg-blue-50 dark:bg-blue-900/20' : ''}
            ${isInvalidTarget ? 'ring-2 ring-red-400 ring-offset-1 rounded bg-red-50 dark:bg-red-900/20' : ''}
          `}>
          <div
            className={`
              flex items-center gap-1 rounded-md cursor-pointer
              transition-colors duration-150
              ${isMobile ? 'py-2 px-2 min-h-[48px]' : 'py-1 px-2'}
              ${isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''}
              ${isFocused && !isSelected ? 'bg-gray-100 dark:bg-gray-800' : ''}
              hover:bg-gray-100 dark:hover:bg-gray-800
            `}
            style={{ paddingLeft: `${getNodePadding(depth)}px` }}>
            {/* Expand/collapse button - touch-friendly size on mobile */}
            {hasChildren ? (
              <button
                type="button"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                onClick={e => {
                  e.stopPropagation();
                  onToggleExpand(node.id);
                }}
                className={`flex-shrink-0 ${expandButtonSize} flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors touch-manipulation`}>
                <svg
                  className={`${iconSize} text-gray-500 dark:text-gray-400 transition-transform duration-150 ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
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
              </button>
            ) : (
              <span className={`flex-shrink-0 ${expandButtonSize}`} aria-hidden="true" />
            )}

            {/* Node content rendered by consumer */}
            <div className="flex-1 min-w-0">
              {renderNode(node, depth, isExpanded)}
            </div>
          </div>

          {/* Render children if expanded */}
          {hasChildren && isExpanded && (
            <ul role="group" className="list-none m-0 p-0">
              {node.children.map(child => renderTreeNode(child, depth + 1))}
            </ul>
          )}
        </li>
      );
    },
    [
      expandedIds,
      selectedId,
      focusedId,
      dragState,
      effectiveDraggable,
      isMobile,
      getNodePadding,
      handleDragStart,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleDragEnd,
      onSelect,
      onToggleExpand,
      renderNode,
    ],
  );

  if (data.length === 0) {
    return null;
  }

  return (
    <ul
      ref={treeRef}
      role="tree"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`list-none m-0 p-0 outline-none ${responsive && isMobile ? 'w-full' : ''} ${className}`}>
      {data.map(node => renderTreeNode(node, 0))}
    </ul>
  );
}

