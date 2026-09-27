/**
 * RLS Staging Migration Execution Script
 *
 * Executes Row-Level Security (RLS) migration on staging database using
 * the RlsMigrationService for atomic deployment with rollback capability.
 *
 * CRITICAL: This script is designed for STAGING environment only.
 * DO NOT run directly in production — use CI/CD pipeline instead.
 *
 * @see FASE 2.7 Task 16.1: Run RLS migration on staging database
 * @see Requirement 8.8: Apply migration in staging environment
 * @see Design Section 7: RLS Database Migration
 *
 * Usage:
 *   # Dry run (generate SQL only)
 *   npx tsx scripts/rls/execute-staging-migration.ts --dry-run
 *
 *   # Execute migration
 *   npx tsx scripts/rls/execute-staging-migration.ts
 *
 *   # Execute rollback
 *   npx tsx scripts/rls/execute-staging-migration.ts --rollback
 *
 *   # Verify RLS state
 *   npx tsx scripts/rls/execute-staging-migration.ts --verify
 */

/**
 * IMPORTANT: This script uses relative imports because it's executed via tsx
 * from the scripts directory, not through the Next.js build system.
 */

import 'dotenv/config';
import { Client } from 'pg';
import {
  createRlsMigrationService,
  type RlsMigrationResult,
  type RlsMigrationOptions,
  type RlsVerificationResult,
} from '../../src/infrastructure/rls/index';
import { generateCorrelationId } from '../../src/infrastructure/utils/correlationId';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MigrationConfig {
  databaseUrl: string;
  environment: string;
  dryRun: boolean;
  rollback: boolean;
  verify: boolean;
  verbose: boolean;
}

