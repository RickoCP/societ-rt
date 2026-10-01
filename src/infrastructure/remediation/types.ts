/**
 * Legacy Data Remediation Types
 *
 * Type definitions for the evidence-based remediation workflow.
 * This module supports remediation of users without Membership records
 * while explicitly excluding quarantined platform anomalies.
 *
 * @see Task 33: Evidence-Based Remediation Workflow
 * @see Requirement 11 (AC 1-9)
 * @see INV-QUARANTINE-001: Quarantined users cannot receive Membership until explicit remediation
 * @see Locked Decision L5: Role mapping
 * @see Locked Decision L6: Non-admin RT users org-scoped to RT root
 */

import type { MembershipRole, MembershipStatus, UserRole } from '@prisma/client';

// ---------------------------------------------------------------------------
// Remediation Candidate Types
// ---------------------------------------------------------------------------

/**
 * A user that is a candidate for remediation (has no Membership record).
 */
export interface RemediationCandidate {
  /** User UUID */
  readonly userId: string;
  /** User email for identification */
  readonly email: string;
  /** User display name */
  readonly name: string;
  /** Legacy tenant ID (evidence only, not authority) */
  readonly legacyTenantId: string;
  /** Legacy tenant name for reporting */
  readonly legacyTenantName: string;
  /** Legacy user role (evidence only, not authority) */
  readonly legacyRole: UserRole;
  /** Target MembershipRole based on L5 mapping */
  readonly targetRole: MembershipRole;
  /** Target OrgUnit ID (RT root for non-admins, null for tenant-level admins) */
  readonly targetOrgUnitId: string | null;
  /** User creation date for provenance */
  readonly createdAt: Date;
}

/**
 * Classification of a remediation candidate.
 */
export type RemediationClassification =
  | 'known-pattern'     // User.tenantId exists, tenant exists, role maps cleanly
  | 'ambiguous'         // Multiple potential identities, unclear tenant association
  | 'quarantine-match'  // User ID matches quarantine manifest
  | 'missing-tenant'    // User has tenantId but tenant does not exist
  | 'invalid-role';     // User has role that cannot be mapped

/**
 * Result of classifying a user for remediation.
 */
