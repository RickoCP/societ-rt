/**
 * Quarantine Manifest Types
 *
 * Type definitions for the versioned quarantine manifest configuration.
 *
 * @see FASE 1.6 Task 3: Quarantine Manifest Configuration
 * @see INV-QUARANTINE-001: Quarantined users cannot receive Membership until explicit remediation
 * @see Requirements 1.7, 3.7, 11.8-9
 */

/**
 * Provenance information linking manifest to the source audit.
 */
export interface QuarantineProvenance {
  /** Source audit document reference */
  readonly source: string;
  /** Date the audit was performed (ISO 8601) */
  readonly auditDate: string;
  /** Locked decision reference (e.g., "L3") */
  readonly decision: string;
  /** Human-readable description of the quarantine decision */
  readonly description: string;
}

/**
 * Individual quarantined user entry.
 */
export interface QuarantinedUser {
  /** Platform anomaly alias (PNA-01, PNA-02, etc.) */
  readonly alias: string;
  /** User UUID to be excluded from authorization */
  readonly userId: string;
  /** Legacy tenant association (evidence only) */
  readonly legacyTenant: string;
  /** Legacy role (evidence only) */
  readonly legacyRole: string;
  /** Anomaly category classification */
  readonly category: string;
  /** Additional notes about the anomaly */
  readonly notes: string;
}

/**
 * Complete quarantine manifest structure.
 */
export interface QuarantineManifest {
  /** Schema version for forward compatibility */
  readonly $schema?: string;
  /** Manifest version (SemVer) */
  readonly version: string;
  /** Provenance linking to the source audit */
  readonly provenance: QuarantineProvenance;
  /** Invariant ID being enforced */
  readonly invariant: string;
  /** Human-readable invariant description */
  readonly invariantDescription: string;
  /** Expected number of quarantined users (used for validation) */
  readonly expectedCount: number;
  /** List of quarantined users */
  readonly quarantinedUsers: readonly QuarantinedUser[];
}

/**
 * Error codes for quarantine manifest operations.
 */
export type QuarantineManifestErrorCode =
  | 'MANIFEST_NOT_FOUND'
  | 'MANIFEST_MALFORMED'
  | 'MANIFEST_COUNT_MISMATCH'
  | 'MANIFEST_INVALID_UUID'
  | 'MANIFEST_DUPLICATE_UUID';

/**
 * Error thrown when quarantine manifest validation fails.
 */
export class QuarantineManifestError extends Error {
  constructor(
    public readonly code: QuarantineManifestErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'QuarantineManifestError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, QuarantineManifestError.prototype);
  }
}
