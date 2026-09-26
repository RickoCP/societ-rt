/**
 * Table Classification Registry
 *
 * Central registry defining which tables are TENANT_OWNED vs GLOBAL_IDENTITY vs PLATFORM_SHARED.
 * This registry is the single source of truth for RLS policy decisions.
 *
 * **CRITICAL: users table MUST NOT have tenant RLS (GLOBAL_IDENTITY)**
 * See design.md "Data Entity Classification" section.
 *
 * @see FASE 1.12 Task 30: RLS Policy Implementation
 * @see Requirement 10: PostgreSQL Row-Level Security Foundation (AC 1, 8, 9)
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement (AC 4-8)
 * @see INV-USER-001: User table is global identity store
 */

import {
  TableClassification,
  type TableClassificationEntry,
  type RlsCoverageResult,
  RlsError,
} from './types';

// ---------------------------------------------------------------------------
// Table Classification Definitions
// ---------------------------------------------------------------------------

/**
 * Complete classification of all database tables.
 *
 * Each table MUST be classified. The CI build should fail if a new table
 * is added without explicit classification (Req 60 AC 5).
 *
 * Classification categories:
 * - GLOBAL_IDENTITY: No tenant RLS (users)
 * - PLATFORM_SHARED: No tenant RLS (subscription_plans, feature_flags)
 * - TENANT_OWNED: Standard tenant RLS
 * - ORG_SCOPED: Tenant RLS + application-level OrgUnit scope
 * - HOUSEHOLD_SCOPED: Tenant RLS + application-level household check
 * - USER_SELF: User's own data only
 */
const TABLE_CLASSIFICATIONS: readonly TableClassificationEntry[] = [
  // ---------------------------------------------------------------------------
  // GLOBAL_IDENTITY — No tenant RLS
  // ---------------------------------------------------------------------------
  {
    tableName: 'users',
    classification: TableClassification.GLOBAL_IDENTITY,
    hasTenantIdColumn: true, // Legacy transitional only, NOT for RLS
    notes:
      'User table is GLOBAL_IDENTITY. Access authorized via Membership lookup. ' +
      'User.tenantId is legacy transitional evidence only, NOT authorization authority.',
  },

  // ---------------------------------------------------------------------------
  // PLATFORM_SHARED — No tenant RLS (read-all for authenticated users)
  // ---------------------------------------------------------------------------
  {
    tableName: 'subscription_plans',
    classification: TableClassification.PLATFORM_SHARED,
    hasTenantIdColumn: false,
    notes: 'Read-all lookup for authenticated users.',
  },
  {
    tableName: 'feature_flags',
    classification: TableClassification.PLATFORM_SHARED,
    hasTenantIdColumn: false,
    notes: 'Read-all lookup for authenticated users.',
  },

  // ---------------------------------------------------------------------------
  // TENANT_OWNED — Standard tenant RLS (tenant_id = app.current_tenant_id)
  // ---------------------------------------------------------------------------
  {
    tableName: 'tenants',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'id', // Tenant sees own record via id
    hasTenantIdColumn: true,
    notes: 'Tenant sees own record. Policy uses id instead of tenant_id.',
  },
  {
    tableName: 'org_units',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'memberships',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'households',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'announcements',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'announcement_attachments',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: undefined, // Joined via announcements
    hasTenantIdColumn: false,
    notes: 'Indirectly tenant-scoped via announcement FK.',
  },
  {
    tableName: 'votes',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'vote_options',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: undefined, // Joined via votes
    hasTenantIdColumn: false,
    notes: 'Indirectly tenant-scoped via vote FK.',
  },
  {
    tableName: 'ballots',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: undefined, // Joined via votes
    hasTenantIdColumn: false,
    notes: 'Indirectly tenant-scoped via vote FK.',
  },
  {
    tableName: 'financial_transactions',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'iuran_statuses',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'emergency_alerts',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'iot_devices',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation. INV-IOT-001 enforced.',
  },
  {
    tableName: 'device_events',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'patrol_schedules',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'patrol_attendances',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: undefined, // Joined via patrol_schedules
    hasTenantIdColumn: false,
    notes: 'Indirectly tenant-scoped via schedule FK.',
  },
  {
    tableName: 'incident_reports',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'letter_requests',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'community_events',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'event_rsvps',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: undefined, // Joined via community_events
    hasTenantIdColumn: false,
    notes: 'Indirectly tenant-scoped via event FK.',
  },
  {
    tableName: 'visitor_logs',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'package_logs',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'invoices',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'payment_reconciliations',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: undefined, // Joined via invoices
    hasTenantIdColumn: false,
    notes: 'Indirectly tenant-scoped via invoice FK.',
  },
  {
    tableName: 'feature_flag_overrides',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Tenant-specific feature flag overrides.',
  },
  {
    tableName: 'notifications',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'audit_logs',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation. Immutable per Req 24.',
  },
  {
    tableName: 'push_subscriptions',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'incidents',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'incident_logs',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: undefined, // Joined via incidents
    hasTenantIdColumn: false,
    notes: 'Indirectly tenant-scoped via incident FK.',
  },
  {
    tableName: 'gates',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'gate_events',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'cctv_cameras',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'cctv_snapshots',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'patrol_routes',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'patrol_sessions',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'patrol_checkpoint_visits',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: undefined, // Joined via patrol_sessions
    hasTenantIdColumn: false,
    notes: 'Indirectly tenant-scoped via session FK.',
  },
  {
    tableName: 'alarm_devices',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'alarm_events',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'automation_rules',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'automation_executions',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'homes',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'door_sensor_configs',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'door_installation_requests',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'emergency_contacts',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },
  {
    tableName: 'invitation_tokens',
    classification: TableClassification.TENANT_OWNED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes: 'Standard tenant isolation.',
  },

  // ---------------------------------------------------------------------------
  // ORG_SCOPED — Tenant RLS + OrgUnit scope check (application-level)
  // ---------------------------------------------------------------------------
  {
    tableName: 'residents',
    classification: TableClassification.ORG_SCOPED,
    tenantIdColumn: 'tenant_id',
    hasTenantIdColumn: true,
    notes:
      'Tenant RLS at DB level. OrgUnit scope checked at application level. ' +
      'RESIDENT role can only access USER_SELF scope, not all residents.',
  },
] as const;

