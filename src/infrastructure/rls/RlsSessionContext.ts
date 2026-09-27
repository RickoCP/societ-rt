/**
 * RLS Session Context
 *
 * Manages PostgreSQL session variables for RLS tenant context.
 * Ensures proper transaction scoping and connection pool safety.
 *
 * **CRITICAL RULES:**
 * - Use SET LOCAL (transaction-scoped), NOT SET (session-scoped)
 * - Clear context before returning connection to pool
 * - Fail closed if session variable not set
 *
 * @see FASE 1.12 Task 30: RLS Policy Implementation
 * @see Requirement 10: PostgreSQL Row-Level Security Foundation (AC 2, 7)
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement (AC 1-3)
 */

import {
  RLS_SESSION_VARIABLE,
  RlsError,
} from './types';

// ---------------------------------------------------------------------------
// UUID Validation
// ---------------------------------------------------------------------------

/**
 * UUID validation regex.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a tenant ID is a valid UUID.
 *
 * @param tenantId - Tenant ID to validate
 * @returns true if valid UUID
 */
function isValidUuid(tenantId: string): boolean {
  return UUID_REGEX.test(tenantId);
}

// ---------------------------------------------------------------------------
// Session Context Service Interface
// ---------------------------------------------------------------------------

/**
 * RLS Session Context Service
 *
 * Manages setting and clearing tenant context for RLS policies.
 * Uses SET LOCAL for transaction-scoped context (connection pool safe).
 */
export interface IRlsSessionContextService {
  /**
   * Generate SQL to set tenant context (SET LOCAL).
   *
   * CRITICAL: This uses SET LOCAL which is transaction-scoped.
   * The context is automatically cleared when transaction ends.
   *
   * @param tenantId - Tenant UUID to set as current context
   * @returns SQL statement to execute
   * @throws RlsError if tenantId is not a valid UUID
   */
  getSetContextSql(tenantId: string): string;

  /**
   * Generate SQL to clear tenant context.
   *
   * Should be called before returning connection to pool as defense-in-depth.
   * SET LOCAL is already transaction-scoped, but this adds extra safety.
   *
   * @returns SQL statement to execute
   */
  getClearContextSql(): string;

  /**
   * Generate SQL to get current tenant context.
   *
   * @returns SQL statement to execute
   */
  getContextSql(): string;

  /**
   * Validate tenant ID format.
   *
   * @param tenantId - Tenant ID to validate
   * @returns true if valid UUID format
   */
  validateTenantId(tenantId: string): boolean;

  /**
   * Get the session variable name.
   *
   * @returns Session variable name (app.current_tenant_id)
   */
  getSessionVariableName(): string;

  /**
   * Generate SQL for wrapped query execution with tenant context.
   *
   * Returns SQL that sets context, executes query, and clears context.
   * Useful for ad-hoc queries outside normal transaction flow.
   *
   * @param tenantId - Tenant UUID
   * @param querySql - SQL query to execute
   * @returns Wrapped SQL statement
   */
  wrapQueryWithContext(tenantId: string, querySql: string): string;
}

// ---------------------------------------------------------------------------
// Session Context Service Implementation
// ---------------------------------------------------------------------------

/**
 * Creates an RlsSessionContextService instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @example
 * ```typescript
 * import { createRlsSessionContextService } from '@infrastructure/rls';
 *
 * const contextService = createRlsSessionContextService();
 *
 * // Within a transaction:
 * await prisma.$executeRawUnsafe(contextService.getSetContextSql(tenantId));
 * // ... execute queries (RLS policies will filter by tenant)
 * // Context automatically cleared when transaction ends (SET LOCAL)
 *
 * // For extra safety before returning connection to pool:
 * await prisma.$executeRawUnsafe(contextService.getClearContextSql());
 * ```
 */
