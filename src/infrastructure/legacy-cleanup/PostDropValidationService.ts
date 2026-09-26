/**
 * Post-Drop Validation Service — Validates schema state after column drop.
 *
 * This service verifies:
 * - User.tenantId column has been removed
 * - Related indexes have been dropped
 * - Related constraints have been dropped
 * - Application still functions correctly
 *
 * **CRITICAL:** Validation MUST pass before considering cleanup complete.
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 2, 6)
 */

import type {
  IPostDropValidationService,
  PostDropValidationResult,
  SchemaValidationCheck,
} from './types';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Database client interface for validation operations.
 */
export interface ValidationDatabaseClient {
  /** Query raw SQL */
  $queryRawUnsafe: <T>(sql: string) => Promise<T>;
  /** Execute raw SQL */
  $executeRawUnsafe: (sql: string) => Promise<number>;
}

/**
 * Dependencies for the Post-Drop Validation Service.
 */
export interface PostDropValidationServiceDeps {
  /** Database client */
  readonly db: ValidationDatabaseClient;
  /** Logger for recording validation progress */
  readonly logger?: {
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
  /** Custom date provider for testing */
  readonly dateProvider?: () => Date;
  /** Health check endpoint URL (for application health verification) */
  readonly healthCheckUrl?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for Post-Drop Validation Service.
 *
 * @param deps - Service dependencies
 * @returns Post-Drop Validation Service instance
 */
export function createPostDropValidationService(
  deps: PostDropValidationServiceDeps,
): IPostDropValidationService {
  const {
    db,
    logger = console,
    dateProvider = () => new Date(),
    healthCheckUrl,
  } = deps;

  /**
   * Generate correlation ID.
   */
  function generateCorrelationId(): string {
    return `postdrop-validation-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Check if a column exists in a table.
   */
  async function checkColumnExists(
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    try {
      const result = await db.$queryRawUnsafe<{ exists: boolean }[]>(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
          AND column_name = '${columnName}'
        ) as exists
      `);
      return result[0]?.exists ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Check if an index exists.
   */
  async function checkIndexExists(indexName: string): Promise<boolean> {
    try {
      const result = await db.$queryRawUnsafe<{ exists: boolean }[]>(`
        SELECT EXISTS (
          SELECT FROM pg_indexes 
          WHERE schemaname = 'public' 
          AND indexname = '${indexName}'
        ) as exists
      `);
      return result[0]?.exists ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Check if a constraint exists.
   */
  async function checkConstraintExists(
    tableName: string,
    constraintName: string,
  ): Promise<boolean> {
    try {
      const result = await db.$queryRawUnsafe<{ exists: boolean }[]>(`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
          AND constraint_name = '${constraintName}'
        ) as exists
      `);
      return result[0]?.exists ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Check if User.tenantId column exists.
   */
  async function columnExists(): Promise<boolean> {
    return checkColumnExists('users', 'tenant_id');
  }

  /**
   * Verify schema state after column drop.
   */
  async function verifySchemaState(): Promise<SchemaValidationCheck[]> {
    const checks: SchemaValidationCheck[] = [];

    // 1. Check that tenant_id column does NOT exist (should be false after cleanup)
    const tenantIdExists = await checkColumnExists('users', 'tenant_id');
    checks.push({
      name: 'User.tenantId column removed',
      passed: !tenantIdExists,
      category: 'schema',
      evidence: tenantIdExists
        ? 'Column tenant_id still exists in users table'
        : 'Column tenant_id has been removed from users table',
      errorMessage: tenantIdExists
        ? 'User.tenantId column should not exist after cleanup'
        : undefined,
    });

    // 2. Check that foreign key constraint has been dropped
    const fkExists = await checkConstraintExists('users', 'users_tenant_id_fkey');
    checks.push({
      name: 'Foreign key constraint removed',
      passed: !fkExists,
      category: 'schema',
      evidence: fkExists
        ? 'Constraint users_tenant_id_fkey still exists'
        : 'Constraint users_tenant_id_fkey has been removed',
      errorMessage: fkExists
        ? 'Foreign key constraint should be dropped before column removal'
        : undefined,
    });

    // 3. Check that unique constraint on (tenant_id, email) has been dropped
    const uniqueExists = await checkConstraintExists('users', 'users_tenant_id_email_unique');
    checks.push({
      name: 'Unique constraint (tenant_id, email) removed',
      passed: !uniqueExists,
      category: 'schema',
      evidence: uniqueExists
        ? 'Constraint users_tenant_id_email_unique still exists'
        : 'Constraint users_tenant_id_email_unique has been removed',
      errorMessage: uniqueExists
        ? 'Unique constraint should be dropped before column removal'
        : undefined,
    });

    // 4. Check that indexes on tenant_id have been dropped
    const indexNames = [
      'users_tenant_id_id_idx',
      'users_tenant_id_created_at_idx',
      'users_tenant_id_status_idx',
    ];

    for (const indexName of indexNames) {
      const indexExists = await checkIndexExists(indexName);
      checks.push({
        name: `Index ${indexName} removed`,
        passed: !indexExists,
        category: 'schema',
        evidence: indexExists
          ? `Index ${indexName} still exists`
          : `Index ${indexName} has been removed`,
        errorMessage: indexExists ? `Index ${indexName} should be dropped` : undefined,
      });
    }

    // 5. Verify memberships table still exists (should not be affected)
    const membershipsExists = await db.$queryRawUnsafe<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'memberships'
      ) as exists
    `);
    checks.push({
      name: 'Memberships table intact',
      passed: membershipsExists[0]?.exists ?? false,
      category: 'schema',
      evidence: membershipsExists[0]?.exists
        ? 'Memberships table exists and is intact'
        : 'Memberships table not found (unexpected)',
      errorMessage: membershipsExists[0]?.exists
        ? undefined
        : 'Memberships table should exist after cleanup',
    });

    return checks;
  }

  /**
   * Verify data integrity after schema change.
   */
  async function verifyDataIntegrity(): Promise<SchemaValidationCheck[]> {
    const checks: SchemaValidationCheck[] = [];

    // 1. Check that users table still has data
    try {
      const userCount = await db.$queryRawUnsafe<{ count: bigint }[]>(
        'SELECT COUNT(*) as count FROM "users"',
      );
      const count = Number(userCount[0]?.count ?? 0);
      checks.push({
        name: 'Users table has data',
        passed: count > 0,
        category: 'data',
        evidence: `Users table has ${count} rows`,
        errorMessage: count === 0 ? 'Users table appears empty after cleanup' : undefined,
      });
    } catch (error) {
      checks.push({
        name: 'Users table accessible',
        passed: false,
        category: 'data',
        evidence: 'Failed to query users table',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    // 2. Check that memberships table has data
    try {
      const membershipCount = await db.$queryRawUnsafe<{ count: bigint }[]>(
        'SELECT COUNT(*) as count FROM "memberships"',
      );
      const count = Number(membershipCount[0]?.count ?? 0);
      checks.push({
        name: 'Memberships table has data',
        passed: count > 0,
        category: 'data',
        evidence: `Memberships table has ${count} rows`,
        // Not an error if empty - might be a fresh install
      });
    } catch (error) {
      checks.push({
        name: 'Memberships table accessible',
        passed: false,
        category: 'data',
        evidence: 'Failed to query memberships table',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    // 3. Verify user-membership relationship integrity
    try {
      // Check for orphaned memberships (memberships without valid users)
      const orphanedCount = await db.$queryRawUnsafe<{ count: bigint }[]>(`
        SELECT COUNT(*) as count FROM "memberships" m
        LEFT JOIN "users" u ON m."user_id" = u."id"
        WHERE u."id" IS NULL
      `);
      const count = Number(orphanedCount[0]?.count ?? 0);
      checks.push({
        name: 'No orphaned memberships',
        passed: count === 0,
        category: 'data',
        evidence: count === 0
          ? 'All memberships have valid user references'
          : `Found ${count} memberships without valid users`,
        errorMessage: count > 0 ? 'Data integrity issue: orphaned memberships found' : undefined,
      });
    } catch (error) {
      checks.push({
        name: 'User-membership integrity',
        passed: false,
        category: 'data',
        evidence: 'Failed to verify user-membership relationship',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    return checks;
  }

  /**
   * Verify application health after schema change.
   */
  async function verifyApplicationHealth(): Promise<{
    healthy: boolean;
    checks: readonly { name: string; passed: boolean; message?: string }[];
  }> {
    const checks: { name: string; passed: boolean; message?: string }[] = [];

    // 1. Database connection check
    try {
      await db.$queryRawUnsafe('SELECT 1');
      checks.push({
        name: 'Database connection',
        passed: true,
        message: 'Database connection successful',
      });
    } catch (error) {
      checks.push({
        name: 'Database connection',
        passed: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // 2. Users table query check (without tenant_id)
    try {
      await db.$queryRawUnsafe('SELECT id, name, email FROM "users" LIMIT 1');
      checks.push({
        name: 'Users table query',
        passed: true,
        message: 'Can query users table without tenant_id',
      });
    } catch (error) {
      checks.push({
        name: 'Users table query',
        passed: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // 3. Memberships table query check
    try {
      await db.$queryRawUnsafe('SELECT id, user_id, tenant_id, role FROM "memberships" LIMIT 1');
      checks.push({
        name: 'Memberships table query',
        passed: true,
        message: 'Can query memberships table',
      });
    } catch (error) {
      checks.push({
        name: 'Memberships table query',
        passed: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // 4. External health check (if URL provided)
    if (healthCheckUrl) {
      try {
        const response = await fetch(healthCheckUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        checks.push({
          name: 'Application health endpoint',
          passed: response.ok,
          message: response.ok ? 'Health check passed' : `Health check returned ${response.status}`,
        });
      } catch (error) {
        checks.push({
          name: 'Application health endpoint',
          passed: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const healthy = checks.every(c => c.passed);
    return { healthy, checks };
  }

  /**
   * Run smoke tests against critical paths.
   */
  async function runSmokeTests(): Promise<{
    passed: boolean;
    results: readonly { testName: string; passed: boolean; error?: string }[];
  }> {
    const results: { testName: string; passed: boolean; error?: string }[] = [];

    // 1. Membership resolution query (critical for authorization)
    try {
      await db.$queryRawUnsafe(`
        SELECT m.id, m.user_id, m.tenant_id, m.role, m.status, m.org_unit_id
        FROM "memberships" m
        WHERE m.status = 'ACTIVE'
        LIMIT 1
      `);
      results.push({ testName: 'Membership resolution query', passed: true });
    } catch (error) {
      results.push({
        testName: 'Membership resolution query',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 2. User lookup by email (should work without tenant_id unique constraint)
    try {
      await db.$queryRawUnsafe(`
        SELECT id, email, name, role, status
        FROM "users"
        WHERE email IS NOT NULL
        LIMIT 1
      `);
      results.push({ testName: 'User lookup by email', passed: true });
    } catch (error) {
      results.push({
        testName: 'User lookup by email',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 3. User-membership join (critical for authorization context resolution)
    try {
      await db.$queryRawUnsafe(`
        SELECT u.id, u.name, u.email, m.role, m.tenant_id, m.org_unit_id
        FROM "users" u
        JOIN "memberships" m ON m.user_id = u.id
        WHERE m.status = 'ACTIVE'
        LIMIT 1
      `);
      results.push({ testName: 'User-membership join query', passed: true });
    } catch (error) {
      results.push({
        testName: 'User-membership join query',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 4. Tenant query (should still work)
    try {
      await db.$queryRawUnsafe(`
        SELECT id, name, subdomain
        FROM "tenants"
        LIMIT 1
      `);
      results.push({ testName: 'Tenant query', passed: true });
    } catch (error) {
      results.push({
        testName: 'Tenant query',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 5. OrgUnit query (should still work)
    try {
      await db.$queryRawUnsafe(`
        SELECT id, tenant_id, name, type, path
        FROM "org_units"
        LIMIT 1
      `);
      results.push({ testName: 'OrgUnit query', passed: true });
    } catch (error) {
      results.push({
        testName: 'OrgUnit query',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const passed = results.every(r => r.passed);
    return { passed, results };
  }

  /**
   * Run full post-drop validation.
   */
  async function validate(correlationId?: string): Promise<PostDropValidationResult> {
    const now = dateProvider();
    const corrId = correlationId ?? generateCorrelationId();

    logger.info?.('Starting post-drop validation', { correlationId: corrId });

    // Run all validation checks
    const schemaChecks = await verifySchemaState();
    const dataChecks = await verifyDataIntegrity();
    const healthResult = await verifyApplicationHealth();
    const smokeTestResult = await runSmokeTests();

    // Convert health checks and smoke tests to SchemaValidationCheck format
    const applicationChecks: SchemaValidationCheck[] = [
      ...healthResult.checks.map(c => ({
        name: c.name,
        passed: c.passed,
        category: 'application' as const,
        evidence: c.message ?? '',
        errorMessage: c.passed ? undefined : c.message,
      })),
      ...smokeTestResult.results.map(r => ({
        name: `Smoke: ${r.testName}`,
        passed: r.passed,
        category: 'application' as const,
        evidence: r.passed ? 'Test passed' : r.error ?? 'Test failed',
        errorMessage: r.passed ? undefined : r.error,
      })),
    ];

    const allChecks = [...schemaChecks, ...dataChecks, ...applicationChecks];
    const failedChecks = allChecks.filter(c => !c.passed);
    const warnings: string[] = [];

    // Add warnings for non-critical issues
    if (failedChecks.some(c => c.category === 'data' && c.name.includes('empty'))) {
      warnings.push('Some data tables appear empty - this may be expected for fresh installations');
    }

    const valid = failedChecks.length === 0;

    logger.info?.(
      `Post-drop validation ${valid ? 'PASSED' : 'FAILED'}`,
      {
        correlationId: corrId,
        totalChecks: allChecks.length,
        failedChecks: failedChecks.length,
      },
    );

    return {
      valid,
      validatedAt: now,
      checks: allChecks,
      failedChecks,
      warnings,
      correlationId: corrId,
    };
  }

  return {
    validate,
    columnExists,
    verifyApplicationHealth,
    runSmokeTests,
  };
}

/**
 * Default Post-Drop Validation Service instance factory.
 */
export const PostDropValidationServiceImpl = createPostDropValidationService;