interface MigrationExecutionResult {
  success: boolean;
  correlationId: string;
  environment: string;
  timestamp: Date;
  durationMs: number;
  migrationResult?: RlsMigrationResult;
  verificationResult?: RlsVerificationResult;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ---------------------------------------------------------------------------
// Environment Validation
// ---------------------------------------------------------------------------

/**
 * Validates that we're running against a staging environment.
 *
 * CRITICAL: Blocks execution if DATABASE_URL appears to be production.
 */
function validateStagingEnvironment(config: MigrationConfig): void {
  const url = config.databaseUrl.toLowerCase();

  // Block production indicators
  const productionIndicators = [
    'production',
    'prod-',
    '-prod',
    '_prod',
    'prd-',
    'live',
    'main-db',
  ];

  const hasProductionIndicator = productionIndicators.some(
    indicator => url.includes(indicator),
  );

  // Require staging indicators
  const stagingIndicators = [
    'staging',
    'stage',
    'stg',
    'uat',
    'preprod',
    'pre-prod',
    'test',
    'dev',
    'local',
  ];

  const hasStagingIndicator = stagingIndicators.some(
    indicator => url.includes(indicator),
  );

  if (hasProductionIndicator) {
    throw new Error(
      'BLOCKED: DATABASE_URL appears to be a production database. ' +
      'This script is designed for staging environment only. ' +
      'Use CI/CD pipeline for production deployment.',
    );
  }

  // Warn if no staging indicator found
  if (!hasStagingIndicator && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    console.warn(
      '⚠️  WARNING: DATABASE_URL does not contain staging/test indicators. ' +
      'Ensure you are targeting the correct environment.\n',
    );
  }
}

/**
 * Validates database connection and PostgreSQL version.
 */
async function validateDatabaseConnection(client: Client): Promise<void> {
  // Check connection
  const connectionCheck = await client.query('SELECT 1 AS connected');
  if (!connectionCheck.rows[0]?.connected) {
    throw new Error('Database connection validation failed');
  }

  // Check PostgreSQL version (RLS requires 9.5+)
  const versionResult = await client.query('SELECT version()');
  const versionString = versionResult.rows[0]?.version as string;
  console.log(`✅ Connected to: ${versionString.split(',')[0]}`);

  const versionMatch = versionString.match(/PostgreSQL (\d+)/);
  if (versionMatch && versionMatch[1]) {
    const majorVersion = parseInt(versionMatch[1], 10);
    if (majorVersion < 10) {
      console.warn(
        `⚠️  WARNING: PostgreSQL version ${majorVersion} detected. ` +
        'RLS is supported but version 12+ is recommended for production.',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Logging Utilities
// ---------------------------------------------------------------------------

function logProgress(verbose: boolean): (message: string) => void {
  return (message: string) => {
    const timestamp = new Date().toISOString();
    if (verbose) {
      console.log(`[${timestamp}] ${message}`);
    } else {
      console.log(`  → ${message}`);
    }
  };
}

function logMigrationStart(config: MigrationConfig, correlationId: string): void {
  const mode = config.dryRun ? 'DRY RUN' : config.rollback ? 'ROLLBACK' : config.verify ? 'VERIFY' : 'ENABLE';

  console.log('\n' + '='.repeat(60));
  console.log(`RLS STAGING MIGRATION — ${mode}`);
  console.log('='.repeat(60));
  console.log(`Correlation ID: ${correlationId}`);
  console.log(`Environment:    ${config.environment}`);
  console.log(`Timestamp:      ${new Date().toISOString()}`);
  console.log(`Mode:           ${mode}`);
  console.log('='.repeat(60) + '\n');
}

function logMigrationResult(result: MigrationExecutionResult): void {
  console.log('\n' + '-'.repeat(60));
  console.log('MIGRATION RESULT');
  console.log('-'.repeat(60));

  if (result.success) {
    console.log('✅ STATUS: SUCCESS');
  } else {
    console.log('❌ STATUS: FAILED');
  }

  console.log(`Duration: ${result.durationMs}ms`);

  if (result.migrationResult) {
    const mr = result.migrationResult;
    console.log(`Migration Status: ${mr.status}`);
    console.log(`Affected Tables: ${mr.affectedTables.length}`);
    console.log(`Policy Count: ${mr.policyCount}`);
    console.log(`Message: ${mr.message}`);

    if (mr.error) {
      console.log(`\n⚠️  Error Details:`);
      console.log(`   Code: ${mr.error.code}`);
      console.log(`   Message: ${mr.error.message}`);
      if (mr.error.details) {
        console.log(`   Details: ${JSON.stringify(mr.error.details, null, 2)}`);
      }
    }
  }

  if (result.verificationResult) {
    const vr = result.verificationResult;
    console.log(`\nVerification:`);
    console.log(`  Valid: ${vr.isValid ? '✅ YES' : '❌ NO'}`);
    console.log(`  Enabled Tables: ${vr.enabledTables.length}`);
    console.log(`  Missing RLS Tables: ${vr.missingRlsTables.length}`);
    console.log(`  Unexpected RLS Tables: ${vr.unexpectedRlsTables.length}`);

    if (vr.missingRlsTables.length > 0) {
      console.log(`\n⚠️  Missing RLS on tables:`);
      vr.missingRlsTables.forEach(t => console.log(`     - ${t}`));
    }

    if (vr.unexpectedRlsTables.length > 0) {
      console.log(`\n⚠️  Unexpected RLS on tables:`);
      vr.unexpectedRlsTables.forEach(t => console.log(`     - ${t}`));
    }
  }

  if (result.error) {
    console.log(`\n❌ Execution Error:`);
    console.log(`   Code: ${result.error.code}`);
    console.log(`   Message: ${result.error.message}`);
    if (result.error.details) {
      console.log(`   Details: ${JSON.stringify(result.error.details, null, 2)}`);
    }
  }

  console.log('-'.repeat(60) + '\n');
}

// ---------------------------------------------------------------------------
// Migration Execution
// ---------------------------------------------------------------------------

async function executeMigration(config: MigrationConfig): Promise<MigrationExecutionResult> {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  logMigrationStart(config, correlationId);

  // Validate environment
  validateStagingEnvironment(config);

  const client = new Client({ connectionString: config.databaseUrl });
  const migrationService = createRlsMigrationService();

  try {
    // Connect and validate
    await client.connect();
    console.log('🔌 Database connection established\n');
    await validateDatabaseConnection(client);
    console.log('');

    // Create SQL executor function
    const executeRawSql = async (sql: string): Promise<number> => {
      const result = await client.query(sql);
      return result.rowCount ?? 0;
    };

    // Create SQL query function
    const queryRawSql = async <T>(sql: string): Promise<T[]> => {
      const result = await client.query(sql);
      return result.rows as T[];
    };

    const options: RlsMigrationOptions = {
      dryRun: config.dryRun,
      onProgress: logProgress(config.verbose),
    };

    // Execute based on mode
    if (config.verify) {
      console.log('🔍 Verifying RLS state...\n');
      const verificationResult = await migrationService.verifyRlsState(queryRawSql);

      return {
        success: verificationResult.isValid,
        correlationId,
        environment: config.environment,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        verificationResult,
      };
    }

    let migrationResult: RlsMigrationResult;

    if (config.rollback) {
      console.log('🔄 Executing RLS ROLLBACK (disable)...\n');
      migrationResult = await migrationService.disableRls(executeRawSql, options);
    } else {
      console.log('🚀 Executing RLS ENABLE migration...\n');
      migrationResult = await migrationService.enableRls(executeRawSql, options);
    }

    // Verify after migration (unless dry run)
    let verificationResult: RlsVerificationResult | undefined;
    if (!config.dryRun) {
      console.log('\n🔍 Verifying migration result...\n');
      verificationResult = await migrationService.verifyRlsState(queryRawSql);
    }

    const success =
      migrationResult.status === 'success';

    return {
      success,
      correlationId,
      environment: config.environment,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
      migrationResult,
      verificationResult,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      correlationId,
      environment: config.environment,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
      error: {
        code: 'RLS_EXECUTION_ERROR',
        message: errorMessage,
        details: error instanceof Error ? { stack: error.stack } : undefined,
      },
    };
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

function parseArgs(): MigrationConfig {
  const args = process.argv.slice(2);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const environment = process.env.NODE_ENV || 'staging';

  return {
    databaseUrl,
    environment,
    dryRun: args.includes('--dry-run'),
    rollback: args.includes('--rollback'),
    verify: args.includes('--verify'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

function printUsage(): void {
  console.log(`
RLS Staging Migration Script

Usage:
  npx tsx scripts/rls/execute-staging-migration.ts [options]

Options:
  --dry-run     Generate SQL without executing (safe preview)
  --rollback    Disable RLS policies (rollback migration)
  --verify      Verify current RLS state without modification
  --verbose, -v Enable verbose logging

Environment:
  DATABASE_URL  PostgreSQL connection string (required)
  NODE_ENV      Environment name (default: staging)

Examples:
  # Preview what will be executed
  npx tsx scripts/rls/execute-staging-migration.ts --dry-run

  # Execute RLS enable migration
  npx tsx scripts/rls/execute-staging-migration.ts

  # Check current RLS state
  npx tsx scripts/rls/execute-staging-migration.ts --verify

  # Rollback RLS migration
  npx tsx scripts/rls/execute-staging-migration.ts --rollback

Critical Notes:
  - This script is for STAGING environment only
  - Production deployments should use CI/CD pipeline
  - Always run --dry-run first to preview changes
  - Always run --verify after migration to confirm state
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  try {
    const config = parseArgs();
    const result = await executeMigration(config);

    logMigrationResult(result);

    // Output JSON summary for CI/CD integration
    console.log('\n📋 JSON Summary (for CI/CD):');
    console.log(JSON.stringify({
      success: result.success,
      correlationId: result.correlationId,
      environment: result.environment,
      durationMs: result.durationMs,
      status: result.migrationResult?.status ?? result.verificationResult?.isValid ? 'valid' : 'invalid',
    }, null, 2));

    // Handle rollback failure - CRITICAL
    if (result.migrationResult?.status === 'rollback_failed') {
      console.error('\n' + '!'.repeat(60));
      console.error('CRITICAL: ROLLBACK FAILED');
      console.error('!'.repeat(60));
      console.error('');
      console.error('The RLS migration failed and automatic rollback also failed.');
      console.error('The database may be in an INCONSISTENT state.');
      console.error('');
      console.error('REQUIRED ACTIONS:');
      console.error('1. HALT all deployments immediately');
      console.error('2. Alert database administrators');
      console.error('3. Manual intervention required to restore database state');
      console.error('4. Do NOT retry migration until database is verified');
      console.error('');
      console.error('See docs/runbooks/rls-staging-migration.md for recovery procedures');
      console.error('!'.repeat(60) + '\n');

      // Create alert for observability
      const migrationService = createRlsMigrationService();
      const alert = migrationService.createAlert('rollback_failed', {
        correlationId: result.correlationId,
        error: result.migrationResult.error,
      });
      console.error('Alert payload:', JSON.stringify(alert, null, 2));

      process.exit(2);
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

main();