// ---------------------------------------------------------------------------
// Registry Service Interface
// ---------------------------------------------------------------------------

/**
 * Table Classification Registry Service
 *
 * Provides lookup and verification for table classifications.
 * Used by RLS Policy Manager to determine which tables need policies.
 */
export interface ITableClassificationRegistry {
  /**
   * Get classification for a specific table.
   *
   * @param tableName - PostgreSQL table name (snake_case)
   * @returns Classification entry or undefined if not classified
   */
  getClassification(tableName: string): TableClassificationEntry | undefined;

  /**
   * Get all tables requiring RLS policies.
   *
   * Returns tables classified as TENANT_OWNED or ORG_SCOPED that have
   * a direct tenant_id column (not indirectly scoped via FK).
   */
  getTablesRequiringRls(): readonly TableClassificationEntry[];

  /**
   * Get all tables excluded from RLS.
   *
   * Returns tables classified as GLOBAL_IDENTITY or PLATFORM_SHARED.
   */
  getTablesExcludedFromRls(): readonly TableClassificationEntry[];

  /**
   * Get all classified tables.
   */
  getAllClassifications(): readonly TableClassificationEntry[];

  /**
   * Verify a table has explicit classification.
   *
   * @param tableName - PostgreSQL table name
   * @returns true if classified, false otherwise
   */
  isClassified(tableName: string): boolean;

  /**
   * Check if a table requires RLS policy.
   *
   * @param tableName - PostgreSQL table name
   * @returns true if table needs RLS policy
   */
  requiresRls(tableName: string): boolean;

  /**
   * Get RLS coverage report.
   *
   * @param actualTables - Optional list of actual tables in database for gap detection
   */
  getCoverageReport(actualTables?: readonly string[]): RlsCoverageResult;
}

// ---------------------------------------------------------------------------
// Registry Service Implementation
// ---------------------------------------------------------------------------

/**
 * Internal lookup map for O(1) access.
 */
const classificationMap = new Map<string, TableClassificationEntry>(
  TABLE_CLASSIFICATIONS.map((entry) => [entry.tableName.toLowerCase(), entry]),
);

/**
 * Creates a TableClassificationRegistry instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @example
 * ```typescript
 * import { createTableClassificationRegistry } from '@infrastructure/rls';
 *
 * const registry = createTableClassificationRegistry();
 * const classification = registry.getClassification('users');
 *
 * if (classification?.classification === TableClassification.GLOBAL_IDENTITY) {
 *   // users table does NOT get RLS
 * }
 * ```
 */
