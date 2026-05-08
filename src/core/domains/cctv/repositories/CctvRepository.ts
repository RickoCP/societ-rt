/**
 * CctvRepository — Core repository interface for CCTV camera
 * persistence and snapshot operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 34.1, 34.3, 34.4, 34.6, 34.8
 */

import type { DomainResult } from '@core/utils';
import type {
  CctvCamera,
  CctvCameraStatus,
  CctvSnapshot,
  CctvSnapshotTriggerType,
  CctvStorageUsage,
  RegisterCctvCameraInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Filter & pagination types
// ---------------------------------------------------------------------------

export interface CctvSnapshotFilters {
  readonly triggerType?: CctvSnapshotTriggerType;
  readonly from?: Date;
  readonly to?: Date;
}

export interface PaginatedCctvSnapshotResult {
  readonly data: CctvSnapshot[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface CctvRepository {
  /** Register a new CCTV camera within a tenant. */
  registerCamera(
    tenantId: string,
    data: RegisterCctvCameraInput,
  ): Promise<DomainResult<CctvCamera>>;

  /** Find all cameras for a tenant. */
  findByTenant(tenantId: string): Promise<DomainResult<CctvCamera[]>>;

  /** Update the status of a camera (online, offline, motion_detected). */
  updateStatus(
    tenantId: string,
    cameraId: string,
    status: CctvCameraStatus,
  ): Promise<DomainResult<CctvCamera>>;

  /** Capture and store a snapshot from a camera. */
  captureSnapshot(
    tenantId: string,
    cameraId: string,
    fileUrl: string,
    triggerType: CctvSnapshotTriggerType,
  ): Promise<DomainResult<CctvSnapshot>>;

  /** Find snapshots for a camera with pagination and optional filters. */
  findSnapshotsByCamera(
    tenantId: string,
    cameraId: string,
    page: number,
    pageSize: number,
    filters?: CctvSnapshotFilters,
  ): Promise<DomainResult<PaginatedCctvSnapshotResult>>;

  /** Get aggregated storage usage for a camera within a tenant. */
  getStorageUsage(
    tenantId: string,
    cameraId: string,
  ): Promise<DomainResult<CctvStorageUsage>>;
}