export interface ClassifiedCandidate {
  /** The remediation candidate (if classification allows) */
  readonly candidate: RemediationCandidate | null;
  /** Classification result */
  readonly classification: RemediationClassification;
  /** User ID for tracking */
  readonly userId: string;
  /** Reason for classification (for logging/reporting) */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Remediation Result Types
// ---------------------------------------------------------------------------

/**
 * Disposition of a remediation action.
 */
export type RemediationDisposition =
  | 'created'           // Membership was created
  | 'skipped-quarantine'// User is quarantined (PNA-01..PNA-05)
  | 'skipped-missing-tenant' // Tenant does not exist
  | 'skipped-invalid-role'   // Role cannot be mapped
  | 'skipped-ambiguous'      // Classification was ambiguous
  | 'skipped-dry-run';       // Dry-run mode, no changes made

/**
 * Result of remediating a single user.
 */
export interface RemediationResult {
  /** User ID */
  readonly userId: string;
  /** User email for identification */
  readonly email: string;
  /** Disposition of the remediation */
  readonly disposition: RemediationDisposition;
  /** Created membership ID (if disposition is 'created') */
  readonly membershipId: string | null;
  /** Before state for audit */
  readonly beforeState: RemediationBeforeState;
  /** After state for audit (null if no changes) */
  readonly afterState: RemediationAfterState | null;
  /** Classification reason */
  readonly reason: string;
}

/**
 * Before-state snapshot for a user being remediated.
 */
export interface RemediationBeforeState {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly legacyTenantId: string;
  readonly legacyRole: UserRole;
  readonly hasMembership: false;
}

/**
 * After-state snapshot for a user that received a membership.
 */
export interface RemediationAfterState {
  readonly userId: string;
  readonly membershipId: string;
  readonly tenantId: string;
  readonly orgUnitId: string | null;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
  readonly hasMembership: true;
}

// ---------------------------------------------------------------------------
// Remediation Report Types
// ---------------------------------------------------------------------------

/**
 * Summary statistics for a remediation run.
 */
export interface RemediationSummary {
  /** Total users discovered without memberships */
  readonly totalDiscovered: number;
  /** Users successfully remediated (membership created) */
  readonly created: number;
  /** Users skipped due to quarantine */
  readonly skippedQuarantine: number;
  /** Users skipped due to missing tenant */
  readonly skippedMissingTenant: number;
  /** Users skipped due to invalid role */
  readonly skippedInvalidRole: number;
  /** Users skipped due to ambiguous classification */
  readonly skippedAmbiguous: number;
  /** Users skipped due to dry-run mode */
  readonly skippedDryRun: number;
  /** Total skipped (sum of all skip reasons) */
  readonly totalSkipped: number;
}

/**
 * Comprehensive remediation report.
 */
export interface RemediationReport {
  /** Report metadata */
  readonly metadata: RemediationReportMetadata;
  /** Quarantine verification result */
  readonly quarantineVerification: QuarantineVerificationResult;
  /** Summary statistics */
  readonly summary: RemediationSummary;
  /** Detailed results per user */
  readonly results: readonly RemediationResult[];
  /** Users that were skipped with reasons */
  readonly skippedUsers: readonly SkippedUserEntry[];
  /** Users that received memberships */
  readonly createdMemberships: readonly CreatedMembershipEntry[];
}

/**
 * Report metadata.
 */
export interface RemediationReportMetadata {
  /** Timestamp of report generation (ISO 8601) */
  readonly generatedAt: string;
  /** Whether this was a dry-run */
  readonly dryRun: boolean;
  /** Correlation ID for tracing */
  readonly correlationId: string;
  /** Version of the remediation service */
  readonly serviceVersion: string;
}

/**
 * Result of quarantine manifest verification.
 */
export interface QuarantineVerificationResult {
  /** Whether verification passed */
  readonly verified: boolean;
  /** Expected count from manifest */
  readonly expectedCount: number;
  /** Actual count in manifest */
  readonly actualCount: number;
  /** Manifest version */
  readonly manifestVersion: string;
  /** Error message if verification failed */
  readonly errorMessage: string | null;
}

/**
 * Entry for a skipped user in the report.
 */
export interface SkippedUserEntry {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly legacyTenantId: string;
  readonly legacyRole: UserRole;
  readonly disposition: RemediationDisposition;
  readonly reason: string;
}

/**
 * Entry for a created membership in the report.
 */
export interface CreatedMembershipEntry {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly membershipId: string;
  readonly tenantId: string;
  readonly orgUnitId: string | null;
  readonly role: MembershipRole;
  readonly legacyRole: UserRole;
}

// ---------------------------------------------------------------------------
// Remediation Options
// ---------------------------------------------------------------------------

/**
 * Options for running remediation.
 */
export interface RemediationOptions {
  /** If true, generate report without making changes */
  readonly dryRun: boolean;
  /** Correlation ID for tracing (auto-generated if not provided) */
  readonly correlationId?: string;
  /** Limit number of users to process (for testing/incremental runs) */
  readonly limit?: number;
  /** Skip quarantine verification (DANGEROUS - only for testing) */
  readonly skipQuarantineVerification?: boolean;
}

/**
 * Default remediation options.
 */
export const DEFAULT_REMEDIATION_OPTIONS: RemediationOptions = {
  dryRun: true, // Default to dry-run for safety
};

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

/**
 * Error codes for remediation operations.
 */
export type RemediationErrorCode =
  | 'QUARANTINE_VERIFICATION_FAILED'
  | 'ROLE_MAPPING_FAILED'
  | 'TENANT_NOT_FOUND'
  | 'ORGUNIT_NOT_FOUND'
  | 'MEMBERSHIP_CREATION_FAILED'
  | 'DATABASE_ERROR'
  | 'INVALID_CONFIGURATION';

/**
 * Error thrown during remediation operations.
 */
export class RemediationError extends Error {
  constructor(
    public readonly code: RemediationErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RemediationError';
    Object.setPrototypeOf(this, RemediationError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Legacy Data Remediation Service interface.
 *
 * Provides evidence-based remediation of users without Membership records
 * while respecting the quarantine manifest and locked decisions.
 */
export interface ILegacyDataRemediationService {
  /**
   * Run the remediation workflow.
   *
   * @param options - Remediation options (defaults to dry-run)
   * @returns Comprehensive remediation report
   * @throws RemediationError if quarantine verification fails
   */
  runRemediation(options?: Partial<RemediationOptions>): Promise<RemediationReport>;

  /**
   * Discover all users without Membership records.
   *
   * @param limit - Optional limit on number of users to discover
   * @returns Array of classified candidates
   */
  discoverCandidates(limit?: number): Promise<readonly ClassifiedCandidate[]>;

  /**
   * Preview remediation without making changes.
   *
   * @param limit - Optional limit on number of users to process
   * @returns Remediation report with dry-run flag set
   */
  previewRemediation(limit?: number): Promise<RemediationReport>;
}

/**
 * Service version for tracking.
 */
export const REMEDIATION_SERVICE_VERSION = '1.0.0';