export function createRlsSessionContextService(): IRlsSessionContextService {
  return {
    getSetContextSql(tenantId: string): string {
      if (!tenantId || !isValidUuid(tenantId)) {
        throw new RlsError(
          'RLS_INVALID_TENANT_ID',
          `Invalid tenant ID format: '${tenantId}'. Must be a valid UUID.`,
          { tenantId },
        );
      }

      // CRITICAL: Use SET LOCAL for transaction-scoped context
      // This ensures context is automatically cleared when transaction ends,
      // preventing tenant context leakage in pooled connections.
      return `SET LOCAL "${RLS_SESSION_VARIABLE}" = '${tenantId}';`;
    },

    getClearContextSql(): string {
      // RESET clears the variable to its default (empty/null)
      // This is defense-in-depth; SET LOCAL already clears on transaction end
      return `RESET "${RLS_SESSION_VARIABLE}";`;
    },

    getContextSql(): string {
      // current_setting returns empty string if not set and missing_ok is true
      return `SELECT current_setting('${RLS_SESSION_VARIABLE}', true) AS current_tenant_id;`;
    },

    validateTenantId(tenantId: string): boolean {
      return isValidUuid(tenantId);
    },

    getSessionVariableName(): string {
      return RLS_SESSION_VARIABLE;
    },

    wrapQueryWithContext(tenantId: string, querySql: string): string {
      if (!tenantId || !isValidUuid(tenantId)) {
        throw new RlsError(
          'RLS_INVALID_TENANT_ID',
          `Invalid tenant ID format: '${tenantId}'. Must be a valid UUID.`,
          { tenantId },
        );
      }

      // Wrap query in transaction with SET LOCAL
      return `
BEGIN;
SET LOCAL "${RLS_SESSION_VARIABLE}" = '${tenantId}';
${querySql}
COMMIT;
`.trim();
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Default service instance for convenience imports.
 */
const defaultService = createRlsSessionContextService();

/**
 * Generate SQL to set tenant context.
 *
 * @param tenantId - Tenant UUID
 * @returns SQL statement
 */
export function getSetRlsContextSql(tenantId: string): string {
  return defaultService.getSetContextSql(tenantId);
}

/**
 * Generate SQL to clear tenant context.
 *
 * @returns SQL statement
 */
export function getClearRlsContextSql(): string {
  return defaultService.getClearContextSql();
}

/**
 * Generate SQL to get current tenant context.
 *
 * @returns SQL statement
 */
export function getCurrentRlsContextSql(): string {
  return defaultService.getContextSql();
}

/**
 * Validate tenant ID format.
 *
 * @param tenantId - Tenant ID to validate
 * @returns true if valid UUID
 */
export function validateRlsTenantId(tenantId: string): boolean {
  return defaultService.validateTenantId(tenantId);
}

/**
 * Get the RLS session variable name.
 *
 * @returns Session variable name
 */
export function getRlsSessionVariableName(): string {
  return defaultService.getSessionVariableName();
}

// ---------------------------------------------------------------------------
// Prisma Transaction Helper Types
// ---------------------------------------------------------------------------

/**
 * Options for RLS-aware Prisma operations.
 */
export interface RlsTransactionOptions {
  /** Tenant ID for RLS context */
  tenantId: string;
  /** Transaction timeout in milliseconds */
  timeout?: number;
  /** Isolation level */
  isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
}

/**
 * Instructions for using RLS with Prisma.
 *
 * **Usage Pattern:**
 *
 * ```typescript
 * import { createRlsSessionContextService } from '@infrastructure/rls';
 * import { prisma } from '@infrastructure/database';
 *
 * const rlsContext = createRlsSessionContextService();
 *
 * async function queryWithRls<T>(
 *   tenantId: string,
 *   operation: (tx: PrismaClient) => Promise<T>
 * ): Promise<T> {
 *   return prisma.$transaction(async (tx) => {
 *     // Set tenant context (transaction-scoped via SET LOCAL)
 *     await tx.$executeRawUnsafe(rlsContext.getSetContextSql(tenantId));
 *
 *     // Execute operation - RLS policies will filter by tenant
 *     const result = await operation(tx);
 *
 *     // Context automatically cleared when transaction ends
 *     return result;
 *   });
 * }
 *
 * // Usage:
 * const residents = await queryWithRls(authContext.tenantId, async (tx) => {
 *   return tx.resident.findMany();
 * });
 * ```
 *
 * **Connection Pool Safety:**
 *
 * SET LOCAL ensures the tenant context is transaction-scoped:
 * 1. Context is set at transaction start
 * 2. All queries within transaction use this context
 * 3. Context is automatically cleared when transaction ends (commit or rollback)
 * 4. Connection returned to pool has no tenant context
 *
 * This prevents tenant context leakage between requests using pooled connections.
 *
 * **Fail-Closed Behavior:**
 *
 * If tenant context is not set:
 * - RLS policies check: tenant_id = current_setting('app.current_tenant_id')::uuid
 * - current_setting returns empty string or throws if not set
 * - Comparison with empty string or type cast failure = NO ROWS RETURNED
 * - This is "fail-closed" - no data leak on missing context
 */
export const RLS_PRISMA_USAGE_GUIDE = `
RLS with Prisma Integration Guide
=================================

1. Always use SET LOCAL (not SET) for transaction-scoped context
2. Execute within $transaction to ensure proper scoping
3. Context automatically clears when transaction ends
4. Connection pool safety is maintained

Example:
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(getSetRlsContextSql(tenantId));
    return tx.resident.findMany(); // RLS filters by tenant
  });
`;
