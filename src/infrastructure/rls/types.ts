/**
 * RLS (Row-Level Security) Types
 *
 * Type definitions for PostgreSQL RLS infrastructure supporting multi-tenant isolation.
 *
 * @see FASE 1.12 Task 30: RLS Policy Implementation
 * @see Requirement 10: PostgreSQL Row-Level Security Foundation
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement
 * @see Design Section 11: RLS Foundation
 */

// ---------------------------------------------------------------------------
// Data Entity Classification
// ---------------------------------------------------------------------------

/**
 * Classification categories for database tables.
 *
 * Determines the RLS policy type to apply (or not apply) to each table.
 *
 * @see design.md "Data Entity Classification" section
 */
export enum TableClassification {
  /**
   * No tenant RLS. Access authorized via Membership lookup.
   * Example: users table
   */
  GLOBAL_IDENTITY = 'GLOBAL_IDENTITY',

  /**
   * No tenant RLS. Read-all for authenticated users.
   * Example: subscription_plans, feature_flags
   */
  PLATFORM_SHARED = 'PLATFORM_SHARED',

  /**
   * Standard tenant RLS: tenant_id = app.current_tenant_id
   * Example: tenants, org_units, memberships, households
   */
  TENANT_OWNED = 'TENANT_OWNED',

  /**
   * Tenant RLS + OrgUnit scope check (application-level).
   * RLS enforces tenant; application enforces OrgUnit scope.
   * Example: residents
   */
  ORG_SCOPED = 'ORG_SCOPED',

  /**
   * Tenant RLS + Household membership check (application-level).
   * RLS enforces tenant; application enforces household access.
   * Example: resident_household_access (if created)
   */
  HOUSEHOLD_SCOPED = 'HOUSEHOLD_SCOPED',

  /**
   * User's own data only: user_id = current_user_id
   * Requires different RLS policy pattern.
   * Example: user_profiles, user_emergency_history (if created)
   */
  USER_SELF = 'USER_SELF',
}

/**
 * Table classification entry in the registry.
 */
export interface TableClassificationEntry {
  /** Actual PostgreSQL table name (snake_case) */
  readonly tableName: string;
  /** Classification category */
  readonly classification: TableClassification;
  /** Column name containing tenant reference (usually 'tenant_id') */
  readonly tenantIdColumn?: string;
  /** Whether this table currently has tenant_id column */
  readonly hasTenantIdColumn: boolean;
  /** Notes for documentation/audit */
  readonly notes?: string;
}

// ---------------------------------------------------------------------------
// RLS Policy Types
// ---------------------------------------------------------------------------

/**
 * RLS policy action types.
 */
export type RlsPolicyAction = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

/**
 * RLS policy definition for a table.
 */
export interface RlsPolicyDefinition {
  /** Policy name (e.g., 'tenant_isolation') */
  readonly policyName: string;
  /** Target table name */
  readonly tableName: string;
  /** Policy actions (SELECT, INSERT, UPDATE, DELETE, or ALL) */
  readonly actions: readonly RlsPolicyAction[];
  /** USING clause expression (for SELECT, UPDATE, DELETE) */
  readonly usingExpression: string;
  /** WITH CHECK clause expression (for INSERT, UPDATE) */
  readonly withCheckExpression?: string;
}

/**
 * Generated SQL statements for RLS operations.
 */
export interface RlsPolicySql {
  /** SQL to enable RLS on the table */
  readonly enableRls: string;
  /** SQL to create the policy */
  readonly createPolicy: string;
  /** SQL to drop the policy (for rollback) */
  readonly dropPolicy: string;
  /** SQL to disable RLS (for rollback) */
  readonly disableRls: string;
  /** SQL to verify RLS is enabled */
  readonly verifyRls: string;
}

// ---------------------------------------------------------------------------
// Session Context Types
// ---------------------------------------------------------------------------

/**
 * Session variable name for tenant context.
 *
 * @see Design Decision D6: RLS session variable: `app.current_tenant_id`
 */
export const RLS_SESSION_VARIABLE = 'app.current_tenant_id' as const;

/**
 * RLS session context for a database connection.
 */
export interface RlsSessionContext {
  /** Current tenant ID (UUID) */
  readonly tenantId: string;
  /** Whether context is set */
  readonly isSet: boolean;
  /** Timestamp when context was set */
  readonly setAt?: Date;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

/**
 * Error codes for RLS operations.
 */
export type RlsErrorCode =
  | 'RLS_SESSION_NOT_SET'
  | 'RLS_INVALID_TENANT_ID'
  | 'RLS_POLICY_CREATION_FAILED'
  | 'RLS_TABLE_NOT_FOUND'
  | 'RLS_CLASSIFICATION_MISSING'
  | 'RLS_VERIFICATION_FAILED';

/**
 * Error thrown when RLS operations fail.
 */
export class RlsError extends Error {
  constructor(
    public readonly code: RlsErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RlsError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, RlsError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Registry Types
// ---------------------------------------------------------------------------

/**
 * Result of RLS coverage verification.
 */
export interface RlsCoverageResult {
  /** All classified tables */
  readonly classifiedTables: readonly TableClassificationEntry[];
  /** Tables with TENANT_OWNED or ORG_SCOPED that need RLS */
  readonly tablesRequiringRls: readonly string[];
  /** Tables explicitly excluded from RLS */
  readonly tablesExcludedFromRls: readonly string[];
  /** Any unclassified tables found in schema */
  readonly unclassifiedTables?: readonly string[];
  /** Coverage percentage (tables with RLS / tables requiring RLS) */
  readonly coveragePercentage: number;
  /** Whether all required tables have RLS */
  readonly isComplete: boolean;
}

/**
 * RLS policy verification result for a single table.
 */
export interface RlsPolicyVerification {
  /** Table name */
  readonly tableName: string;
  /** Whether RLS is enabled on the table */
  readonly rlsEnabled: boolean;
  /** Whether the expected policy exists */
  readonly policyExists: boolean;
  /** Policy name if exists */
  readonly policyName?: string;
  /** Verification timestamp */
  readonly verifiedAt: Date;
}
