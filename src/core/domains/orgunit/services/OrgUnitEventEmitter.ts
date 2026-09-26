/**
 * OrgUnitEventEmitter — Domain event types and emitter interface for OrgUnit lifecycle.
 *
 * This module defines the events emitted during OrgUnit lifecycle operations:
 * - Creation (with hierarchy validation)
 * - Update (metadata changes)
 * - Move (hierarchy reorganization)
 * - Delete (single or subtree)
 * - Path Repair (data integrity fix)
 *
 * **EVENT TYPES:**
 * - ORGUNIT_CREATED: New OrgUnit added to hierarchy
 * - ORGUNIT_UPDATED: OrgUnit metadata changed
 * - ORGUNIT_MOVED: OrgUnit relocated in hierarchy
 * - ORGUNIT_DELETED: OrgUnit removed from hierarchy
 * - ORGUNIT_SUBTREE_DELETED: Entire subtree removed
 * - ORGUNIT_PATH_REPAIRED: Path inconsistency corrected
 *
 * @see FASE 1.19 Task 57: OrgUnit Management Service
 * @see Requirements 21 (AC 1-9), Requirements 46 (AC 1-9)
 * @see Design OrgUnit Hierarchy Model
 */

import type { OrgUnitType } from '../types';

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

/**
 * Event types for OrgUnit lifecycle changes.
 * These events are emitted for audit and downstream systems.
 */
export enum OrgUnitEventType {
  /** New OrgUnit created in hierarchy */
  CREATED = 'ORGUNIT_CREATED',
  /** OrgUnit metadata updated (name, type) */
  UPDATED = 'ORGUNIT_UPDATED',
  /** OrgUnit moved to new parent in hierarchy */
  MOVED = 'ORGUNIT_MOVED',
  /** Single OrgUnit deleted */
  DELETED = 'ORGUNIT_DELETED',
  /** Entire subtree deleted (cascade) */
  SUBTREE_DELETED = 'ORGUNIT_SUBTREE_DELETED',
  /** Path inconsistency repaired */
  PATH_REPAIRED = 'ORGUNIT_PATH_REPAIRED',
}

/**
 * Base event payload for all OrgUnit events.
 */
export interface OrgUnitEventBase {
  /** The type of event */
  readonly type: OrgUnitEventType;
  /** The OrgUnit ID */
  readonly orgUnitId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** Timestamp of the event */
  readonly timestamp: Date;
  /** ID of the user who performed the action (for audit) */
  readonly performedBy?: string;
}

/**
 * Event payload for OrgUnit creation.
 */
export interface OrgUnitCreatedEvent extends OrgUnitEventBase {
  readonly type: OrgUnitEventType.CREATED;
  /** The OrgUnit name */
  readonly name: string;
  /** The OrgUnit type */
  readonly orgUnitType: OrgUnitType;
  /** The parent OrgUnit ID (null for root) */
  readonly parentId: string | null;
  /** The computed path */
  readonly path: string[];
  /** The computed depth */
  readonly depth: number;
}

/**
 * Event payload for OrgUnit metadata update.
 */
export interface OrgUnitUpdatedEvent extends OrgUnitEventBase {
  readonly type: OrgUnitEventType.UPDATED;
  /** Old name (if changed) */
  readonly oldName?: string;
  /** New name (if changed) */
  readonly newName?: string;
  /** Old type (if changed) */
  readonly oldType?: OrgUnitType;
  /** New type (if changed) */
  readonly newType?: OrgUnitType;
}

/**
 * Event payload for OrgUnit hierarchy move.
 */
export interface OrgUnitMovedEvent extends OrgUnitEventBase {
  readonly type: OrgUnitEventType.MOVED;
  /** The previous parent ID */
  readonly oldParentId: string | null;
  /** The new parent ID */
  readonly newParentId: string | null;
  /** The previous path */
  readonly oldPath: string[];
  /** The new path */
  readonly newPath: string[];
  /** The previous depth */
  readonly oldDepth: number;
  /** The new depth */
  readonly newDepth: number;
  /** Number of descendants also updated */
  readonly descendantsUpdated: number;
}

/**
 * Event payload for single OrgUnit deletion.
 */
export interface OrgUnitDeletedEvent extends OrgUnitEventBase {
  readonly type: OrgUnitEventType.DELETED;
  /** The OrgUnit name (for audit trail) */
  readonly name: string;
  /** The OrgUnit type */
  readonly orgUnitType: OrgUnitType;
  /** The parent ID at time of deletion */
  readonly parentId: string | null;
  /** Reason for deletion */
  readonly reason?: string;
}

/**
 * Event payload for subtree deletion.
 */
export interface OrgUnitSubtreeDeletedEvent extends OrgUnitEventBase {
  readonly type: OrgUnitEventType.SUBTREE_DELETED;
  /** The root OrgUnit name */
  readonly rootName: string;
  /** Count of OrgUnits deleted */
  readonly deletedCount: number;
  /** Reason for deletion */
  readonly reason?: string;
}

