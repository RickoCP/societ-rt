/**
 * Legacy Removal Types — Type definitions for User.tenantId dependency removal.
 *
 * This module defines types for:
 * - Code path analysis and classification
 * - Authorization path validation
 * - Deprecation warning tracking
 * - Migration status tracking
 *
 * **CRITICAL:** These types support Requirement 12 (Remove Legacy User.tenantId Dependency):
 * - AC 1: Identify all code paths that read User.tenantId for authorization purposes
 * - AC 2: Update all identified code paths to resolve tenant from authorization context
 * - AC 3: NOT remove User.tenantId column until all code dependencies are removed
 * - AC 4: Maintain backward compatibility for external integrations
 * - AC 5: Add deprecation warning to any remaining User.tenantId access
 * - AC 6: Validate all route handlers use Membership-based authorization
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 1-6)
 */

// ---------------------------------------------------------------------------
// Code Path Classification
// ---------------------------------------------------------------------------

/**
 * Classification of User.tenantId usage in code.
 *
 * Each classification determines how the code path should be handled:
 * - authorization-critical: MUST be migrated to Membership-based authorization
 * - read-only: Can be deprecated but may need backward compatibility
 * - backward-compat: External integration that needs transition period
 * - non-authorization: Not used for authorization decisions (informational only)
 */
export type CodePathClassification =
  | 'authorization-critical' // Used in authorization decision making
  | 'read-only' // Read for display/logging, not authorization
  | 'backward-compat' // External integration dependency
  | 'non-authorization'; // Not related to authorization

/**
 * Migration status of a code path.
 */
export type CodePathMigrationStatus =
  | 'pending' // Not yet migrated
  | 'in-progress' // Migration started
  | 'migrated' // Migrated to Membership-based
  | 'deprecated' // Has deprecation warning
  | 'removed'; // Code path removed (post-cleanup)

/**
 * Priority level for migration.
 */
export type MigrationPriority = 'critical' | 'high' | 'medium' | 'low';

// ---------------------------------------------------------------------------
// Code Path Analysis Types
// ---------------------------------------------------------------------------

/**
 * A detected usage of User.tenantId in code.
 */
export interface CodePathUsage {
  /** Unique identifier for this usage */
  readonly id: string;

  /** File path where usage was found */
  readonly filePath: string;

  /** Line number in the file */
  readonly lineNumber: number;

  /** Column number (if available) */
  readonly columnNumber?: number;

  /** The code snippet containing the usage */
  readonly codeSnippet: string;

  /** Classification of this usage */
  readonly classification: CodePathClassification;

  /** Migration priority */
  readonly priority: MigrationPriority;

  /** Current migration status */
  readonly status: CodePathMigrationStatus;

  /** Context about how tenantId is used */
  readonly usageContext: UsageContext;

  /** Suggested migration action */
  readonly suggestedAction: string;

  /** Notes or additional context */
  readonly notes?: string;
}

/**
 * Context about how User.tenantId is used.
 */
export interface UsageContext {
  /** Whether this is in an authorization check */
  readonly isAuthorizationCheck: boolean;

  /** Whether this is in a database query */
  readonly isDatabaseQuery: boolean;

  /** Whether this is in a route handler */
  readonly isRouteHandler: boolean;

  /** Whether this is in a middleware */
  readonly isMiddleware: boolean;

  /** Whether this is in a worker/background job */
  readonly isWorker: boolean;

  /** Whether this is in a test file */
  readonly isTestFile: boolean;

  /** Function/method name where usage occurs */
  readonly functionName?: string;

  /** Class name (if applicable) */
  readonly className?: string;
}

/**
 * Pattern for detecting User.tenantId usages.
 */
export interface DetectionPattern {
  /** Unique identifier for this pattern */
  readonly patternId: string;

  /** Human-readable name */
  readonly name: string;

  /** Regular expression pattern */
  readonly regex: RegExp;

  /** Default classification for matches */
  readonly defaultClassification: CodePathClassification;

  /** Default priority for matches */
  readonly defaultPriority: MigrationPriority;

  /** Description of what this pattern detects */
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Authorization Path Validation Types
// ---------------------------------------------------------------------------

/**
 * Result of validating a route handler's authorization approach.
 */
export interface RouteAuthorizationValidation {
  /** Route identifier (e.g., 'GET /api/users') */
  readonly routeId: string;

  /** File path of the route handler */
  readonly filePath: string;

  /** Whether the route uses Membership-based authorization */
  readonly usesMembershipAuthorization: boolean;

  /** Whether the route uses legacy User.tenantId */
  readonly usesLegacyTenantId: boolean;

  /** Whether the route uses AuthorizationContext */
  readonly usesAuthorizationContext: boolean;

  /** Validation status */
  readonly validationStatus: RouteValidationStatus;

