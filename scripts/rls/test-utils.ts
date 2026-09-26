/**
 * RLS Test Utilities
 *
 * Shared utilities for RLS security testing.
 * These utilities can be used by both the cross-tenant security tests
 * and other RLS-related test scripts.
 *
 * @see FASE 2.7 Task 16.2: Execute cross-tenant security tests on staging
 * @see Requirement 11: Cross-Tenant Access Prevention Testing
 */

import pg from 'pg';
import { RLS_SESSION_VARIABLE } from '../../src/infrastructure/rls/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Test tenant context
 */
export interface TestTenantContext {
  tenantId: string;
  orgUnitId?: string;
  name: string;
}

/**
 * RLS test execution result
 */
export interface RlsTestExecutionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  blocked: boolean;
  executionTimeMs: number;
}

/**
 * Test data record reference
 */
export interface TestDataRecord {
  tableName: string;
  recordId: string;
  tenantId: string;
}

// ---------------------------------------------------------------------------
// UUID Generation
// ---------------------------------------------------------------------------

/**
 * Generate a valid UUID v4
 */
export function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validate UUID format
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// ---------------------------------------------------------------------------
// RLS Context Management
// ---------------------------------------------------------------------------

/**
 * Set tenant context for RLS within a transaction
 */
export async function setTenantContext(
  client: pg.PoolClient,
  tenantId: string,
): Promise<void> {
  if (!isValidUuid(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId}`);
  }
  await client.query(`SET LOCAL "${RLS_SESSION_VARIABLE}" = '${tenantId}'`);
}

/**
 * Clear tenant context (reset to default)
 */
export async function clearTenantContext(client: pg.PoolClient): Promise<void> {
  await client.query(`RESET "${RLS_SESSION_VARIABLE}"`);
}

/**
 * Get current tenant context value
 */
export async function getCurrentTenantContext(
  client: pg.PoolClient,
): Promise<string | null> {
  const result = await client.query<{ current_tenant_id: string }>(
    `SELECT current_setting('${RLS_SESSION_VARIABLE}', true) AS current_tenant_id`,
  );
  const value = result.rows[0]?.current_tenant_id;
  return value && value !== '' ? value : null;
}

/**
 * Execute operation with specific tenant context
 *
 * Wraps the operation in a transaction with SET LOCAL to ensure
 * the tenant context is properly scoped and cleaned up.
 */
export async function executeWithTenantContext<T>(
  pool: pg.Pool,
  tenantId: string,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<RlsTestExecutionResult<T>> {
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);

    const data = await operation(client);

    await client.query('COMMIT');

    return {
      success: true,
      data,
      blocked: false,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {
      // Ignore rollback errors
    });

    const isRlsBlocked =
      error instanceof Error &&
      (error.message.includes('violates row-level security policy') ||
        error.message.includes('new row violates check constraint') ||
        error.message.includes('permission denied'));

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      blocked: isRlsBlocked,
      executionTimeMs: Date.now() - startTime,
    };
  } finally {
    await clearTenantContext(client).catch(() => {
      // Ignore errors
    });
    client.release();
  }
}

/**
 * Execute operation WITHOUT tenant context (for setup/cleanup)
 *
 * This bypasses RLS by not setting the tenant context.
 * Should only be used for test setup/cleanup, not for actual tests.
 */
export async function executeWithoutTenantContext<T>(
  pool: pg.Pool,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Test Tenant Setup
// ---------------------------------------------------------------------------

/**
 * Create a test tenant with associated org unit
 */
export async function createTestTenantWithOrgUnit(
  pool: pg.Pool,
  name: string,
): Promise<TestTenantContext> {
  const tenantId = generateUuid();
  const orgUnitId = generateUuid();

  await executeWithoutTenantContext(pool, async (client) => {
    // Get or create subscription plan
    const planResult = await client.query(
      `SELECT id FROM subscription_plans LIMIT 1`,
    );

    let subscriptionPlanId: string;
    if (planResult.rows.length === 0) {
      subscriptionPlanId = generateUuid();
      await client.query(
        `INSERT INTO subscription_plans (id, name, price, features, created_at, updated_at)
         VALUES ($1, 'Test Plan', 0, '{}', NOW(), NOW())`,
        [subscriptionPlanId],
      );
    } else {
      subscriptionPlanId = planResult.rows[0].id;
    }

    // Create tenant
    await client.query(
      `INSERT INTO tenants (id, name, subdomain, rt_rw_number, region, address, contact_person, subscription_plan_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Test Region', 'Test Address', 'Test Contact', $5, 'active', NOW(), NOW())`,
      [tenantId, name, `test-${tenantId.slice(0, 8)}`, `RT-${tenantId.slice(0, 4)}`, subscriptionPlanId],
    );

    // Create org unit
    await client.query(
      `INSERT INTO org_units (id, tenant_id, name, type, created_at, updated_at)
       VALUES ($1, $2, $3, 'RT', NOW(), NOW())`,
      [orgUnitId, tenantId, `OrgUnit for ${name}`],
    );
  });

  return {
    tenantId,
    orgUnitId,
    name,
  };
}

/**
 * Delete a test tenant and all associated data
 */