/**
 * Event payload for path repair.
 */
export interface OrgUnitPathRepairedEvent extends OrgUnitEventBase {
  readonly type: OrgUnitEventType.PATH_REPAIRED;
  /** Old (incorrect) path */
  readonly oldPath: string[];
  /** New (corrected) path */
  readonly newPath: string[];
  /** Old (incorrect) depth */
  readonly oldDepth: number;
  /** New (corrected) depth */
  readonly newDepth: number;
}

/**
 * Union type of all OrgUnit lifecycle events.
 */
export type OrgUnitLifecycleEvent =
  | OrgUnitCreatedEvent
  | OrgUnitUpdatedEvent
  | OrgUnitMovedEvent
  | OrgUnitDeletedEvent
  | OrgUnitSubtreeDeletedEvent
  | OrgUnitPathRepairedEvent;

// ---------------------------------------------------------------------------
// Event Emitter Interface
// ---------------------------------------------------------------------------

/**
 * Event emitter interface for OrgUnit lifecycle events.
 * Implementations can publish to event outbox, message queue, etc.
 */
export interface IOrgUnitEventEmitter {
  /**
   * Emit an OrgUnit lifecycle event.
   * @param event - The event to emit
   */
  emit(event: OrgUnitLifecycleEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Create an OrgUnit created event.
 */
export function createOrgUnitCreatedEvent(
  orgUnitId: string,
  tenantId: string,
  name: string,
  orgUnitType: OrgUnitType,
  parentId: string | null,
  path: string[],
  depth: number,
  performedBy?: string,
): OrgUnitCreatedEvent {
  return {
    type: OrgUnitEventType.CREATED,
    orgUnitId,
    tenantId,
    name,
    orgUnitType,
    parentId,
    path,
    depth,
    timestamp: new Date(),
    performedBy,
  };
}

/**
 * Create an OrgUnit updated event.
 */
export function createOrgUnitUpdatedEvent(
  orgUnitId: string,
  tenantId: string,
  changes: {
    oldName?: string;
    newName?: string;
    oldType?: OrgUnitType;
    newType?: OrgUnitType;
  },
  performedBy?: string,
): OrgUnitUpdatedEvent {
  return {
    type: OrgUnitEventType.UPDATED,
    orgUnitId,
    tenantId,
    ...changes,
    timestamp: new Date(),
    performedBy,
  };
}

/**
 * Create an OrgUnit moved event.
 */
export function createOrgUnitMovedEvent(
  orgUnitId: string,
  tenantId: string,
  oldParentId: string | null,
  newParentId: string | null,
  oldPath: string[],
  newPath: string[],
  oldDepth: number,
  newDepth: number,
  descendantsUpdated: number,
  performedBy?: string,
): OrgUnitMovedEvent {
  return {
    type: OrgUnitEventType.MOVED,
    orgUnitId,
    tenantId,
    oldParentId,
    newParentId,
    oldPath,
    newPath,
    oldDepth,
    newDepth,
    descendantsUpdated,
    timestamp: new Date(),
    performedBy,
  };
}

/**
 * Create an OrgUnit deleted event.
 */
export function createOrgUnitDeletedEvent(
  orgUnitId: string,
  tenantId: string,
  name: string,
  orgUnitType: OrgUnitType,
  parentId: string | null,
  reason?: string,
  performedBy?: string,
): OrgUnitDeletedEvent {
  return {
    type: OrgUnitEventType.DELETED,
    orgUnitId,
    tenantId,
    name,
    orgUnitType,
    parentId,
    reason,
    timestamp: new Date(),
    performedBy,
  };
}

/**
 * Create an OrgUnit subtree deleted event.
 */
export function createOrgUnitSubtreeDeletedEvent(
  orgUnitId: string,
  tenantId: string,
  rootName: string,
  deletedCount: number,
  reason?: string,
  performedBy?: string,
): OrgUnitSubtreeDeletedEvent {
  return {
    type: OrgUnitEventType.SUBTREE_DELETED,
    orgUnitId,
    tenantId,
    rootName,
    deletedCount,
    reason,
    timestamp: new Date(),
    performedBy,
  };
}

/**
 * Create an OrgUnit path repaired event.
 */
export function createOrgUnitPathRepairedEvent(
  orgUnitId: string,
  tenantId: string,
  oldPath: string[],
  newPath: string[],
  oldDepth: number,
  newDepth: number,
  performedBy?: string,
): OrgUnitPathRepairedEvent {
  return {
    type: OrgUnitEventType.PATH_REPAIRED,
    orgUnitId,
    tenantId,
    oldPath,
    newPath,
    oldDepth,
    newDepth,
    timestamp: new Date(),
    performedBy,
  };
}