  /** Issues found during validation */
  readonly issues: readonly ValidationIssue[];

  /** Timestamp of validation */
  readonly validatedAt: Date;
}

/**
 * Status of route authorization validation.
 */
export type RouteValidationStatus =
  | 'valid' // Fully using Membership-based authorization
  | 'partial' // Some Membership usage, some legacy
  | 'legacy' // Fully using legacy authorization
  | 'unknown'; // Unable to determine

/**
 * An issue found during validation.
 */
export interface ValidationIssue {
  /** Issue severity */
  readonly severity: 'error' | 'warning' | 'info';

  /** Issue code for programmatic handling */
  readonly code: ValidationIssueCode;

  /** Human-readable message */
  readonly message: string;

  /** Line number where issue was found */
  readonly lineNumber?: number;

  /** Suggested fix */
  readonly suggestedFix?: string;
}

/**
 * Codes for validation issues.
 */
export type ValidationIssueCode =
  | 'LEGACY_TENANT_ID_READ' // Reads User.tenantId
  | 'MISSING_AUTH_CONTEXT' // Route handler doesn't use AuthorizationContext
  | 'DIRECT_DB_TENANT_FILTER' // Filters by tenantId directly instead of via auth context
  | 'MIXED_AUTHORIZATION' // Uses both legacy and new authorization
  | 'UNPROTECTED_ROUTE' // Route has no authorization
  | 'HARDCODED_TENANT_ID'; // Hardcoded tenant ID in code

// ---------------------------------------------------------------------------
// Deprecation Warning Types
// ---------------------------------------------------------------------------

/**
 * A deprecation warning for User.tenantId access.
 */
export interface DeprecationWarning {
  /** Timestamp of the warning */
  readonly timestamp: Date;

  /** Location where access occurred */
  readonly location: DeprecationLocation;

  /** Call stack (if available) */
  readonly callStack?: string;

  /** Additional context */
  readonly context: Record<string, unknown>;
}

/**
 * Location information for deprecation warning.
 */
export interface DeprecationLocation {
  /** File path */
  readonly filePath: string;

  /** Line number */
  readonly lineNumber?: number;

  /** Function name */
  readonly functionName?: string;
}

/**
 * Configuration for deprecation warning behavior.
 */
export interface DeprecationConfig {
  /** Whether to log warnings */
  readonly logWarnings: boolean;

  /** Whether to throw errors (strict mode) */
  readonly throwErrors: boolean;

  /** Maximum warnings to log per location per minute (rate limiting) */
  readonly maxWarningsPerMinute: number;

  /** Whether to include call stack in warnings */
  readonly includeCallStack: boolean;

  /** Locations to exclude from warnings (e.g., test files) */
  readonly excludePatterns: readonly string[];
}

/**
 * Default deprecation configuration.
 */
export const DEFAULT_DEPRECATION_CONFIG: DeprecationConfig = {
  logWarnings: true,
  throwErrors: false,
  maxWarningsPerMinute: 10,
  includeCallStack: true,
  excludePatterns: ['**/*.test.ts', '**/*.spec.ts', '**/test/**', '**/__tests__/**'],
};

// ---------------------------------------------------------------------------
// Migration Status Tracking Types
// ---------------------------------------------------------------------------

/**
 * Overall migration status summary.
 */
export interface MigrationStatus {
  /** Timestamp of status check */
  readonly checkedAt: Date;

  /** Total code paths identified */
  readonly totalPaths: number;

  /** Paths by classification */
  readonly byClassification: Readonly<Record<CodePathClassification, number>>;

  /** Paths by migration status */
  readonly byStatus: Readonly<Record<CodePathMigrationStatus, number>>;

  /** Paths by priority */
  readonly byPriority: Readonly<Record<MigrationPriority, number>>;

  /** Progress percentage (migrated / total) */
  readonly progressPercentage: number;

  /** Whether migration is complete (all authorization-critical paths migrated) */
  readonly isComplete: boolean;

  /** Blocking issues preventing completion */
  readonly blockingIssues: readonly string[];
}

/**
 * Migration progress for a specific category.
 */
export interface MigrationProgress {
  /** Category name */
  readonly category: string;

  /** Total items in category */
  readonly total: number;

  /** Items completed */
  readonly completed: number;

  /** Items in progress */
  readonly inProgress: number;

  /** Items pending */
  readonly pending: number;

  /** Progress percentage */
  readonly percentage: number;
}

// ---------------------------------------------------------------------------
// Report Types
// ---------------------------------------------------------------------------

/**
 * Comprehensive legacy removal report.
 */
export interface LegacyRemovalReport {
  /** Report metadata */
  readonly metadata: ReportMetadata;

  /** Overall migration status */
  readonly migrationStatus: MigrationStatus;

