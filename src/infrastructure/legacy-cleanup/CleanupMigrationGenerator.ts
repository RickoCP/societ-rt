/**
 * Cleanup Migration Generator — Generates SQL migration scripts for schema cleanup.
 *
 * This service generates:
 * - SQL to drop User.tenantId column
 * - SQL to remove unused UserRole enum values (if any)
 * - Rollback SQL for recovery
 *
 * **CRITICAL:** Generated migrations are destructive and require:
 * - Pre-flight verification to pass
 * - Backup checkpoint to exist
 * - Explicit approval
 * - Maintenance window
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 2, 3, 6)
 */

import type {
  ICleanupMigrationGenerator,
  CleanupMigrationScript,
  SchemaChangeOperation,
} from './types';
import {
  CLEANUP_SERVICE_VERSION,
} from './types';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies for the Cleanup Migration Generator.
 */
export interface CleanupMigrationGeneratorDeps {
  /** Logger for recording generation progress */
  readonly logger?: {
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
  };
  /** Custom date provider for testing */
  readonly dateProvider?: () => Date;
}

// ---------------------------------------------------------------------------
// SQL Templates
// ---------------------------------------------------------------------------

/**
 * SQL to drop the tenant_id column from users table.
 */
const DROP_TENANT_ID_SQL = `
-- Drop User.tenantId column (Requirement 13 AC 2)
-- DESTRUCTIVE: This operation cannot be undone without backup
ALTER TABLE "users" DROP COLUMN IF EXISTS "tenant_id";
`.trim();

/**
 * SQL to re-add the tenant_id column (rollback).
 */
const ADD_TENANT_ID_SQL = `
-- Rollback: Re-add User.tenantId column
-- NOTE: Data will need to be restored from backup
ALTER TABLE "users" ADD COLUMN "tenant_id" VARCHAR(255);
`.trim();

/**
 * SQL to drop the foreign key constraint on tenant_id (if exists).
 */
const DROP_TENANT_FK_SQL = `
-- Drop foreign key constraint on tenant_id (if exists)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_tenant_id_fkey";
`.trim();

/**
 * SQL to drop indexes on tenant_id column.
 */
const DROP_TENANT_INDEXES_SQL = `
-- Drop indexes on tenant_id
DROP INDEX IF EXISTS "users_tenant_id_id_idx";
DROP INDEX IF EXISTS "users_tenant_id_email_unique";
DROP INDEX IF EXISTS "users_tenant_id_created_at_idx";
DROP INDEX IF EXISTS "users_tenant_id_status_idx";
`.trim();

/**
 * SQL to drop unique constraint on (tenant_id, email).
 */
const DROP_TENANT_EMAIL_UNIQUE_SQL = `
-- Drop unique constraint on (tenant_id, email)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_tenant_id_email_unique";
`.trim();

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for Cleanup Migration Generator.
 *
 * @param deps - Service dependencies
 * @returns Cleanup Migration Generator instance
 */
