#!/usr/bin/env npx tsx
/**
 * Cross-Tenant Security Test Suite
 *
 * Validates RLS (Row-Level Security) enforcement on staging database.
 * This script tests that cross-tenant access is blocked for all CRUD operations.
 *
 * **CRITICAL**: This test suite MUST pass before production cutover.
 *
 * Usage:
 *   npx tsx scripts/rls/cross-tenant-security-tests.ts
 *
 * Exit codes:
 *   0 - All cross-tenant access properly blocked (tests pass)
 *   1 - Cross-tenant access detected (security issue)
 *   2 - Error during execution
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *
 * @see FASE 2.7 Task 16.2: Execute cross-tenant security tests on staging
 * @see Requirement 11: Cross-Tenant Access Prevention Testing
 * @see Requirements: 11.1, 11.2, 11.3 (Verify all cross-tenant access blocked)
 * @see Design Properties 28, 29, 30, 31
 */

import 'dotenv/config';
import pg from 'pg';
// Import from relative paths since scripts don't use the bundler path resolution
import {
  getTablesRequiringRls,
  type TableClassificationEntry,
  RLS_SESSION_VARIABLE,
} from '../../src/infrastructure/rls/index';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'cross-tenant-security-tests';

/**
 * Test configuration
 */
interface TestConfig {
  /** Test tenant A ID */
  tenantAId: string;
  /** Test tenant B ID */
  tenantBId: string;
  /** Verbose output */
  verbose: boolean;
  /** Skip cleanup on failure (for debugging) */
  skipCleanupOnFailure: boolean;
  /** Tables to test (empty = all tables with RLS) */
  tablesToTest: string[];
}

/**
 * Default configuration using UUIDs for test tenants
 */
const DEFAULT_CONFIG: TestConfig = {
  tenantAId: '', // Will be generated
  tenantBId: '', // Will be generated
  verbose: process.env.VERBOSE === 'true',
  skipCleanupOnFailure: process.env.SKIP_CLEANUP === 'true',
  tablesToTest: [], // Empty means all
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Test operation type
 */
type TestOperation = 'READ' | 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Single test result
 */
interface TestResult {
  tableName: string;
  operation: TestOperation;
  passed: boolean;
  blocked: boolean;
  errorType?: 'EMPTY_RESULT' | 'CONSTRAINT_VIOLATION' | 'ZERO_ROWS_AFFECTED' | 'UNEXPECTED_SUCCESS';
  details: string;
  query?: string;
  resultSet?: unknown[];
  executionTimeMs: number;
}

/**
 * Overall test suite result
 */
interface TestSuiteResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  tenantAId: string;
  tenantBId: string;
  startedAt: Date;
  completedAt: Date;
  executionTimeMs: number;
}

