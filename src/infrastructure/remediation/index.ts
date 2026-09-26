/**
 * Remediation Module Barrel Export
 *
 * This module provides the evidence-based legacy data remediation functionality
 * for creating Membership records for users without them, while explicitly
 * excluding quarantined platform anomalies (PNA-01 through PNA-05).
 *
 * **Primary Exports:**
 * - `createLegacyDataRemediationService()` — Factory for DI registration
 * - `createQuarantineValidator()` — Validates quarantine manifest
 * - `createRoleMappingService()` — Maps legacy roles to MembershipRole
 * - `createRemediationReportGenerator()` — Generates remediation reports
 *
 * **Key Invariants:**
 * - INV-QUARANTINE-001: Quarantined users cannot receive Membership until explicit remediation
 * - Locked Decision L3: 5 Platform anomalies quarantined (PNA-01 through PNA-05)
 * - Locked Decision L5: Role mapping frozen
 * - Locked Decision L6: Non-admin RT users org-scoped to RT root
 *
 * @see Task 33: Evidence-Based Remediation Workflow
 * @see Requirement 11 (AC 1-9)
 *
 * @example
 * ```typescript
 * import { createLegacyDataRemediationService } from '@infrastructure/remediation';
 *
 * const service = createLegacyDataRemediationService({ prismaClient });
 *
 * // Preview remediation (dry-run)
 * const preview = await service.previewRemediation();
 * console.log(preview.summary);
 *
 * // Run remediation
 * const report = await service.runRemediation({ dryRun: false });
 * console.log(report.summary);
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  // Candidate types
  RemediationCandidate,
  ClassifiedCandidate,
  RemediationClassification,

  // Result types
  RemediationResult,
  RemediationDisposition,
  RemediationBeforeState,
  RemediationAfterState,

  // Report types
  RemediationReport,
  RemediationReportMetadata,
  RemediationSummary,
  QuarantineVerificationResult,
  SkippedUserEntry,
  CreatedMembershipEntry,

  // Options
  RemediationOptions,

  // Error
  RemediationErrorCode,

  // Service interface
  ILegacyDataRemediationService,
} from './types';

export { RemediationError, DEFAULT_REMEDIATION_OPTIONS, REMEDIATION_SERVICE_VERSION } from './types';

// ---------------------------------------------------------------------------
// Quarantine Validator
// ---------------------------------------------------------------------------

export type { IQuarantineValidator } from './QuarantineValidator';

export {
  createQuarantineValidator,
  verifyQuarantineManifest,
  verifyQuarantineManifestOrThrow,
  EXPECTED_QUARANTINE_COUNT,
  EXPECTED_QUARANTINE_ALIASES,
} from './QuarantineValidator';

// ---------------------------------------------------------------------------
// Role Mapping Service
// ---------------------------------------------------------------------------

export type { IRoleMappingService } from './RoleMappingService';

export {
  createRoleMappingService,
  mapLegacyRole,
  tryMapLegacyRole,
  canMapLegacyRole,
  getTargetOrgUnitId,
  ROLE_MAPPING,
  TENANT_LEVEL_ROLES,
  ORG_SCOPED_ROLES,
} from './RoleMappingService';

// ---------------------------------------------------------------------------
// Report Generator
// ---------------------------------------------------------------------------

export type {
  IRemediationReportGenerator,
  ReportGeneratorParams,
} from './RemediationReportGenerator';

export {
  createRemediationReportGenerator,
  generateRemediationReport,
  formatReportAsJson,
  formatReportAsMarkdown,
} from './RemediationReportGenerator';

// ---------------------------------------------------------------------------
// Legacy Data Remediation Service
// ---------------------------------------------------------------------------

export type { LegacyDataRemediationServiceDeps } from './LegacyDataRemediationService';

export { createLegacyDataRemediationService } from './LegacyDataRemediationService';
