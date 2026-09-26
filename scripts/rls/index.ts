/**
 * RLS Testing Scripts
 *
 * This folder contains scripts for testing Row-Level Security (RLS) enforcement.
 *
 * Scripts:
 * - cross-tenant-security-tests.ts: Comprehensive cross-tenant security test suite
 * - test-utils.ts: Shared utilities for RLS testing
 *
 * Usage:
 *   npx tsx scripts/rls/cross-tenant-security-tests.ts
 *
 * Environment Variables:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *   VERBOSE - Enable verbose output (optional, default: false)
 *   SKIP_CLEANUP - Skip cleanup on failure for debugging (optional, default: false)
 *   CI_OUTPUT_JSON - Output JSON for CI parsing (optional, default: false)
 *
 * @see FASE 2.7 Task 16.2: Execute cross-tenant security tests on staging
 * @see Requirement 11: Cross-Tenant Access Prevention Testing
 */

export * from './test-utils';
