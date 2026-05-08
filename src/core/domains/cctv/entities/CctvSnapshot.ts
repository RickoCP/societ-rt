/**
 * CctvSnapshot — Domain entity representing a still image captured
 * from a CCTV camera stream.
 *
 * Snapshots can be triggered manually by a Security_Guard, automatically
 * by motion detection, or on a configured schedule.
 *
 * @see Requirements 34.3, 34.4, 34.5
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type CctvSnapshotTriggerType = 'manual' | 'motion' | 'scheduled';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface CctvSnapshot {
  readonly id: string;
  readonly cameraId: string;
  readonly tenantId: string;
  readonly fileUrl: string;
  readonly triggerType: CctvSnapshotTriggerType;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Storage usage type
// ---------------------------------------------------------------------------

/** Aggregated storage usage for a camera within a tenant. */
export interface CctvStorageUsage {
  readonly cameraId: string;
  readonly tenantId: string;
  readonly totalSnapshots: number;
  readonly totalSizeBytes: number;
}