  /** All identified code paths */
  readonly codePaths: readonly CodePathUsage[];

  /** Route authorization validations */
  readonly routeValidations: readonly RouteAuthorizationValidation[];

  /** Summary by file */
  readonly filesSummary: readonly FileSummary[];

  /** Recommendations for next steps */
  readonly recommendations: readonly Recommendation[];

  /** External integrations needing backward compatibility */
  readonly externalIntegrations: readonly ExternalIntegration[];
}

/**
 * Report metadata.
 */
export interface ReportMetadata {
  /** Report generation timestamp */
  readonly generatedAt: string;

  /** Correlation ID for tracing */
  readonly correlationId: string;

  /** Analyzer version */
  readonly analyzerVersion: string;

  /** Scan scope (files/directories analyzed) */
  readonly scanScope: readonly string[];

  /** Files excluded from analysis */
  readonly excludedPatterns: readonly string[];
}

/**
 * Summary of usages per file.
 */
export interface FileSummary {
  /** File path */
  readonly filePath: string;

  /** Total usages in file */
  readonly totalUsages: number;

  /** Authorization-critical usages */
  readonly authorizationCritical: number;

  /** Migration status of file */
  readonly migrationStatus: CodePathMigrationStatus;

  /** Highest priority issue in file */
  readonly highestPriority: MigrationPriority;
}

/**
 * A recommendation for migration.
 */
export interface Recommendation {
  /** Priority of recommendation */
  readonly priority: MigrationPriority;

  /** Recommendation title */
  readonly title: string;

  /** Detailed description */
  readonly description: string;

  /** Affected files */
  readonly affectedFiles: readonly string[];

  /** Estimated effort (in story points or hours) */
  readonly estimatedEffort?: string;
}

/**
 * An external integration that depends on User.tenantId.
 */
export interface ExternalIntegration {
  /** Integration identifier */
  readonly integrationId: string;

  /** Integration name */
  readonly name: string;

  /** Description of dependency */
  readonly dependency: string;

  /** Files containing integration code */
  readonly files: readonly string[];

  /** Migration plan for this integration */
  readonly migrationPlan?: string;

  /** Backward compatibility requirement */
  readonly backwardCompatRequired: boolean;
}

// ---------------------------------------------------------------------------
// Service Interfaces
// ---------------------------------------------------------------------------

/**
 * Code Path Analyzer service interface.
 *
 * Identifies and classifies User.tenantId usages in the codebase.
 */
export interface ICodePathAnalyzer {
  /**
   * Analyze the codebase for User.tenantId usages.
   *
   * @param options - Analysis options
   * @returns Array of identified code path usages
   */
  analyzeCodePaths(options?: AnalysisOptions): Promise<readonly CodePathUsage[]>;

  /**
   * Get usages by classification.
   *
   * @param classification - Classification to filter by
   * @returns Filtered usages
   */
  getUsagesByClassification(
    classification: CodePathClassification,
  ): readonly CodePathUsage[];

  /**
   * Get usages by migration status.
   *
   * @param status - Status to filter by
   * @returns Filtered usages
   */
  getUsagesByStatus(status: CodePathMigrationStatus): readonly CodePathUsage[];

  /**
   * Update migration status for a code path.
   *
   * @param usageId - Usage identifier
   * @param status - New status
   * @param notes - Optional notes about the status change
   */
  updateMigrationStatus(
    usageId: string,
    status: CodePathMigrationStatus,
    notes?: string,
  ): void;
}

/**
 * Authorization Path Validator service interface.
 *
 * Validates that route handlers use Membership-based authorization.
 */
export interface IAuthPathValidator {
  /**
   * Validate all route handlers in the codebase.
   *
   * @param options - Validation options
   * @returns Array of validation results
   */
  validateAllRoutes(options?: ValidationOptions): Promise<readonly RouteAuthorizationValidation[]>;

  /**
   * Validate a specific route handler.
   *
   * @param routeId - Route identifier
   * @param filePath - Path to the route handler file
   * @returns Validation result
   */
  validateRoute(routeId: string, filePath: string): Promise<RouteAuthorizationValidation>;

  /**
   * Check if all routes use Membership-based authorization.
   *
   * @returns true if all routes are validated
   */
  areAllRoutesMigrated(): boolean;

  /**
   * Get routes that still use legacy authorization.
   *
   * @returns Array of route IDs still using legacy authorization
   */
  getLegacyRoutes(): readonly string[];
}

/**
 * Migration Status Tracker service interface.
 *
 * Tracks overall migration progress.
 */
export interface IMigrationStatusTracker {
  /**
   * Get current migration status.
   *
   * @returns Current migration status
   */
  getStatus(): MigrationStatus;

  /**
   * Get progress for a specific category.
   *
   * @param category - Category to get progress for
   * @returns Progress information
   */
  getProgress(category: string): MigrationProgress;

