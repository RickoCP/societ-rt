/**
 * Validation Scripts Module
 *
 * This module provides validation scripts for the Multi-Tenant Integration Cutover.
 * These scripts verify the completion status of various migration requirements.
 *
 * Scripts:
 * - verify-tests-passing.ts: Verifies all integration tests are passing (Task 27.3)
 * - verify-rls-enabled.ts: Verifies RLS enabled on all tenant tables (Task 27.2)
 * - verify-performance.ts: Verifies performance benchmarks met (Task 27.4)
 * - verify-shadow-mode-metrics.ts: Verifies shadow mode 0% mismatch (Task 27.5)
 * - verify-cross-tenant-security.ts: Verifies cross-tenant tests passing (Task 27.6)
 * - verify-migration-complete.ts: Verifies all migration requirements complete (Task 27.1)
 * - generate-completion-report.ts: Generates comprehensive completion report (Task 27.7)
 *
 * @see FASE 2.16: Migration Completion Validation
 * @see Requirement 16: Migration Completion Validation
 */

export * from './verify-tests-passing';
export * from './verify-cross-tenant-security';
export * from './verify-performance';
export * from './generate-completion-report';
