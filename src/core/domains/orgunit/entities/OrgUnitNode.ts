/**
 * OrgUnitNode — Tree node representation for OrgUnit hierarchy visualization.
 *
 * This entity represents a node in the OrgUnit tree view, enriched with
 * child nodes and aggregate counts for efficient tree rendering in the Admin UI.
 *
 * Used by the OrgUnit Tree Screen to display hierarchical organizational structure.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 7.2, 7.3 (OrgUnit Hierarchy Tree View)
 * @see Design Components and Interfaces > 6. OrgUnit Hierarchy Tree
 */

import type { OrgUnitType } from '../types';

/**
 * OrgUnitNode entity — a node in the OrgUnit tree view with children and aggregates.
 *
 * This is the hierarchical view model used by the Admin UI to render and navigate
 * the OrgUnit tree. It includes aggregate counts for efficient display without
 * additional queries.
 *
 * SECURITY CONSIDERATIONS:
 * - Tree is pre-filtered by user's authorization scope
 * - Member counts are aggregated server-side to prevent data leakage
 * - Children are recursively filtered to authorized scope
 */
export interface OrgUnitNode {
  /**
   * Unique identifier for this OrgUnit.
   */
  readonly id: string;

  /**
   * Reference to the owning Tenant (security boundary).
   */
  readonly tenantId: string;

  /**
   * Human-readable name for this OrgUnit.
   */
  readonly name: string;

  /**
   * Type of organizational unit in the hierarchy.
   * Used for icon display and type badge in tree view.
   */
  readonly type: OrgUnitType;

  /**
   * Count of members directly assigned to this OrgUnit.
   * Used for display badge in tree node.
   */
  readonly memberCount: number;

  /**
   * Count of direct children OrgUnits.
   * Used to determine if node is expandable.
   */
  readonly childCount: number;

  /**
   * Materialized path from root to this node.
   * Used for breadcrumb navigation and hierarchy validation.
   */
  readonly path: string[];

  /**
   * Depth level in the hierarchy tree (0 = root).
   */
  readonly depth: number;

  /**
   * Reference to the parent OrgUnit.
   * NULL for root OrgUnits.
   */
  readonly parentId: string | null;

  /**
   * Child nodes in the tree (recursively populated).
   * Empty array for leaf nodes (e.g., RT units with no children).
   */
  readonly children: OrgUnitNode[];

  /**
   * When the OrgUnit was created.
   */
  readonly createdAt: Date;

  /**
   * When the OrgUnit was last updated.
   */
  readonly updatedAt: Date;
}

/**
 * Flattened OrgUnit node without children for list views.
 * Used when a flat representation is needed (e.g., search results, dropdowns).
 */
export interface OrgUnitListItem {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly type: OrgUnitType;
  readonly memberCount: number;
  readonly childCount: number;
  readonly path: string[];
  readonly depth: number;
  readonly parentId: string | null;
  readonly parentName: string | null;
}

/**
 * Summary of an OrgUnit for compact display (e.g., dropdowns, selection dialogs).
 */
export interface OrgUnitSummary {
  readonly id: string;
  readonly name: string;
  readonly type: OrgUnitType;
  readonly path: string[];
  readonly depth: number;
}

/**
 * Helper function to check if a node has children.
 *
 * @param node - The OrgUnitNode to check
 * @returns true if the node has any children
 */
export function hasChildren(node: OrgUnitNode): boolean {
  return node.childCount > 0 || node.children.length > 0;
}

/**
 * Helper function to check if a node is a leaf (no children possible).
 * RT nodes are always leaf nodes in the hierarchy.
 *
 * @param node - The OrgUnitNode to check
 * @returns true if the node is a leaf node
 */
export function isLeafNode(node: OrgUnitNode): boolean {
  return node.type === 'RT' || node.childCount === 0;
}

/**
 * Helper function to get the display path as a string.
 *
 * @param node - The OrgUnitNode
 * @param separator - Path separator (default: ' > ')
 * @returns Formatted path string for breadcrumb display
 */
export function getDisplayPath(node: OrgUnitNode, separator = ' > '): string {
  // Note: In production, you'd resolve names from path IDs
  // This is a placeholder for the path display logic
  return node.path.join(separator);
}
