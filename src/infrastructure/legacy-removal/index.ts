/**
 * Legacy Removal Infrastructure Barrel Export
 *
 * This module provides infrastructure for managing the removal of User.tenantId
 * dependencies during the migration to Membership-based authorization.
 *
 * **Key Components:**
 *
 * 1. **CodePathAnalyzer** - Identifies User.tenantId usages in the codebase
 *    - Static analysis of TypeScript files
 *    - Classification by authorization relevance
 *    - Migration status tracking
 *
 * 2. **AuthPathValidator** - Validates route handlers use Membership-based auth
 *    - Checks for AuthorizationContext usage
 *    - Detects legacy authorization patterns
 *    - Reports validation issues
 *
 * 3. **DeprecationHelper** - Manages deprecation warnings for tenantId access
 *    - Wraps legacy accessors with warnings
 *    - Rate-limited logging
 *    - Configurable warning behavior
 *
 * 4. **MigrationStatusTracker** - Tracks overall migration progress
 *    - Progress metrics by category
 *    - Completion checking
 *    - Blocking issue identification
 *
 * 5. **LegacyRemovalReportGenerator** - Generates comprehensive reports
 *    - JSON, Markdown, HTML formats
 *    - Migration recommendations
 *    - External integration tracking
 *
 * **Usage:**
 *
 * ```typescript
 * import {
 *   CodePathAnalyzerImpl,
 *   AuthPathValidatorImpl,
 *   MigrationStatusTrackerImpl,
 *   LegacyRemovalReportGeneratorImpl,
 *   DeprecationHelperImpl,
 * } from '@infrastructure/legacy-removal';
 *
 * // Create analyzer and validator
 * const analyzer = CodePathAnalyzerImpl();
 * const validator = AuthPathValidatorImpl();
 *
 * // Create tracker with dependencies
 * const tracker = MigrationStatusTrackerImpl({
 *   getCodePathUsages: () => analyzer.analyzeCodePaths(),
 *   getRouteValidations: () => validator.validateAllRoutes(),
 *   updateCodePathStatus: analyzer.updateMigrationStatus,
 * });
 *
 * // Create report generator
 * const reporter = LegacyRemovalReportGeneratorImpl({
 *   codePathAnalyzer: analyzer,
 *   authPathValidator: validator,
 *   migrationStatusTracker: tracker,
 * });
 *
 * // Generate report
 * const report = await reporter.generateReport();
 * const markdown = reporter.exportReport(report, 'markdown');
 * ```
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 1-6)
 * @see FASE 1.14 — Remove User.tenantId Dependency
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  // Code Path Classification
  CodePathClassification,
  CodePathMigrationStatus,
  MigrationPriority,

  // Code Path Analysis
  CodePathUsage,
  UsageContext,
  DetectionPattern,
  AnalysisOptions,

  // Authorization Path Validation
  RouteAuthorizationValidation,
  RouteValidationStatus,
  ValidationIssue,
  ValidationIssueCode,
  ValidationOptions,

  // Deprecation Warning
  DeprecationWarning,
  DeprecationLocation,
  DeprecationConfig,

  // Migration Status
  MigrationStatus,
  MigrationProgress,

  // Report Types
  LegacyRemovalReport,
  ReportMetadata,
  FileSummary,
  Recommendation,
  ExternalIntegration,
  ReportOptions,
  ReportFormat,

  // Service Interfaces
  ICodePathAnalyzer,
  IAuthPathValidator,
  IDeprecationHelper,
  IMigrationStatusTracker,
  ILegacyRemovalReportGenerator,
} from './types';

export {
  // Constants
  LEGACY_REMOVAL_SERVICE_VERSION,
  DEFAULT_ANALYSIS_OPTIONS,
  DEFAULT_VALIDATION_OPTIONS,
  DEFAULT_REPORT_OPTIONS,
  DEFAULT_DEPRECATION_CONFIG,

  // Error handling
  LegacyRemovalError,
} from './types';

export type { LegacyRemovalErrorCode } from './types';

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

// Code Path Analyzer
export { CodePathAnalyzerImpl } from './CodePathAnalyzer';
export type { CodePathAnalyzer } from './CodePathAnalyzer';

// Authorization Path Validator
export { AuthPathValidatorImpl } from './AuthPathValidator';
export type { AuthPathValidator } from './AuthPathValidator';

// Deprecation Helper
export {
  DeprecationHelperImpl,
  createDeprecatedUserWrapper,
  deprecateTenantIdAccess,
} from './DeprecationHelper';
export type { DeprecationHelper } from './DeprecationHelper';

// Migration Status Tracker
export {
  MigrationStatusTrackerImpl,
  createStandaloneMigrationStatusTracker,
} from './MigrationStatusTracker';
export type {
  MigrationStatusTracker,
  MigrationStatusTrackerDependencies,
  StandaloneMigrationStatusTracker,
} from './MigrationStatusTracker';

// Legacy Removal Report Generator
export { LegacyRemovalReportGeneratorImpl } from './LegacyRemovalReportGenerator';
export type {
  LegacyRemovalReportGenerator,
  LegacyRemovalReportGeneratorDependencies,
} from './LegacyRemovalReportGenerator';
