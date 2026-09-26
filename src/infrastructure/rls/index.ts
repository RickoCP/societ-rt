/**
 * RLS (Row-Level Security) Infrastructure
 *
 * PostgreSQL Row-Level Security implementation for multi-tenant isolation.
 * Provides defense-in-depth tenant isolation at the database layer.
 *
 * **CRITICAL RULES:**
 * - NO RLS on `users` table (GLOBAL_IDENTITY per INV-USER-001)
 * - NO generic bypass mechanism for PLATFORM_ADMIN
 * - Fail closed if session variable not set
 * - Use SET LOCAL (transaction-scoped) for connection pool safety
 *
 * @see FASE 1.12 Task 30: RLS Policy Implementation
 * @see Requirement 10: PostgreSQL Row-Level Security Foundation
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement
 * @see Design Section 11: RLS Foundation
 *
 * @example
 * ```typescript
 * import {
 *   createTableClassificationRegistry,
 *   createRlsPolicyManager,
 *   createRlsSessionContextService,
 *   TableClassification,
 * } from '@infrastructure/rls';
 *
 * // Check table classification
 * const registry = createTableClassificationRegistry();
 * const usersClass = registry.getClassification('users');
 * // usersClass.classification === TableClassification.GLOBAL_IDENTITY
 *
 * // Generate migration SQL
 * const policyManager = createRlsPolicyManager();
 * const migrationSql = policyManager.generateMigrationSql();
 *
 * // Use RLS context in transactions
 * const contextService = createRlsSessionContextService();
 * await prisma.$transaction(async (tx) => {
 *   await tx.$executeRawUnsafe(contextService.getSetContextSql(tenantId));
 *   return tx.resident.findMany(); // RLS filters by tenant
 * });
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export {
  // Enums
  TableClassification,

  // Session variable constant
  RLS_SESSION_VARIABLE,

  // Types
  type TableClassificationEntry,
  type RlsPolicyAction,
  type RlsPolicyDefinition,
  type RlsPolicySql,
  type RlsSessionContext,
  type RlsCoverageResult,
  type RlsPolicyVerification,

  // Error types
  type RlsErrorCode,
  RlsError,
} from './types';

// ---------------------------------------------------------------------------
// Table Classification Registry
// ---------------------------------------------------------------------------

export {
  // Service interface
  type ITableClassificationRegistry,

  // Factory function
  createTableClassificationRegistry,

  // Convenience functions
  getTableClassification,
  tableRequiresRls,
  getTablesRequiringRls,
  getRlsCoverageReport,
} from './TableClassificationRegistry';

// ---------------------------------------------------------------------------
// RLS Policy Manager
// ---------------------------------------------------------------------------

export {
  // Service interface
  type IRlsPolicyManager,
  type RlsPolicyManagerDeps,

  // Factory function
  createRlsPolicyManager,

  // Convenience functions
  generateRlsMigrationSql,
  generateRlsRollbackSql,
  getRlsTables,
  getRlsPolicySql,
} from './RlsPolicyManager';

// ---------------------------------------------------------------------------
// RLS Session Context
// ---------------------------------------------------------------------------

export {
  // Service interface
  type IRlsSessionContextService,
  type RlsTransactionOptions,

  // Factory function
  createRlsSessionContextService,

  // Convenience functions
  getSetRlsContextSql,
  getClearRlsContextSql,
  getCurrentRlsContextSql,
  validateRlsTenantId,
  getRlsSessionVariableName,

  // Documentation
  RLS_PRISMA_USAGE_GUIDE,
} from './RlsSessionContext';

// ---------------------------------------------------------------------------
// RLS Coverage Enforcer
// ---------------------------------------------------------------------------

export {
  // Service interface
  type IRlsCoverageEnforcer,
  type RlsCoverageEnforcerDeps,

  // Result types
  type RlsEnforcementResult,
  type RlsAuditResult,
  type RlsCoverageGap,

  // Factory function
  createRlsCoverageEnforcer,

  // Convenience functions
  checkRlsCoverage,
  runRlsAudit,
  formatRlsCiFailure,
} from './RlsCoverageEnforcer';

// ---------------------------------------------------------------------------
// RLS Migration Service
// ---------------------------------------------------------------------------

export {
  // Service interface
  type IRlsMigrationService,
  type RlsMigrationServiceDeps,

  // Result types
  type RlsMigrationStatus,
  type RlsMigrationResult,
  type RlsMigrationOptions,
  type RlsMigrationAlert,
  type RlsVerificationResult,

  // Factory function
  createRlsMigrationService,

  // Convenience functions
  generateRlsEnableMigrationSql,
  generateRlsDisableMigrationSql,
  getRlsAffectedTables,
  getRlsExcludedTables,
  createRlsRollbackFailureAlert,
} from './RlsMigrationService';

// ---------------------------------------------------------------------------
// RLS Prisma Middleware
// ---------------------------------------------------------------------------

export {
  // Service interface
  type IRlsPrismaMiddleware,
  type RlsPrismaMiddlewareDeps,

  // Config types
  type RlsPrismaMiddlewareConfig,
  type RlsExecutionContext,
  type PrivilegedExecutionOptions,
  type PrivilegedExecutionAuditEntry,
  type PrismaTransactionClient,

  // RLS context change logging types (Requirement 15.4)
  type RlsContextOperation,
  type RlsContextChangeLogEntry,

  // Error types
  type RlsMiddlewareErrorCode,
  RlsMiddlewareError,

  // Factory function
  createRlsPrismaMiddleware,

  // Initialization functions
  initRlsPrismaMiddleware,
  getRlsPrismaMiddleware,

  // Convenience functions
  executeWithRlsContext,
  executePrivileged,
  createRlsContextFromAuth,

  // Default configuration
  DEFAULT_TENANT_SCOPED_OPERATIONS,
  DEFAULT_EXEMPT_TABLES,
} from './RlsPrismaMiddleware';