export async function deleteTestTenant(
  pool: pg.Pool,
  tenantId: string,
): Promise<void> {
  await executeWithoutTenantContext(pool, async (client) => {
    // Delete in reverse dependency order
    const tables = [
      'automation_executions',
      'automation_rules',
      'alarm_events',
      'alarm_devices',
      'patrol_sessions',
      'patrol_routes',
      'cctv_snapshots',
      'cctv_cameras',
      'gate_events',
      'gates',
      'incidents',
      'push_subscriptions',
      'audit_logs',
      'notifications',
      'feature_flag_overrides',
      'invoices',
      'package_logs',
      'visitor_logs',
      'community_events',
      'letter_requests',
      'incident_reports',
      'patrol_schedules',
      'device_events',
      'iuran_statuses',
      'iot_devices',
      'emergency_alerts',
      'votes',
      'announcements',
      'financial_transactions',
      'residents',
      'households',
      'memberships',
      'users',
      'org_units',
      'emergency_contacts',
      'invitation_tokens',
      'homes',
      'door_sensor_configs',
      'door_installation_requests',
      'tenants',
    ];

    for (const table of tables) {
      const tenantIdColumn = table === 'tenants' ? 'id' : 'tenant_id';
      try {
        await client.query(
          `DELETE FROM "${table}" WHERE ${tenantIdColumn} = $1`,
          [tenantId],
        );
      } catch {
        // Ignore errors for tables that might not exist or have no data
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Verification Helpers
// ---------------------------------------------------------------------------

/**
 * Verify that a query returns zero rows (RLS blocking READ)
 */
export async function verifyZeroRowsReturned(
  pool: pg.Pool,
  asTenantId: string,
  query: string,
  params: unknown[],
): Promise<{ passed: boolean; rowCount: number; rows: unknown[] }> {
  const result = await executeWithTenantContext(pool, asTenantId, async (client) => {
    return client.query(query, params);
  });

  if (result.success && result.data) {
    return {
      passed: result.data.rowCount === 0,
      rowCount: result.data.rowCount ?? 0,
      rows: result.data.rows,
    };
  }

  // If blocked by RLS, that's also a pass (zero rows)
  if (result.blocked) {
    return {
      passed: true,
      rowCount: 0,
      rows: [],
    };
  }

  // Unexpected error
  throw result.error || new Error('Unknown error during verification');
}

/**
 * Verify that a write operation is blocked (RLS blocking INSERT/UPDATE/DELETE)
 */
export async function verifyWriteBlocked(
  pool: pg.Pool,
  asTenantId: string,
  query: string,
  params: unknown[],
): Promise<{ passed: boolean; rowsAffected: number; errorMessage?: string }> {
  const result = await executeWithTenantContext(pool, asTenantId, async (client) => {
    return client.query(query, params);
  });

  if (result.blocked) {
    return {
      passed: true,
      rowsAffected: 0,
      errorMessage: result.error?.message,
    };
  }

  if (result.success && result.data) {
    // Write succeeded - check if zero rows affected (also acceptable for RLS)
    const rowsAffected = result.data.rowCount ?? 0;
    return {
      passed: rowsAffected === 0,
      rowsAffected,
    };
  }

  // Unexpected error that's not RLS-related
  return {
    passed: false,
    rowsAffected: 0,
    errorMessage: result.error?.message,
  };
}

// ---------------------------------------------------------------------------
// RLS Status Verification
// ---------------------------------------------------------------------------

/**
 * Check if RLS is enabled on a specific table
 */
export async function isRlsEnabledOnTable(
  pool: pg.Pool,
  tableName: string,
): Promise<boolean> {
  const result = await executeWithoutTenantContext(pool, async (client) => {
    const res = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity 
       FROM pg_class 
       WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [tableName],
    );
    return res.rows[0];
  });

  return result?.relrowsecurity === true && result?.relforcerowsecurity === true;
}

/**
 * Get list of RLS policies for a table
 */
export async function getRlsPoliciesForTable(
  pool: pg.Pool,
  tableName: string,
): Promise<string[]> {
  const result = await executeWithoutTenantContext(pool, async (client) => {
    const res = await client.query<{ policyname: string }>(
      `SELECT policyname 
       FROM pg_policies 
       WHERE tablename = $1 AND schemaname = 'public'`,
      [tableName],
    );
    return res.rows.map((r) => r.policyname);
  });

  return result;
}

/**
 * Verify RLS is properly configured for cross-tenant isolation
 */
export async function verifyRlsConfiguration(
  pool: pg.Pool,
  tableName: string,
): Promise<{
  rlsEnabled: boolean;
  forceRlsEnabled: boolean;
  policies: string[];
  hasTenantPolicy: boolean;
}> {
  const [rlsStatus, policies] = await Promise.all([
    executeWithoutTenantContext(pool, async (client) => {
      const res = await client.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relrowsecurity, relforcerowsecurity 
         FROM pg_class 
         WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
        [tableName],
      );
      return res.rows[0];
    }),
    getRlsPoliciesForTable(pool, tableName),
  ]);

  const hasTenantPolicy = policies.some(
    (p) =>
      p.includes('tenant_select') ||
      p.includes('tenant_insert') ||
      p.includes('tenant_update') ||
      p.includes('tenant_delete'),
  );

  return {
    rlsEnabled: rlsStatus?.relrowsecurity ?? false,
    forceRlsEnabled: rlsStatus?.relforcerowsecurity ?? false,
    policies,
    hasTenantPolicy,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  RLS_SESSION_VARIABLE,
};
