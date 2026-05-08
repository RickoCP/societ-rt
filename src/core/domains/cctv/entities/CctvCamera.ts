/**
 * CctvCamera — Domain entity representing a CCTV camera registered
 * within a tenant for community security monitoring.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 34.1, 34.6, 34.8
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type CctvCameraStatus = 'online' | 'offline' | 'motion_detected';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface CctvCamera {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  /** RTSP stream URL — encrypted at rest (AES-256). */
  readonly rtspUrl: string;
  readonly location: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly resolution: string;
  readonly status: CctvCameraStatus;
  readonly lastOnline: Date;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to register a new CCTV camera. */
export interface RegisterCctvCameraInput {
  readonly name: string;
  readonly rtspUrl: string;
  readonly location: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly resolution: string;
}