  /**
   * Record a code path as migrated.
   *
   * @param usageId - Usage identifier
   */
  recordMigrated(usageId: string): void;

  /**
   * Check if migration is complete.
   *
   * @returns true if all authorization-critical paths are migrated
   */
  isMigrationComplete(): boolean;

  /**
   * Get blocking issues preventing completion.
   *
   * @returns Array of blocking issue descriptions
   */
  getBlockingIssues(): readonly string[];
}

/**
 * Deprecation Helper service interface.
 *
 * Manages deprecation warnings for User.tenantId access.
 */
export interface IDeprecationHelper {
  /**
   * Wrap a function to emit deprecation warnings when accessing tenantId.
   *
   * @param accessor - Function that accesses User.tenantId
   * @param context - Context about where the access occurs
   * @returns Wrapped function that logs deprecation warning
   */
  wrapTenantIdAccess<T>(accessor: () => T, context: DeprecationLocation): T;

  /**
   * Log a deprecation warning.
   *
   * @param location - Location of the deprecated access
   * @param additionalContext - Additional context to include
   */
  logWarning(location: DeprecationLocation, additionalContext?: Record<string, unknown>): void;

  /**
   * Get all logged warnings (for reporting).
   *
   * @returns Array of logged deprecation warnings
   */
  getWarnings(): readonly DeprecationWarning[];

  /**
   * Clear logged warnings.
   */
  clearWarnings(): void;

  /**
   * Update deprecation configuration.
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<DeprecationConfig>): void;
}

/**
 * Legacy Removal Report Generator service interface.
 *
 * Generates comprehensive reports on legacy removal progress.
 */
export interface ILegacyRemovalReportGenerator {
  /**
   * Generate a comprehensive legacy removal report.
   *
   * @param options - Report generation options
   * @returns Comprehensive report
   */
  generateReport(options?: ReportOptions): Promise<LegacyRemovalReport>;

  /**
   * Generate a summary for quick status check.
   *
   * @returns Migration status summary
   */
  generateSummary(): Promise<MigrationStatus>;

  /**
   * Export report to a specific format.
   *
   * @param report - Report to export
   * @param format - Export format
   * @returns Exported report as string
   */
  exportReport(report: LegacyRemovalReport, format: ReportFormat): string;
}

// ---------------------------------------------------------------------------
// Options Types
// ---------------------------------------------------------------------------

/**
 * Options for code path analysis.
 */
export interface AnalysisOptions {
  /** Directories to include in analysis */
  readonly includePaths?: readonly string[];

  /** Patterns to exclude from analysis */
  readonly excludePatterns?: readonly string[];

  /** Whether to include test files */
  readonly includeTests?: boolean;

  /** Maximum depth for directory traversal */
  readonly maxDepth?: number;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Options for route validation.
 */
export interface ValidationOptions {
  /** Directories containing route handlers */
  readonly routeDirectories?: readonly string[];

  /** Patterns to exclude from validation */
  readonly excludePatterns?: readonly string[];

  /** Whether to validate API routes only */
  readonly apiRoutesOnly?: boolean;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Options for report generation.
 */
export interface ReportOptions {
  /** Include detailed code snippets */
  readonly includeCodeSnippets?: boolean;

  /** Include recommendations */
  readonly includeRecommendations?: boolean;

  /** Include file summaries */
  readonly includeFileSummaries?: boolean;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Supported report formats.
 */
export type ReportFormat = 'json' | 'markdown' | 'html';

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

/**
 * Error codes for legacy removal operations.
 */
export type LegacyRemovalErrorCode =
  | 'ANALYSIS_FAILED'
  | 'VALIDATION_FAILED'
  | 'REPORT_GENERATION_FAILED'
  | 'INVALID_CONFIGURATION'
  | 'FILE_NOT_FOUND'
  | 'PARSE_ERROR';

/**
 * Error thrown during legacy removal operations.
 */
export class LegacyRemovalError extends Error {
  constructor(
    public readonly code: LegacyRemovalErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LegacyRemovalError';
    Object.setPrototypeOf(this, LegacyRemovalError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Service version for tracking.
 */
export const LEGACY_REMOVAL_SERVICE_VERSION = '1.0.0';

/**
 * Default analysis options.
 */
export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  includePaths: ['src'],
  excludePatterns: ['node_modules', 'dist', '.next', 'coverage'],
  includeTests: false,
  maxDepth: 10,
};

/**
 * Default validation options.
 */
export const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  routeDirectories: ['src/app/api'],
  excludePatterns: ['**/*.test.ts', '**/*.spec.ts'],
  apiRoutesOnly: true,
};

/**
 * Default report options.
 */
export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  includeCodeSnippets: true,
  includeRecommendations: true,
  includeFileSummaries: true,
};