export function createCleanupMigrationGenerator(
  deps: CleanupMigrationGeneratorDeps = {},
): ICleanupMigrationGenerator {
  const {
    logger = console,
    dateProvider = () => new Date(),
  } = deps;

  /**
   * Generate script ID.
   */
  function generateScriptId(): string {
    return `cleanup-migration-${Date.now()}`;
  }

  /**
   * Generate correlation ID.
   */
  function generateCorrelationId(): string {
    return `migration-gen-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Get operations for dropping User.tenantId column.
   */
  function getDropTenantIdOperations(): readonly SchemaChangeOperation[] {
    const operations: SchemaChangeOperation[] = [];
    let order = 0;

    // 1. Drop foreign key constraint first
    operations.push({
      type: 'DROP_CONSTRAINT',
      tableName: 'users',
      columnName: 'tenant_id',
      sql: DROP_TENANT_FK_SQL,
      rollbackSql: `
-- Rollback: Re-add foreign key constraint (requires column to exist)
-- ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" 
--   FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
-- NOTE: Execute this after restoring tenant_id column from backup
      `.trim(),
      isDestructive: true,
      description: 'Drop foreign key constraint on User.tenantId',
      order: order++,
    });

    // 2. Drop unique constraint on (tenant_id, email)
    operations.push({
      type: 'DROP_CONSTRAINT',
      tableName: 'users',
      columnName: 'tenant_id',
      sql: DROP_TENANT_EMAIL_UNIQUE_SQL,
      rollbackSql: `
-- Rollback: Re-add unique constraint (requires column to exist)
-- ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_email_unique" 
--   UNIQUE ("tenant_id", "email");
-- NOTE: Execute this after restoring tenant_id column from backup
      `.trim(),
      isDestructive: true,
      description: 'Drop unique constraint on (tenant_id, email)',
      order: order++,
    });

    // 3. Drop indexes on tenant_id
    operations.push({
      type: 'DROP_INDEX',
      tableName: 'users',
      columnName: 'tenant_id',
      sql: DROP_TENANT_INDEXES_SQL,
      rollbackSql: `
-- Rollback: Re-create indexes (requires column to exist)
-- CREATE INDEX "users_tenant_id_id_idx" ON "users"("tenant_id", "id");
-- CREATE INDEX "users_tenant_id_created_at_idx" ON "users"("tenant_id", "created_at");
-- CREATE INDEX "users_tenant_id_status_idx" ON "users"("tenant_id", "status");
-- NOTE: Execute this after restoring tenant_id column from backup
      `.trim(),
      isDestructive: true,
      description: 'Drop indexes on tenant_id column',
      order: order++,
    });

    // 4. Finally, drop the column itself
    operations.push({
      type: 'DROP_COLUMN',
      tableName: 'users',
      columnName: 'tenant_id',
      sql: DROP_TENANT_ID_SQL,
      rollbackSql: ADD_TENANT_ID_SQL,
      isDestructive: true,
      description: 'Drop User.tenantId column from users table',
      order: order++,
    });

    return operations;
  }

  /**
   * Get operations for removing unused UserRole enum values.
   *
   * Note: In PostgreSQL, removing enum values is complex and may require
   * creating a new enum type. For MVP, we document but don't auto-generate
   * this migration.
   */
  function getRemoveEnumValuesOperations(): readonly SchemaChangeOperation[] {
    // Currently, no enum values need to be removed
    // The UserRole enum values are still in use by the legacy path
    // This would be implemented if/when specific enum values need removal

    logger.info?.('No UserRole enum values identified for removal');
    return [];
  }

  /**
   * Generate the complete migration script.
   */
  async function generateMigration(
    correlationId?: string,
  ): Promise<CleanupMigrationScript> {
    const now = dateProvider();
    const scriptId = generateScriptId();
    const corrId = correlationId ?? generateCorrelationId();

    logger.info?.('Generating cleanup migration script', { scriptId, correlationId: corrId });

    // Collect all operations
    const dropTenantIdOps = getDropTenantIdOperations();
    const removeEnumOps = getRemoveEnumValuesOperations();

    const allOperations = [...dropTenantIdOps, ...removeEnumOps].sort((a, b) => a.order - b.order);

    // Build combined SQL
    const forwardSql = allOperations.map(op => op.sql).join('\n\n');
    const rollbackSql = allOperations
      .slice()
      .reverse()
      .map(op => op.rollbackSql)
      .join('\n\n');

    // Pre-conditions
    const preConditions = [
      'FASE 1.14 (Remove User.tenantId Dependency) must be complete',
      '24-hour stabilization window must have passed',
      'Backup checkpoint must exist and be valid',
      'Explicit destructive operation approval must be granted',
      'Application must be in read-only mode (maintenance window)',
    ];

    // Post-conditions
    const postConditions = [
      'User.tenantId column no longer exists in users table',
      'All indexes referencing tenant_id have been dropped',
      'All constraints referencing tenant_id have been dropped',
      'Application health check passes',
      'Authorization flows continue to work via Membership',
    ];

    const script: CleanupMigrationScript = {
      scriptId,
      version: CLEANUP_SERVICE_VERSION,
      generatedAt: now,
      operations: allOperations,
      forwardSql,
      rollbackSql,
      preConditions,
      postConditions,
      estimatedDurationSeconds: 60, // Estimate based on table size
      requiresMaintenanceWindow: true,
      correlationId: corrId,
    };

    logger.info?.('Migration script generated', {
      scriptId,
      operationsCount: allOperations.length,
      requiresMaintenanceWindow: true,
    });

    return script;
  }

  /**
   * Validate a generated migration.
   */
  async function validateMigration(
    script: CleanupMigrationScript,
  ): Promise<{ valid: boolean; issues: readonly string[] }> {
    const issues: string[] = [];

    // Check for required operations
    const hasDropColumn = script.operations.some(
      op => op.type === 'DROP_COLUMN' && op.columnName === 'tenant_id',
    );
    if (!hasDropColumn) {
      issues.push('Migration does not include DROP_COLUMN operation for tenant_id');
    }

    // Check for maintenance window requirement
    if (!script.requiresMaintenanceWindow) {
      issues.push('Migration should require maintenance window (destructive operation)');
    }

    // Check for pre-conditions
    if (script.preConditions.length === 0) {
      issues.push('Migration should have pre-conditions defined');
    }

    // Check for post-conditions
    if (script.postConditions.length === 0) {
      issues.push('Migration should have post-conditions defined');
    }

    // Check for rollback SQL
    if (!script.rollbackSql || script.rollbackSql.trim() === '') {
      issues.push('Migration should have rollback SQL defined');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  return {
    generateMigration,
    getDropTenantIdOperations,
    getRemoveEnumValuesOperations,
    validateMigration,
  };
}

/**
 * Default Cleanup Migration Generator instance factory.
 */
export const CleanupMigrationGeneratorImpl = createCleanupMigrationGenerator;

/**
 * Prisma schema update instructions.
 *
 * After running the migration, the Prisma schema must be updated:
 *
 * 1. Remove the tenantId field from the User model:
 *    ```prisma
 *    model User {
 *      id                  String     @id @default(uuid()) @map("id")
 *      // REMOVE: tenantId            String     @map("tenant_id")
 *      name                String     @map("name")
 *      ...
 *    }
 *    ```
 *
 * 2. Remove the tenant relation from User model:
 *    ```prisma
 *    // REMOVE: tenant Tenant @relation(fields: [tenantId], references: [id])
 *    ```
 *
 * 3. Update the unique constraint:
 *    ```prisma
 *    // CHANGE FROM: @@unique([tenantId, email], map: "users_tenant_id_email_unique")
 *    // CHANGE TO: @@unique([email], map: "users_email_unique")
 *    ```
 *
 * 4. Remove indexes referencing tenant_id:
 *    ```prisma
 *    // REMOVE: @@index([tenantId, id], map: "users_tenant_id_id_idx")
 *    // REMOVE: @@index([tenantId, createdAt], map: "users_tenant_id_created_at_idx")
 *    // REMOVE: @@index([tenantId, status], map: "users_tenant_id_status_idx")
 *    ```
 *
 * 5. Update the users relation in Tenant model:
 *    ```prisma
 *    model Tenant {
 *      ...
 *      // REMOVE: users                 User[]
 *      ...
 *    }
 *    ```
 *
 * 6. Run `npx prisma generate` to regenerate the client
 */
export const PRISMA_SCHEMA_UPDATE_INSTRUCTIONS = `
After running the cleanup migration, update the Prisma schema:

1. Open prisma/schema.prisma

2. In the User model:
   - Remove: tenantId String @map("tenant_id")
   - Remove: tenant Tenant @relation(fields: [tenantId], references: [id])
   - Update @@unique: Change from [tenantId, email] to just [email]
   - Remove indexes: @@index([tenantId, ...])

3. In the Tenant model:
   - Remove: users User[]

4. Run: npx prisma generate

5. Verify the generated client no longer includes User.tenantId
`;