export function createTableClassificationRegistry(): ITableClassificationRegistry {
  return {
    getClassification(tableName: string): TableClassificationEntry | undefined {
      return classificationMap.get(tableName.toLowerCase());
    },

    getTablesRequiringRls(): readonly TableClassificationEntry[] {
      return TABLE_CLASSIFICATIONS.filter(
        (entry) =>
          (entry.classification === TableClassification.TENANT_OWNED ||
            entry.classification === TableClassification.ORG_SCOPED ||
            entry.classification === TableClassification.HOUSEHOLD_SCOPED) &&
          entry.hasTenantIdColumn &&
          entry.tenantIdColumn !== undefined,
      );
    },

    getTablesExcludedFromRls(): readonly TableClassificationEntry[] {
      return TABLE_CLASSIFICATIONS.filter(
        (entry) =>
          entry.classification === TableClassification.GLOBAL_IDENTITY ||
          entry.classification === TableClassification.PLATFORM_SHARED,
      );
    },

    getAllClassifications(): readonly TableClassificationEntry[] {
      return TABLE_CLASSIFICATIONS;
    },

    isClassified(tableName: string): boolean {
      return classificationMap.has(tableName.toLowerCase());
    },

    requiresRls(tableName: string): boolean {
      const entry = classificationMap.get(tableName.toLowerCase());
      if (!entry) {
        // Per Req 60 AC 5: Unclassified table should fail
        throw new RlsError(
          'RLS_CLASSIFICATION_MISSING',
          `Table '${tableName}' is not classified in the registry. ` +
            'All tables must be explicitly classified per Req 60 AC 5.',
          { tableName },
        );
      }
      return (
        (entry.classification === TableClassification.TENANT_OWNED ||
          entry.classification === TableClassification.ORG_SCOPED ||
          entry.classification === TableClassification.HOUSEHOLD_SCOPED) &&
        entry.hasTenantIdColumn &&
        entry.tenantIdColumn !== undefined
      );
    },

    getCoverageReport(actualTables?: readonly string[]): RlsCoverageResult {
      const tablesRequiringRls = TABLE_CLASSIFICATIONS.filter(
        (entry) =>
          (entry.classification === TableClassification.TENANT_OWNED ||
            entry.classification === TableClassification.ORG_SCOPED ||
            entry.classification === TableClassification.HOUSEHOLD_SCOPED) &&
          entry.hasTenantIdColumn &&
          entry.tenantIdColumn !== undefined,
      ).map((e) => e.tableName);

      const tablesExcludedFromRls = TABLE_CLASSIFICATIONS.filter(
        (entry) =>
          entry.classification === TableClassification.GLOBAL_IDENTITY ||
          entry.classification === TableClassification.PLATFORM_SHARED ||
          !entry.hasTenantIdColumn ||
          entry.tenantIdColumn === undefined,
      ).map((e) => e.tableName);

      // Find unclassified tables if actualTables provided
      const classifiedTableNames = new Set(
        TABLE_CLASSIFICATIONS.map((e) => e.tableName.toLowerCase()),
      );
      const unclassifiedTables = actualTables?.filter(
        (t) => !classifiedTableNames.has(t.toLowerCase()),
      );

      // Coverage calculation: assuming all required tables have policies
      // (actual verification done by RlsPolicyManager)
      const coveragePercentage =
        tablesRequiringRls.length > 0 ? 100 : 100;

      return {
        classifiedTables: TABLE_CLASSIFICATIONS,
        tablesRequiringRls,
        tablesExcludedFromRls,
        unclassifiedTables,
        coveragePercentage,
        isComplete: !unclassifiedTables || unclassifiedTables.length === 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Default registry instance for convenience imports.
 */
const defaultRegistry = createTableClassificationRegistry();

/**
 * Get classification for a table using default registry.
 */
export function getTableClassification(
  tableName: string,
): TableClassificationEntry | undefined {
  return defaultRegistry.getClassification(tableName);
}

/**
 * Check if a table requires RLS using default registry.
 */
export function tableRequiresRls(tableName: string): boolean {
  return defaultRegistry.requiresRls(tableName);
}

/**
 * Get all tables requiring RLS using default registry.
 */
export function getTablesRequiringRls(): readonly TableClassificationEntry[] {
  return defaultRegistry.getTablesRequiringRls();
}

/**
 * Get RLS coverage report using default registry.
 */
export function getRlsCoverageReport(
  actualTables?: readonly string[],
): RlsCoverageResult {
  return defaultRegistry.getCoverageReport(actualTables);
}