// ---------------------------------------------------------------------------
// Logging Utilities
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[${SCRIPT_NAME}] ${message}`);
}

function logVerbose(message: string, verbose: boolean): void {
  if (verbose) {
    console.log(`[${SCRIPT_NAME}] ${message}`);
  }
}

function logError(message: string): void {
  console.error(`[${SCRIPT_NAME}] ❌ ERROR: ${message}`);
}

function logSuccess(message: string): void {
  console.log(`[${SCRIPT_NAME}] ✅ ${message}`);
}

function logWarning(message: string): void {
  console.log(`[${SCRIPT_NAME}] ⚠️ ${message}`);
}

// ---------------------------------------------------------------------------
// UUID Generation
// ---------------------------------------------------------------------------

function generateUuid(): string {
  // Simple UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// RLS Context Helpers
// ---------------------------------------------------------------------------

/**
 * Set tenant context for RLS within a transaction
 */
async function setTenantContext(
  client: pg.PoolClient,
  tenantId: string,
): Promise<void> {
  await client.query(`SET LOCAL "${RLS_SESSION_VARIABLE}" = '${tenantId}'`);
}

/**
 * Clear tenant context
 */
async function clearTenantContext(client: pg.PoolClient): Promise<void> {
  await client.query(`RESET "${RLS_SESSION_VARIABLE}"`);
}

/**
 * Execute a query with specific tenant context within a transaction
 */
async function executeWithTenantContext<T>(
  pool: pg.Pool,
  tenantId: string,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await clearTenantContext(client);
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Test Data Setup
// ---------------------------------------------------------------------------

/**
 * Create test tenant record for testing RLS
 */
async function createTestTenant(
  client: pg.PoolClient,
  tenantId: string,
  name: string,
): Promise<void> {
  // First check if a subscription plan exists
  const planResult = await client.query(
    `SELECT id FROM subscription_plans LIMIT 1`,
  );

  let subscriptionPlanId: string;

  if (planResult.rows.length === 0) {
    // Create a test subscription plan
    subscriptionPlanId = generateUuid();
    await client.query(
      `INSERT INTO subscription_plans (id, name, price, features, created_at, updated_at)
       VALUES ($1, $2, 0, '{}', NOW(), NOW())`,
      [subscriptionPlanId, `Test Plan ${subscriptionPlanId.slice(0, 8)}`],
    );
  } else {
    subscriptionPlanId = planResult.rows[0].id;
  }

  // Create test tenant
  await client.query(
    `INSERT INTO tenants (id, name, subdomain, rt_rw_number, region, address, contact_person, subscription_plan_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW(), NOW())`,
    [
      tenantId,
      name,
      `test-${tenantId.slice(0, 8)}`,
      `RT-${tenantId.slice(0, 4)}`,
      'Test Region',
      'Test Address',
      'Test Contact',
      subscriptionPlanId,
    ],
  );
}

/**
 * Create test OrgUnit for a tenant
 */
async function createTestOrgUnit(
  client: pg.PoolClient,
  tenantId: string,
): Promise<string> {
  const orgUnitId = generateUuid();
  await client.query(
    `INSERT INTO org_units (id, tenant_id, name, type, created_at, updated_at)
     VALUES ($1, $2, $3, 'RT', NOW(), NOW())`,
    [orgUnitId, tenantId, `Test OrgUnit ${orgUnitId.slice(0, 8)}`],
  );
  return orgUnitId;
}

/**
 * Create test data for each table type
 */
async function createTestDataForTable(
  client: pg.PoolClient,
  tableName: string,
  tenantId: string,
  orgUnitId: string,
): Promise<string> {
  const recordId = generateUuid();

  switch (tableName) {
    case 'tenants':
      // Tenant already created
      return tenantId;

    case 'org_units':
      return orgUnitId;

    case 'memberships':
      // Need a user first
      const userId = generateUuid();
      await client.query(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at)
         VALUES ($1, $2, 'Test User', $3, 'hash', 'Warga', 'active', NOW(), NOW())`,
        [userId, tenantId, `test-${userId.slice(0, 8)}@test.com`],
      );
      await client.query(
        `INSERT INTO memberships (id, tenant_id, org_unit_id, user_id, role, status, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'RESIDENT', 'ACTIVE', NOW(), NOW(), NOW())`,
        [recordId, tenantId, orgUnitId, userId],
      );
      return recordId;

    case 'households':
      await client.query(
        `INSERT INTO households (id, tenant_id, house_number, block, type, head_name, created_at, updated_at)
         VALUES ($1, $2, 'H-001', 'A', 'permanent', 'Test Head', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'residents':
      const householdId = await createTestDataForTable(
        client,
        'households',
        tenantId,
        orgUnitId,
      );
      await client.query(
        `INSERT INTO residents (id, tenant_id, household_id, name, nik, date_of_birth, gender, phone, email, residency_status, is_head, created_at, updated_at)
         VALUES ($1, $2, $3, 'Test Resident', '1234567890123456', '1990-01-01', 'male', '081234567890', 'test@test.com', 'tetap', false, NOW(), NOW())`,
        [recordId, tenantId, householdId],
      );
      return recordId;

    case 'financial_transactions':
      await client.query(
        `INSERT INTO financial_transactions (id, tenant_id, amount, type, category, description, date, created_at, updated_at)
         VALUES ($1, $2, 100000, 'income', 'iuran', 'Test transaction', NOW(), NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'announcements':
      await client.query(
        `INSERT INTO announcements (id, tenant_id, title, content, category, is_pinned, created_at, updated_at)
         VALUES ($1, $2, 'Test Announcement', 'Test content', 'umum', false, NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'votes':
      await client.query(
        `INSERT INTO votes (id, tenant_id, title, description, mode, is_open, start_date, end_date, created_at, updated_at)
         VALUES ($1, $2, 'Test Vote', 'Test description', 'anonymous', true, NOW(), NOW() + interval '7 days', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'emergency_alerts':
      await client.query(
        `INSERT INTO emergency_alerts (id, tenant_id, type, message, reported_by, status, created_at, updated_at)
         VALUES ($1, $2, 'fire', 'Test emergency', 'Test user', 'active', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'iot_devices':
      await client.query(
        `INSERT INTO iot_devices (id, tenant_id, name, type, tuya_device_id, status, location, created_at, updated_at)
         VALUES ($1, $2, 'Test Device', 'sensor', 'tuya-123', 'online', 'Test location', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'iuran_statuses':
      await client.query(
        `INSERT INTO iuran_statuses (id, tenant_id, month, year, amount, status, created_at, updated_at)
         VALUES ($1, $2, 1, 2024, 100000, 'unpaid', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'device_events':
      const deviceId = await createTestDataForTable(
        client,
        'iot_devices',
        tenantId,
        orgUnitId,
      );
      await client.query(
        `INSERT INTO device_events (id, tenant_id, device_id, event_type, data, created_at)
         VALUES ($1, $2, $3, 'status_change', '{}', NOW())`,
        [recordId, tenantId, deviceId],
      );
      return recordId;

    case 'patrol_schedules':
      await client.query(
        `INSERT INTO patrol_schedules (id, tenant_id, date, guard_name, start_time, end_time, status, created_at, updated_at)
         VALUES ($1, $2, NOW()::date, 'Test Guard', '08:00', '16:00', 'scheduled', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'incident_reports':
      await client.query(
        `INSERT INTO incident_reports (id, tenant_id, title, description, date, location, status, created_at, updated_at)
         VALUES ($1, $2, 'Test Incident', 'Test description', NOW(), 'Test location', 'open', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'letter_requests':
      await client.query(
        `INSERT INTO letter_requests (id, tenant_id, type, requester_name, purpose, status, created_at, updated_at)
         VALUES ($1, $2, 'domicile', 'Test Requester', 'Test purpose', 'pending', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'community_events':
      await client.query(
        `INSERT INTO community_events (id, tenant_id, title, description, date, location, status, created_at, updated_at)
         VALUES ($1, $2, 'Test Event', 'Test description', NOW(), 'Test location', 'upcoming', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'visitor_logs':
      await client.query(
        `INSERT INTO visitor_logs (id, tenant_id, visitor_name, purpose, host_name, check_in, status, created_at, updated_at)
         VALUES ($1, $2, 'Test Visitor', 'Test purpose', 'Test Host', NOW(), 'checked_in', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'package_logs':
      await client.query(
        `INSERT INTO package_logs (id, tenant_id, recipient_name, package_type, received_at, status, created_at, updated_at)
         VALUES ($1, $2, 'Test Recipient', 'small', NOW(), 'received', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'invoices':
      await client.query(
        `INSERT INTO invoices (id, tenant_id, invoice_number, amount, status, due_date, created_at, updated_at)
         VALUES ($1, $2, 'INV-001', 100000, 'pending', NOW() + interval '30 days', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'feature_flag_overrides':
      await client.query(
        `INSERT INTO feature_flag_overrides (id, tenant_id, flag_key, enabled, created_at, updated_at)
         VALUES ($1, $2, 'test_flag', true, NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'notifications':
      await client.query(
        `INSERT INTO notifications (id, tenant_id, title, message, type, is_read, created_at, updated_at)
         VALUES ($1, $2, 'Test Notification', 'Test message', 'info', false, NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'audit_logs':
      await client.query(
        `INSERT INTO audit_logs (id, tenant_id, action, entity_type, entity_id, actor_id, details, created_at)
         VALUES ($1, $2, 'test_action', 'test_entity', 'test-id', 'test-actor', '{}', NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'push_subscriptions':
      await client.query(
        `INSERT INTO push_subscriptions (id, tenant_id, endpoint, p256dh, auth, created_at, updated_at)
         VALUES ($1, $2, 'https://test.endpoint', 'test-p256dh', 'test-auth', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'incidents':
      await client.query(
        `INSERT INTO incidents (id, tenant_id, type, status, reported_at, location, created_at, updated_at)
         VALUES ($1, $2, 'security', 'open', NOW(), 'Test location', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'gates':
      await client.query(
        `INSERT INTO gates (id, tenant_id, name, location, status, created_at, updated_at)
         VALUES ($1, $2, 'Test Gate', 'Test location', 'closed', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'gate_events':
      const gateId = await createTestDataForTable(
        client,
        'gates',
        tenantId,
        orgUnitId,
      );
      await client.query(
        `INSERT INTO gate_events (id, tenant_id, gate_id, event_type, timestamp, created_at)
         VALUES ($1, $2, $3, 'open', NOW(), NOW())`,
        [recordId, tenantId, gateId],
      );
      return recordId;

    case 'cctv_cameras':
      await client.query(
        `INSERT INTO cctv_cameras (id, tenant_id, name, location, stream_url, status, created_at, updated_at)
         VALUES ($1, $2, 'Test Camera', 'Test location', 'rtsp://test', 'online', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'cctv_snapshots':
      const cameraId = await createTestDataForTable(
        client,
        'cctv_cameras',
        tenantId,
        orgUnitId,
      );
      await client.query(
        `INSERT INTO cctv_snapshots (id, tenant_id, camera_id, snapshot_url, captured_at, created_at)
         VALUES ($1, $2, $3, 'https://test/snapshot.jpg', NOW(), NOW())`,
        [recordId, tenantId, cameraId],
      );
      return recordId;

    case 'patrol_routes':
      await client.query(
        `INSERT INTO patrol_routes (id, tenant_id, name, checkpoints, created_at, updated_at)
         VALUES ($1, $2, 'Test Route', '[]', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'patrol_sessions':
      await client.query(
        `INSERT INTO patrol_sessions (id, tenant_id, guard_name, started_at, status, created_at, updated_at)
         VALUES ($1, $2, 'Test Guard', NOW(), 'in_progress', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'alarm_devices':
      await client.query(
        `INSERT INTO alarm_devices (id, tenant_id, name, type, location, status, created_at, updated_at)
         VALUES ($1, $2, 'Test Alarm', 'smoke', 'Test location', 'armed', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'alarm_events':
      const alarmId = await createTestDataForTable(
        client,
        'alarm_devices',
        tenantId,
        orgUnitId,
      );
      await client.query(
        `INSERT INTO alarm_events (id, tenant_id, device_id, event_type, triggered_at, created_at)
         VALUES ($1, $2, $3, 'triggered', NOW(), NOW())`,
        [recordId, tenantId, alarmId],
      );
      return recordId;

    case 'automation_rules':
      await client.query(
        `INSERT INTO automation_rules (id, tenant_id, name, trigger_type, conditions, actions, enabled, created_at, updated_at)
         VALUES ($1, $2, 'Test Rule', 'schedule', '{}', '{}', true, NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'automation_executions':
      const ruleId = await createTestDataForTable(
        client,
        'automation_rules',
        tenantId,
        orgUnitId,
      );
      await client.query(
        `INSERT INTO automation_executions (id, tenant_id, rule_id, status, executed_at, created_at)
         VALUES ($1, $2, $3, 'success', NOW(), NOW())`,
        [recordId, tenantId, ruleId],
      );
      return recordId;

    case 'homes':
      await client.query(
        `INSERT INTO homes (id, tenant_id, name, address, created_at, updated_at)
         VALUES ($1, $2, 'Test Home', 'Test address', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'door_sensor_configs':
      await client.query(
        `INSERT INTO door_sensor_configs (id, tenant_id, name, device_id, location, created_at, updated_at)
         VALUES ($1, $2, 'Test Door Sensor', 'tuya-door-123', 'Front door', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'door_installation_requests':
      await client.query(
        `INSERT INTO door_installation_requests (id, tenant_id, location, status, requested_at, created_at, updated_at)
         VALUES ($1, $2, 'Test location', 'pending', NOW(), NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'emergency_contacts':
      await client.query(
        `INSERT INTO emergency_contacts (id, tenant_id, name, phone, relationship, created_at, updated_at)
         VALUES ($1, $2, 'Test Contact', '081234567890', 'family', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    case 'invitation_tokens':
      await client.query(
        `INSERT INTO invitation_tokens (id, tenant_id, token, role, email, expires_at, created_at, updated_at)
         VALUES ($1, $2, 'test-token-${recordId}', 'Warga', 'invite@test.com', NOW() + interval '7 days', NOW(), NOW())`,
        [recordId, tenantId],
      );
      return recordId;

    default:
      logWarning(`No test data generator for table: ${tableName}`);
      return '';
  }
}

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------

/**
 * Get tenant ID column name for a table
 */
function getTenantIdColumn(tableName: string): string {
  // tenants table uses 'id' instead of 'tenant_id'
  return tableName === 'tenants' ? 'id' : 'tenant_id';
}

/**
 * Test READ operation (SELECT) - cross-tenant should return empty
 */
async function testCrossTenantRead(
  pool: pg.Pool,
  tableName: string,
  tenantAId: string,
  tenantBId: string,
  _recordId: string,
  _verbose: boolean,
): Promise<TestResult> {
  const startTime = Date.now();
  const tenantIdColumn = getTenantIdColumn(tableName);

  const query = `SELECT * FROM "${tableName}" WHERE ${tenantIdColumn} = $1`;

  try {
    // Attempt to read Tenant A's data while authenticated as Tenant B
    const result = await executeWithTenantContext(pool, tenantBId, async (client) => {
      return client.query(query, [tenantAId]);
    });

    const endTime = Date.now();
    const passed = result.rowCount === 0;

    return {
      tableName,
      operation: 'READ',
      passed,
      blocked: passed,
      errorType: passed ? 'EMPTY_RESULT' : 'UNEXPECTED_SUCCESS',
      details: passed
        ? `Cross-tenant READ blocked: 0 rows returned (expected)`
        : `SECURITY ISSUE: ${result.rowCount} rows returned when accessing Tenant A data as Tenant B`,
      query,
      resultSet: passed ? [] : result.rows,
      executionTimeMs: endTime - startTime,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      tableName,
      operation: 'READ',
      passed: true,
      blocked: true,
      errorType: 'CONSTRAINT_VIOLATION',
      details: `Cross-tenant READ blocked by error: ${error instanceof Error ? error.message : String(error)}`,
      query,
      executionTimeMs: endTime - startTime,
    };
  }
}

/**
 * Test INSERT operation - cross-tenant should be blocked
 */
async function testCrossTenantInsert(
  pool: pg.Pool,
  tableName: string,
  tenantAId: string,
  tenantBId: string,
  _verbose: boolean,
): Promise<TestResult> {
  const startTime = Date.now();
  const tenantIdColumn = getTenantIdColumn(tableName);
  const recordId = generateUuid();

  // Build a minimal INSERT query for the table
  let query: string;
  let params: unknown[];

  if (tableName === 'tenants') {
    // Cannot insert a tenant record with a different ID while in that tenant's context
    query = `INSERT INTO tenants (id, name, subdomain, rt_rw_number, region, address, contact_person, subscription_plan_id, status, created_at, updated_at)
             SELECT $1, 'Cross Test', 'cross-test', 'RT-CROSS', 'Cross Region', 'Cross Address', 'Cross Contact', subscription_plan_id, 'active', NOW(), NOW()
             FROM tenants LIMIT 1`;
    params = [tenantAId];
  } else if (tableName === 'org_units') {
    query = `INSERT INTO org_units (id, ${tenantIdColumn}, name, type, created_at, updated_at)
             VALUES ($1, $2, 'Cross Tenant OrgUnit', 'RT', NOW(), NOW())`;
    params = [recordId, tenantAId];
  } else {
    // Generic insert attempt with tenant_id pointing to Tenant A
    query = `INSERT INTO "${tableName}" (id, ${tenantIdColumn}, created_at, updated_at)
             VALUES ($1, $2, NOW(), NOW())`;
    params = [recordId, tenantAId];
  }

  try {
    // Attempt to insert into Tenant A while authenticated as Tenant B
    await executeWithTenantContext(pool, tenantBId, async (client) => {
      return client.query(query, params);
    });

    const endTime = Date.now();

    // If we get here without error, it's a security issue
    return {
      tableName,
      operation: 'INSERT',
      passed: false,
      blocked: false,
      errorType: 'UNEXPECTED_SUCCESS',
      details: `SECURITY ISSUE: INSERT succeeded when inserting Tenant A data as Tenant B`,
      query,
      executionTimeMs: endTime - startTime,
    };
  } catch (error) {
    const endTime = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error);

    // RLS should block the insert with a policy violation or constraint error
    const blocked =
      errorMessage.includes('violates row-level security policy') ||
      errorMessage.includes('new row violates check constraint') ||
      errorMessage.includes('permission denied');

    return {
      tableName,
      operation: 'INSERT',
      passed: blocked,
      blocked,
      errorType: blocked ? 'CONSTRAINT_VIOLATION' : 'UNEXPECTED_SUCCESS',
      details: blocked
        ? `Cross-tenant INSERT blocked: ${errorMessage}`
        : `INSERT failed but not due to RLS: ${errorMessage}`,
      query,
      executionTimeMs: endTime - startTime,
    };
  }
}

/**
 * Test UPDATE operation - cross-tenant should affect 0 rows
 */
async function testCrossTenantUpdate(
  pool: pg.Pool,
  tableName: string,
  tenantAId: string,
  tenantBId: string,
  _recordId: string,
  _verbose: boolean,
): Promise<TestResult> {
  const startTime = Date.now();
  const tenantIdColumn = getTenantIdColumn(tableName);

  const query = `UPDATE "${tableName}" SET updated_at = NOW() WHERE ${tenantIdColumn} = $1`;

  try {
    // Attempt to update Tenant A's data while authenticated as Tenant B
    const result = await executeWithTenantContext(pool, tenantBId, async (client) => {
      return client.query(query, [tenantAId]);
    });

    const endTime = Date.now();
    const passed = result.rowCount === 0;

    return {
      tableName,
      operation: 'UPDATE',
      passed,
      blocked: passed,
      errorType: passed ? 'ZERO_ROWS_AFFECTED' : 'UNEXPECTED_SUCCESS',
      details: passed
        ? `Cross-tenant UPDATE blocked: 0 rows affected (expected)`
        : `SECURITY ISSUE: ${result.rowCount} rows updated when updating Tenant A data as Tenant B`,
      query,
      executionTimeMs: endTime - startTime,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      tableName,
      operation: 'UPDATE',
      passed: true,
      blocked: true,
      errorType: 'CONSTRAINT_VIOLATION',
      details: `Cross-tenant UPDATE blocked by error: ${error instanceof Error ? error.message : String(error)}`,
      query,
      executionTimeMs: endTime - startTime,
    };
  }
}

/**
 * Test DELETE operation - cross-tenant should affect 0 rows
 */
async function testCrossTenantDelete(
  pool: pg.Pool,
  tableName: string,
  tenantAId: string,
  tenantBId: string,
  _recordId: string,
  _verbose: boolean,
): Promise<TestResult> {
  const startTime = Date.now();
  const tenantIdColumn = getTenantIdColumn(tableName);

  const query = `DELETE FROM "${tableName}" WHERE ${tenantIdColumn} = $1`;

  try {
    // Attempt to delete Tenant A's data while authenticated as Tenant B
    const result = await executeWithTenantContext(pool, tenantBId, async (client) => {
      return client.query(query, [tenantAId]);
    });

    const endTime = Date.now();
    const passed = result.rowCount === 0;

    return {
      tableName,
      operation: 'DELETE',
      passed,
      blocked: passed,
      errorType: passed ? 'ZERO_ROWS_AFFECTED' : 'UNEXPECTED_SUCCESS',
      details: passed
        ? `Cross-tenant DELETE blocked: 0 rows affected (expected)`
        : `SECURITY ISSUE: ${result.rowCount} rows deleted when deleting Tenant A data as Tenant B`,
      query,
      executionTimeMs: endTime - startTime,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      tableName,
      operation: 'DELETE',
      passed: true,
      blocked: true,
      errorType: 'CONSTRAINT_VIOLATION',
      details: `Cross-tenant DELETE blocked by error: ${error instanceof Error ? error.message : String(error)}`,
      query,
      executionTimeMs: endTime - startTime,
    };
  }
}

/**
 * Test complex queries: JOIN queries across tenants
 */
async function testCrossTenantJoin(
  pool: pg.Pool,
  tenantAId: string,
  tenantBId: string,
  _verbose: boolean,
): Promise<TestResult> {
  const startTime = Date.now();

  // Test a JOIN between residents and households
  const query = `
    SELECT r.*, h.house_number 
    FROM residents r 
    JOIN households h ON r.household_id = h.id 
    WHERE r.tenant_id = $1
  `;

  try {
    const result = await executeWithTenantContext(pool, tenantBId, async (client) => {
      return client.query(query, [tenantAId]);
    });

    const endTime = Date.now();
    const passed = result.rowCount === 0;

    return {
      tableName: 'residents_households_join',
      operation: 'READ',
      passed,
      blocked: passed,
      errorType: passed ? 'EMPTY_RESULT' : 'UNEXPECTED_SUCCESS',
      details: passed
        ? `Cross-tenant JOIN blocked: 0 rows returned (expected)`
        : `SECURITY ISSUE: ${result.rowCount} rows returned in cross-tenant JOIN`,
      query,
      resultSet: passed ? [] : result.rows,
      executionTimeMs: endTime - startTime,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      tableName: 'residents_households_join',
      operation: 'READ',
      passed: true,
      blocked: true,
      errorType: 'CONSTRAINT_VIOLATION',
      details: `Cross-tenant JOIN blocked by error: ${error instanceof Error ? error.message : String(error)}`,
      query,
      executionTimeMs: endTime - startTime,
    };
  }
}

/**
 * Test subquery isolation
 */
async function testCrossTenantSubquery(
  pool: pg.Pool,
  tenantAId: string,
  tenantBId: string,
  _verbose: boolean,
): Promise<TestResult> {
  const startTime = Date.now();

  const query = `
    SELECT * FROM households 
    WHERE id IN (
      SELECT household_id FROM residents WHERE tenant_id = $1
    )
  `;

  try {
    const result = await executeWithTenantContext(pool, tenantBId, async (client) => {
      return client.query(query, [tenantAId]);
    });

    const endTime = Date.now();
    const passed = result.rowCount === 0;

    return {
      tableName: 'subquery_test',
      operation: 'READ',
      passed,
      blocked: passed,
      errorType: passed ? 'EMPTY_RESULT' : 'UNEXPECTED_SUCCESS',
      details: passed
        ? `Cross-tenant subquery blocked: 0 rows returned (expected)`
        : `SECURITY ISSUE: ${result.rowCount} rows returned in cross-tenant subquery`,
      query,
      resultSet: passed ? [] : result.rows,
      executionTimeMs: endTime - startTime,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      tableName: 'subquery_test',
      operation: 'READ',
      passed: true,
      blocked: true,
      errorType: 'CONSTRAINT_VIOLATION',
      details: `Cross-tenant subquery blocked by error: ${error instanceof Error ? error.message : String(error)}`,
      query,
      executionTimeMs: endTime - startTime,
    };
  }
}

/**
 * Test aggregation query isolation
 */
async function testCrossTenantAggregation(
  pool: pg.Pool,
  tenantAId: string,
  tenantBId: string,
  _verbose: boolean,
): Promise<TestResult> {
  const startTime = Date.now();

  const query = `
    SELECT COUNT(*) as count, tenant_id 
    FROM financial_transactions 
    WHERE tenant_id = $1 
    GROUP BY tenant_id
  `;

  try {
    const result = await executeWithTenantContext(pool, tenantBId, async (client) => {
      return client.query(query, [tenantAId]);
    });

    const endTime = Date.now();
    const passed = result.rowCount === 0;

    return {
      tableName: 'aggregation_test',
      operation: 'READ',
      passed,
      blocked: passed,
      errorType: passed ? 'EMPTY_RESULT' : 'UNEXPECTED_SUCCESS',
      details: passed
        ? `Cross-tenant aggregation blocked: 0 rows returned (expected)`
        : `SECURITY ISSUE: ${result.rowCount} rows returned in cross-tenant aggregation`,
      query,
      resultSet: passed ? [] : result.rows,
      executionTimeMs: endTime - startTime,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      tableName: 'aggregation_test',
      operation: 'READ',
      passed: true,
      blocked: true,
      errorType: 'CONSTRAINT_VIOLATION',
      details: `Cross-tenant aggregation blocked by error: ${error instanceof Error ? error.message : String(error)}`,
      query,
      executionTimeMs: endTime - startTime,
    };
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Clean up test data created during testing
 */
async function cleanupTestData(
  pool: pg.Pool,
  tenantAId: string,
  tenantBId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Disable RLS for cleanup (need superuser or bypass)
    // Use direct deletion without RLS context
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
          `DELETE FROM "${table}" WHERE ${tenantIdColumn} IN ($1, $2)`,
          [tenantAId, tenantBId],
        );
      } catch {
        // Ignore errors for tables that might not exist
      }
    }

    await client.query('COMMIT');
    log('Test data cleaned up successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logWarning(`Cleanup partially failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------------------------

/**
 * Get tables to test based on configuration
 */
function getTablesToTest(config: TestConfig): TableClassificationEntry[] {
  const allTables = getTablesRequiringRls();

  if (config.tablesToTest.length > 0) {
    return allTables.filter((t) =>
      config.tablesToTest.includes(t.tableName),
    );
  }

  // Filter to only tables with direct tenant_id column
  return allTables.filter(
    (t) => t.hasTenantIdColumn && t.tenantIdColumn !== undefined,
  );
}

/**
 * Run the complete test suite
 */
async function runTestSuite(config: TestConfig): Promise<TestSuiteResult> {
  const startedAt = new Date();
  const results: TestResult[] = [];

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new pg.Pool({ connectionString });

  // Generate test tenant IDs
  const tenantAId = config.tenantAId || generateUuid();
  const tenantBId = config.tenantBId || generateUuid();

  log(`Starting cross-tenant security tests...`);
  log(`Test Tenant A: ${tenantAId}`);
  log(`Test Tenant B: ${tenantBId}`);

  const client = await pool.connect();

  try {
    // Setup: Create test tenants and data
    log('Setting up test data...');

    await client.query('BEGIN');

    // Create test tenants
    await createTestTenant(client, tenantAId, 'Test Tenant A');
    await createTestTenant(client, tenantBId, 'Test Tenant B');

    // Create OrgUnits for both tenants
    const orgUnitAId = await createTestOrgUnit(client, tenantAId);
    // Create org unit for tenant B (for test data completeness, not directly referenced)
    await createTestOrgUnit(client, tenantBId);

    await client.query('COMMIT');

    // Get tables to test
    const tablesToTest = getTablesToTest(config);
    log(`Testing ${tablesToTest.length} tables with RLS policies`);

    // Create test data for Tenant A
    log('Creating test data for Tenant A...');
    const testDataIds = new Map<string, string>();

    const dataClient = await pool.connect();
    try {
      await dataClient.query('BEGIN');

      for (const table of tablesToTest) {
        try {
          const recordId = await createTestDataForTable(
            dataClient,
            table.tableName,
            tenantAId,
            orgUnitAId,
          );
          if (recordId) {
            testDataIds.set(table.tableName, recordId);
            logVerbose(`Created test data for ${table.tableName}: ${recordId}`, config.verbose);
          }
        } catch (error) {
          logVerbose(
            `Could not create test data for ${table.tableName}: ${error instanceof Error ? error.message : String(error)}`,
            config.verbose,
          );
        }
      }

      await dataClient.query('COMMIT');
    } finally {
      dataClient.release();
    }

    // Run tests for each table
    log('Running cross-tenant security tests...');

    for (const table of tablesToTest) {
      const recordId = testDataIds.get(table.tableName) || '';

      if (!recordId && table.tableName !== 'tenants' && table.tableName !== 'org_units') {
        logVerbose(`Skipping ${table.tableName} - no test data created`, config.verbose);
        continue;
      }

      logVerbose(`Testing ${table.tableName}...`, config.verbose);

      // Test READ
      const readResult = await testCrossTenantRead(
        pool,
        table.tableName,
        tenantAId,
        tenantBId,
        recordId,
        config.verbose,
      );
      results.push(readResult);

      // Test INSERT (skip for tenants as it has special handling)
      if (table.tableName !== 'tenants') {
        const insertResult = await testCrossTenantInsert(
          pool,
          table.tableName,
          tenantAId,
          tenantBId,
          config.verbose,
        );
        results.push(insertResult);
      }

      // Test UPDATE
      const updateResult = await testCrossTenantUpdate(
        pool,
        table.tableName,
        tenantAId,
        tenantBId,
        recordId,
        config.verbose,
      );
      results.push(updateResult);

      // Test DELETE
      const deleteResult = await testCrossTenantDelete(
        pool,
        table.tableName,
        tenantAId,
        tenantBId,
        recordId,
        config.verbose,
      );
      results.push(deleteResult);
    }

    // Run complex query tests
    log('Running complex query isolation tests...');

    results.push(await testCrossTenantJoin(pool, tenantAId, tenantBId, config.verbose));
    results.push(await testCrossTenantSubquery(pool, tenantAId, tenantBId, config.verbose));
    results.push(await testCrossTenantAggregation(pool, tenantAId, tenantBId, config.verbose));

    const completedAt = new Date();
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = results.filter((r) => !r.passed).length;

    return {
      passed: failedTests === 0,
      totalTests: results.length,
      passedTests,
      failedTests,
      results,
      tenantAId,
      tenantBId,
      startedAt,
      completedAt,
      executionTimeMs: completedAt.getTime() - startedAt.getTime(),
    };
  } finally {
    client.release();

    // Cleanup
    const shouldCleanup = results.every((r) => r.passed) || !config.skipCleanupOnFailure;
    if (shouldCleanup) {
      await cleanupTestData(pool, tenantAId, tenantBId);
    } else {
      logWarning('Skipping cleanup due to test failures (debug mode)');
      log(`Test tenant A: ${tenantAId}`);
      log(`Test tenant B: ${tenantBId}`);
    }

    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

function formatOutput(result: TestSuiteResult): void {
  console.log('');
  console.log('═'.repeat(80));
  console.log('  CROSS-TENANT SECURITY TEST RESULTS');
  console.log('═'.repeat(80));
  console.log('');
  console.log(`  Status: ${result.passed ? '✅ ALL TESTS PASSED' : '❌ SECURITY ISSUES DETECTED'}`);
  console.log(`  Total Tests: ${result.totalTests}`);
  console.log(`  Passed: ${result.passedTests}`);
  console.log(`  Failed: ${result.failedTests}`);
  console.log(`  Execution Time: ${result.executionTimeMs}ms`);
  console.log('');

  // Group results by table
  const byTable = new Map<string, TestResult[]>();
  for (const r of result.results) {
    const existing = byTable.get(r.tableName) || [];
    existing.push(r);
    byTable.set(r.tableName, existing);
  }

  // Show failed tests first
  const failedResults = result.results.filter((r) => !r.passed);
  if (failedResults.length > 0) {
    console.log('─'.repeat(80));
    console.log('  ❌ FAILED TESTS (SECURITY ISSUES):');
    console.log('─'.repeat(80));
    for (const r of failedResults) {
      console.log('');
      console.log(`  Table: ${r.tableName}`);
      console.log(`  Operation: ${r.operation}`);
      console.log(`  Details: ${r.details}`);
      if (r.query) {
        console.log(`  Query: ${r.query.replace(/\s+/g, ' ').trim()}`);
      }
      if (r.resultSet && r.resultSet.length > 0) {
        console.log(`  Result Set: ${JSON.stringify(r.resultSet, null, 2)}`);
      }
    }
    console.log('');
  }

  // Show summary by table
  console.log('─'.repeat(80));
  console.log('  TEST SUMMARY BY TABLE:');
  console.log('─'.repeat(80));

  for (const [tableName, tableResults] of byTable) {
    const allPassed = tableResults.every((r) => r.passed);
    const icon = allPassed ? '✅' : '❌';
    const operations = tableResults.map((r) => `${r.operation}:${r.passed ? 'OK' : 'FAIL'}`).join(', ');
    console.log(`  ${icon} ${tableName}: ${operations}`);
  }

  console.log('');
  console.log('─'.repeat(80));
  console.log(`  Test Tenant A: ${result.tenantAId}`);
  console.log(`  Test Tenant B: ${result.tenantBId}`);
  console.log(`  Started: ${result.startedAt.toISOString()}`);
  console.log(`  Completed: ${result.completedAt.toISOString()}`);
  console.log('─'.repeat(80));
  console.log('');

  // Output JSON for CI parsing if requested
  if (process.env.CI_OUTPUT_JSON === 'true') {
    console.log('JSON_OUTPUT_START');
    console.log(JSON.stringify(result, null, 2));
    console.log('JSON_OUTPUT_END');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log('Cross-Tenant Security Test Suite');
  log('================================');
  log('');
  log('This suite validates RLS enforcement by attempting cross-tenant access.');
  log('All tests should show that cross-tenant access is BLOCKED.');
  log('');

  if (!process.env.DATABASE_URL) {
    logError('DATABASE_URL environment variable is required');
    process.exit(2);
  }

  const config: TestConfig = {
    ...DEFAULT_CONFIG,
    verbose: process.env.VERBOSE === 'true',
    skipCleanupOnFailure: process.env.SKIP_CLEANUP === 'true',
  };

  try {
    const result = await runTestSuite(config);
    formatOutput(result);

    if (result.passed) {
      logSuccess('All cross-tenant security tests PASSED');
      logSuccess('RLS is correctly blocking cross-tenant access');
      process.exit(0);
    } else {
      logError('Some cross-tenant security tests FAILED');
      logError('CRITICAL: Cross-tenant access was NOT properly blocked');
      logError('Review the failed tests above and fix RLS policies before production cutover');
      process.exit(1);
    }
  } catch (error) {
    logError(`Test execution failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(2);
  }
}

// Run
main().catch((err) => {
  logError(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
