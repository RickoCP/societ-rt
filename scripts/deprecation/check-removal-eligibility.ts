#!/usr/bin/env npx tsx
/**
 * Deprecation Removal Eligibility Check Script
 *
 * This script implements the manual-gated removal process for deprecated code
 * as specified in Requirement 18.7:
 *
 * "AFTER removal timeline expires, THE Cleanup process SHALL flag expired
 * deprecated code for review, and an authorized developer MUST approve and
 * trigger the actual removal (manual-gated removal, not automatic)"
 *
 * Features:
 * 1. Reads the list of deprecated items and their deprecation dates
 * 2. Checks if any items have passed their 30-day deprecation window
 * 3. Reports items eligible for removal
 * 4. Requires environment variable `AUTHORIZED_REMOVER` to proceed with removal
 * 5. Logs all removal decisions for audit
 *
 * @see Requirements 18.7 - Manual-gated removal process
 * @see docs/REMOVAL_APPROVAL_PROCESS.md - Approval workflow documentation
 */

/* eslint-disable no-console */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default deprecation window in days */
const DEPRECATION_WINDOW_DAYS = 30;

/** Path to deprecation tracking file */
const DEPRECATION_TRACKING_FILE = '.kiro/deprecation-tracking.json';

/** Path to removal audit log */
const REMOVAL_AUDIT_LOG = '.kiro/removal-audit-log.json';

/** Authorized roles that can approve removal */
const AUTHORIZED_ROLES = ['engineering-lead', 'tech-lead', 'principal-engineer'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthorizedRole = (typeof AUTHORIZED_ROLES)[number];

interface DeprecatedItem {
  /** Unique identifier for the deprecated item */
  id: string;
  /** Human-readable name/description */
  name: string;
  /** File path where the deprecated code exists */
  filePath: string;
  /** Line number (approximate) in the file */
  lineNumber?: number;
  /** Category of deprecated code */
  category: 'function' | 'type' | 'enum' | 'interface' | 'class' | 'module' | 'pattern';
  /** Date when deprecation was marked (ISO string) */
  deprecatedAt: string;
  /** Deprecation window in days (defaults to 30) */
  windowDays?: number;
  /** Migration path/replacement description */
  migrationGuide: string;
  /** Reason for deprecation */
  reason: string;
  /** Whether removal has been approved */
  removalApproved?: boolean;
  /** Date when removal was approved (ISO string) */
  removalApprovedAt?: string;
  /** Who approved the removal */
  removalApprovedBy?: string;
  /** Whether the item has been removed */
  removed?: boolean;
  /** Date when item was removed (ISO string) */
  removedAt?: string;
}

interface DeprecationTracking {
  version: string;
  lastUpdated: string;
  deprecatedItems: DeprecatedItem[];
  migrationCompletionDate?: string;
}

interface EligibilityResult {
  item: DeprecatedItem;
  isEligible: boolean;
  daysDeprecated: number;
  windowDays: number;
  daysOverdue: number;
  reason: string;
}

interface RemovalDecision {
  timestamp: string;
  action: 'approved' | 'rejected' | 'deferred' | 'check_only';
  itemId: string;
  itemName: string;
  filePath: string;
  authorizedBy: string | null;
  role: string | null;
  reason: string;
  daysDeprecated: number;
  correlationId: string;
}

interface AuditLog {
  version: string;
  entries: RemovalDecision[];
}

interface RemovalReport {
  timestamp: Date;
  environment: string;
  mode: 'check' | 'approve' | 'remove';
  authorizedRemover: string | null;
  eligibleItems: EligibilityResult[];
  pendingApproval: DeprecatedItem[];
  approvedPendingRemoval: DeprecatedItem[];
  alreadyRemoved: DeprecatedItem[];
  summary: ReportSummary;
  recommendations: string[];
}

interface ReportSummary {
  totalDeprecated: number;
  eligibleForRemoval: number;
  approvedPendingRemoval: number;
  alreadyRemoved: number;
  notYetEligible: number;
  blockedItems: number;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Generate a unique correlation ID for audit logging
 */
function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `REM-${timestamp}-${random}`.toUpperCase();
}

/**
 * Calculate the number of days since a date
 */
function daysSince(dateString: string): number {
  const deprecationDate = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - deprecationDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if a role is authorized for removal approval
 */
function isAuthorizedRole(role: string): role is AuthorizedRole {
  return AUTHORIZED_ROLES.includes(role as AuthorizedRole);
}

/**
 * Load deprecation tracking file
 */
function loadDeprecationTracking(): DeprecationTracking {
  const trackingPath = path.resolve(process.cwd(), DEPRECATION_TRACKING_FILE);

  if (!fs.existsSync(trackingPath)) {
    // Create default tracking file if it doesn't exist
    const defaultTracking: DeprecationTracking = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      deprecatedItems: getDefaultDeprecatedItems(),
    };
    fs.mkdirSync(path.dirname(trackingPath), { recursive: true });
    fs.writeFileSync(trackingPath, JSON.stringify(defaultTracking, null, 2));
    return defaultTracking;
  }

  const content = fs.readFileSync(trackingPath, 'utf-8');
  return JSON.parse(content) as DeprecationTracking;
}

/**
 * Save deprecation tracking file
 */
function saveDeprecationTracking(tracking: DeprecationTracking): void {
  const trackingPath = path.resolve(process.cwd(), DEPRECATION_TRACKING_FILE);
  tracking.lastUpdated = new Date().toISOString();
  fs.writeFileSync(trackingPath, JSON.stringify(tracking, null, 2));
}

/**
 * Load audit log
 */
function loadAuditLog(): AuditLog {
  const auditPath = path.resolve(process.cwd(), REMOVAL_AUDIT_LOG);

  if (!fs.existsSync(auditPath)) {
    return { version: '1.0.0', entries: [] };
  }

  const content = fs.readFileSync(auditPath, 'utf-8');
  return JSON.parse(content) as AuditLog;
}

/**
 * Save audit log entry
 */
function saveAuditLogEntry(decision: RemovalDecision): void {
  const auditPath = path.resolve(process.cwd(), REMOVAL_AUDIT_LOG);
  const auditLog = loadAuditLog();

  auditLog.entries.push(decision);

  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(auditLog, null, 2));

  console.log(`📝 Audit log entry created: ${decision.correlationId}`);
}

/**
 * Get default deprecated items list based on the codebase
 */
function getDefaultDeprecatedItems(): DeprecatedItem[] {
  // These are the known deprecated items from the multi-tenant integration cutover
  // The deprecation dates should be updated when the actual migration completion occurs
  return [
    {
      id: 'resolve-auth-context-fn',
      name: 'resolveAuthContext() function',
      filePath: 'src/infrastructure/utils/resolveAuthContext.ts',
      lineNumber: 110,
      category: 'function',
      deprecatedAt: new Date().toISOString(), // Will be updated on migration completion
      windowDays: DEPRECATION_WINDOW_DAYS,
      migrationGuide: 'Use withPermission wrapper instead. See FASE 2.2 route migration tasks.',
      reason: 'Replaced by AuthorizationContextResolver in multi-tenant architecture',
    },
    {
      id: 'auth-context-type',
      name: 'AuthContext type',
      filePath: 'src/core/protocols/AuthContext.ts',
      lineNumber: 30,
      category: 'type',
      deprecatedAt: new Date().toISOString(),
      windowDays: DEPRECATION_WINDOW_DAYS,
      migrationGuide: 'Import AuthorizationContext from @core/domains/authorization/types',
      reason: 'Replaced by AuthorizationContext with full membership and permission data',
    },
    {
      id: 'user-role-enum',
      name: 'UserRole enum',
      filePath: 'src/core/protocols/AuthContext.ts',
      lineNumber: 13,
      category: 'enum',
      deprecatedAt: new Date().toISOString(),
      windowDays: DEPRECATION_WINDOW_DAYS,
      migrationGuide: 'Use MembershipRole from @infrastructure/middleware/authorization',
      reason: 'Replaced by MembershipRole enum in multi-tenant architecture',
    },
    {
      id: 'legacy-auth-result-type',
      name: 'LegacyAuthResult type',
      filePath: 'src/infrastructure/shadow/types.ts',
      lineNumber: 109,
      category: 'type',
      deprecatedAt: new Date().toISOString(),
      windowDays: DEPRECATION_WINDOW_DAYS,
      migrationGuide: 'Use NewAuthResult type after shadow mode validation is complete',
      reason: 'Shadow mode validation type - remove after migration completion',
    },
    {
      id: 'legacy-authorization-adapter',
      name: 'LegacyAuthorizationAdapter class',
      filePath: 'src/infrastructure/authorization/LegacyAuthorizationAdapter.ts',
      lineNumber: 1,
      category: 'class',
      deprecatedAt: new Date().toISOString(),
      windowDays: DEPRECATION_WINDOW_DAYS,
      migrationGuide: 'Remove after shadow validation complete. No direct replacement needed.',
      reason: 'Shadow mode validation adapter - no longer needed after cutover',
    },
    {
      id: 'legacy-authz-error-codes',
      name: 'LEGACY_AUTHZ_ERROR_CODES constants',
      filePath: 'src/core/utils/errors/ErrorCodeRegistry.ts',
      lineNumber: 265,
      category: 'module',
      deprecatedAt: new Date().toISOString(),
      windowDays: DEPRECATION_WINDOW_DAYS,
      migrationGuide: 'Use AUTHZ_* error codes from the same file instead',
      reason: 'Legacy error codes replaced by new AUTHZ_* prefixed codes',
    },
    {
      id: 'cutover-flags-system',
      name: 'Cutover Feature Flag System',
      filePath: 'src/infrastructure/cutover/',
      category: 'module',
      deprecatedAt: new Date().toISOString(),
      windowDays: DEPRECATION_WINDOW_DAYS,
      migrationGuide: 'Archive for emergency rollback; do not remove completely',
      reason: 'Migration control flags - keep archived for emergency rollback capability',
    },
    {
      id: 'shadow-auth-executor',
      name: 'ShadowAuthExecutor service',
      filePath: 'src/infrastructure/shadow/ShadowAuthExecutor.ts',
      lineNumber: 1,
      category: 'class',
      deprecatedAt: new Date().toISOString(),
      windowDays: DEPRECATION_WINDOW_DAYS,
      migrationGuide: 'Remove after 7 consecutive days of 0% mismatch rate',
      reason: 'Shadow mode validation - no longer needed after successful cutover',
    },
  ];
}

// ---------------------------------------------------------------------------
// Eligibility Check Functions
// ---------------------------------------------------------------------------

/**
 * Check if a deprecated item is eligible for removal
 */
function checkEligibility(item: DeprecatedItem): EligibilityResult {
  const daysDeprecated = daysSince(item.deprecatedAt);
  const windowDays = item.windowDays ?? DEPRECATION_WINDOW_DAYS;
  const isEligible = daysDeprecated >= windowDays;
  const daysOverdue = Math.max(0, daysDeprecated - windowDays);

  let reason: string;
  if (item.removed) {
    reason = 'Already removed';
  } else if (item.removalApproved) {
    reason = 'Approved, pending removal';
  } else if (isEligible) {
    reason = `Eligible for removal (${daysOverdue} days overdue)`;
  } else {
    reason = `Not yet eligible (${windowDays - daysDeprecated} days remaining)`;
  }

  return {
    item,
    isEligible,
    daysDeprecated,
    windowDays,
    daysOverdue,
    reason,
  };
}

/**
 * Get all items eligible for removal
 */
function getEligibleItems(tracking: DeprecationTracking): EligibilityResult[] {
  return tracking.deprecatedItems
    .filter(item => !item.removed && !item.removalApproved)
    .map(checkEligibility)
    .filter(result => result.isEligible);
}

/**
 * Get items approved but not yet removed
 */
function getApprovedPendingRemoval(tracking: DeprecationTracking): DeprecatedItem[] {
  return tracking.deprecatedItems.filter(item => item.removalApproved && !item.removed);
}

/**
 * Get items not yet eligible for removal
 */
function getPendingApproval(tracking: DeprecationTracking): DeprecatedItem[] {
  return tracking.deprecatedItems.filter(item => {
    if (item.removed || item.removalApproved) return false;
    const daysDeprecated = daysSince(item.deprecatedAt);
    const windowDays = item.windowDays ?? DEPRECATION_WINDOW_DAYS;
    return daysDeprecated < windowDays;
  });
}

/**
 * Get already removed items
 */
function getAlreadyRemoved(tracking: DeprecationTracking): DeprecatedItem[] {
  return tracking.deprecatedItems.filter(item => item.removed);
}

// ---------------------------------------------------------------------------
// Removal Actions
// ---------------------------------------------------------------------------

/**
 * Approve removal for eligible items
 */
function approveRemoval(
  tracking: DeprecationTracking,
  itemIds: string[],
  authorizedBy: string,
  role: string,
): { approved: DeprecatedItem[]; failed: Array<{ id: string; reason: string }> } {
  const approved: DeprecatedItem[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  for (const itemId of itemIds) {
    const item = tracking.deprecatedItems.find(i => i.id === itemId);

    if (!item) {
      failed.push({ id: itemId, reason: 'Item not found' });
      continue;
    }

    if (item.removed) {
      failed.push({ id: itemId, reason: 'Item already removed' });
      continue;
    }

    if (item.removalApproved) {
      failed.push({ id: itemId, reason: 'Item already approved' });
      continue;
    }

    const eligibility = checkEligibility(item);
    if (!eligibility.isEligible) {
      failed.push({ id: itemId, reason: eligibility.reason });
      continue;
    }

    // Approve the removal
    item.removalApproved = true;
    item.removalApprovedAt = new Date().toISOString();
    item.removalApprovedBy = authorizedBy;

    approved.push(item);

    // Log the decision
    const decision: RemovalDecision = {
      timestamp: new Date().toISOString(),
      action: 'approved',
      itemId: item.id,
      itemName: item.name,
      filePath: item.filePath,
      authorizedBy,
      role,
      reason: `Approved after ${eligibility.daysDeprecated} days deprecation window`,
      daysDeprecated: eligibility.daysDeprecated,
      correlationId: generateCorrelationId(),
    };
    saveAuditLogEntry(decision);
  }

  return { approved, failed };
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate the removal eligibility report
 */
function generateReport(
  tracking: DeprecationTracking,
  mode: 'check' | 'approve' | 'remove',
  authorizedRemover: string | null,
): RemovalReport {
  const eligibleItems = getEligibleItems(tracking);
  const pendingApproval = getPendingApproval(tracking);
  const approvedPendingRemoval = getApprovedPendingRemoval(tracking);
  const alreadyRemoved = getAlreadyRemoved(tracking);

  const summary: ReportSummary = {
    totalDeprecated: tracking.deprecatedItems.length,
    eligibleForRemoval: eligibleItems.length,
    approvedPendingRemoval: approvedPendingRemoval.length,
    alreadyRemoved: alreadyRemoved.length,
    notYetEligible: pendingApproval.length,
    blockedItems: 0,
  };

  const recommendations: string[] = [];

  if (eligibleItems.length > 0) {
    recommendations.push(
      `⚠️ ${eligibleItems.length} item(s) have passed their deprecation window and are eligible for removal.`,
    );
    recommendations.push(
      '   Run with --approve flag and AUTHORIZED_REMOVER environment variable to approve removal.',
    );
  }

  if (approvedPendingRemoval.length > 0) {
    recommendations.push(
      `✅ ${approvedPendingRemoval.length} item(s) are approved and ready for removal.`,
    );
    recommendations.push('   Manual code removal is required. See docs/REMOVAL_APPROVAL_PROCESS.md.');
  }

  if (pendingApproval.length > 0) {
    recommendations.push(
      `⏳ ${pendingApproval.length} item(s) are still within their deprecation window.`,
    );
  }

  if (mode === 'approve' && !authorizedRemover) {
    recommendations.push(
      '❌ AUTHORIZED_REMOVER environment variable is required to approve removals.',
    );
    recommendations.push('   Format: AUTHORIZED_REMOVER="name:role" (e.g., "john.doe:engineering-lead")');
  }

  if (mode === 'approve' && authorizedRemover) {
    const [, role] = authorizedRemover.split(':');
    if (!isAuthorizedRole(role || '')) {
      recommendations.push(
        `❌ Role "${role}" is not authorized for removal approval.`,
      );
      recommendations.push(`   Authorized roles: ${AUTHORIZED_ROLES.join(', ')}`);
    }
  }

  return {
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development',
    mode,
    authorizedRemover,
    eligibleItems,
    pendingApproval,
    approvedPendingRemoval,
    alreadyRemoved,
    summary,
    recommendations,
  };
}

/**
 * Print the removal eligibility report
 */
function printReport(report: RemovalReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('📋 DEPRECATION REMOVAL ELIGIBILITY REPORT');
  console.log('='.repeat(80));

  console.log(`\nTimestamp: ${report.timestamp.toISOString()}`);
  console.log(`Environment: ${report.environment}`);
  console.log(`Mode: ${report.mode.toUpperCase()}`);
  console.log(`Authorized Remover: ${report.authorizedRemover || 'Not provided'}`);

  console.log('\n📊 Summary:');
  console.log('-'.repeat(80));
  console.log(`  Total deprecated items: ${report.summary.totalDeprecated}`);
  console.log(`  Eligible for removal:   ${report.summary.eligibleForRemoval}`);
  console.log(`  Approved (pending):     ${report.summary.approvedPendingRemoval}`);
  console.log(`  Already removed:        ${report.summary.alreadyRemoved}`);
  console.log(`  Not yet eligible:       ${report.summary.notYetEligible}`);

  if (report.eligibleItems.length > 0) {
    console.log('\n⚠️ Items Eligible for Removal:');
    console.log('-'.repeat(80));
    report.eligibleItems.forEach((result, i) => {
      console.log(`  ${i + 1}. ${result.item.name} [${result.item.id}]`);
      console.log(`     File: ${result.item.filePath}${result.item.lineNumber ? `:${result.item.lineNumber}` : ''}`);
      console.log(`     Category: ${result.item.category}`);
      console.log(`     Deprecated: ${result.daysDeprecated} days ago (${result.daysOverdue} days overdue)`);
      console.log(`     Reason: ${result.item.reason}`);
      console.log(`     Migration: ${result.item.migrationGuide}`);
      console.log('');
    });
  }

  if (report.approvedPendingRemoval.length > 0) {
    console.log('\n✅ Approved Items Pending Removal:');
    console.log('-'.repeat(80));
    report.approvedPendingRemoval.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name} [${item.id}]`);
      console.log(`     File: ${item.filePath}`);
      console.log(`     Approved by: ${item.removalApprovedBy}`);
      console.log(`     Approved at: ${item.removalApprovedAt}`);
      console.log('');
    });
  }

  if (report.pendingApproval.length > 0) {
    console.log('\n⏳ Items Still in Deprecation Window:');
    console.log('-'.repeat(80));
    report.pendingApproval.forEach((item, i) => {
      const daysDeprecated = daysSince(item.deprecatedAt);
      const windowDays = item.windowDays ?? DEPRECATION_WINDOW_DAYS;
      const daysRemaining = windowDays - daysDeprecated;
      console.log(`  ${i + 1}. ${item.name} [${item.id}]`);
      console.log(`     File: ${item.filePath}`);
      console.log(`     Days remaining: ${daysRemaining}`);
      console.log('');
    });
  }

  console.log('\n📝 Recommendations:');
  console.log('-'.repeat(80));
  report.recommendations.forEach(rec => console.log(`  ${rec}`));

  console.log('\n' + '='.repeat(80));

  // JSON output for CI/CD integration
  if (process.argv.includes('--json')) {
    console.log('\n📦 JSON Output:');
    console.log(JSON.stringify(report, null, 2));
  }
}

// ---------------------------------------------------------------------------
// CLI Interface
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Deprecation Removal Eligibility Check

Usage:
  npx tsx scripts/deprecation/check-removal-eligibility.ts [options]

Options:
  --check           Check eligibility only (default)
  --approve <ids>   Approve removal for specific item IDs (comma-separated)
  --approve-all     Approve all eligible items
  --json            Output in JSON format
  --help            Show this help message

Environment Variables:
  AUTHORIZED_REMOVER   Required for --approve actions
                       Format: "name:role" (e.g., "john.doe:engineering-lead")

Authorized Roles:
  ${AUTHORIZED_ROLES.join(', ')}

Examples:
  # Check eligibility
  npx tsx scripts/deprecation/check-removal-eligibility.ts --check

  # Approve specific items
  AUTHORIZED_REMOVER="john.doe:engineering-lead" \\
    npx tsx scripts/deprecation/check-removal-eligibility.ts --approve resolve-auth-context-fn,auth-context-type

  # Approve all eligible items
  AUTHORIZED_REMOVER="jane.smith:tech-lead" \\
    npx tsx scripts/deprecation/check-removal-eligibility.ts --approve-all

See docs/REMOVAL_APPROVAL_PROCESS.md for the complete approval workflow.
`);
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║  Deprecation Removal Eligibility Check                                       ║');
  console.log('║  Requirements 18.7 - Manual-gated removal process                            ║');
  console.log('╚' + '═'.repeat(78) + '╝');

  // Parse arguments
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const mode: 'check' | 'approve' | 'remove' = args.includes('--approve') || args.includes('--approve-all')
    ? 'approve'
    : 'check';

  // Load tracking data
  const tracking = loadDeprecationTracking();

  // Get authorized remover from environment
  const authorizedRemover = process.env.AUTHORIZED_REMOVER || null;

  // Generate initial report
  let report = generateReport(tracking, mode, authorizedRemover);

  // Handle approval mode
  if (mode === 'approve') {
    if (!authorizedRemover) {
      console.log('\n❌ ERROR: AUTHORIZED_REMOVER environment variable is required for approval.');
      console.log('   Format: AUTHORIZED_REMOVER="name:role"');
      console.log(`   Authorized roles: ${AUTHORIZED_ROLES.join(', ')}`);
      printReport(report);
      process.exit(1);
    }

    const [name, role] = authorizedRemover.split(':');
    if (!name || !role) {
      console.log('\n❌ ERROR: Invalid AUTHORIZED_REMOVER format.');
      console.log('   Expected: "name:role" (e.g., "john.doe:engineering-lead")');
      process.exit(1);
    }

    if (!isAuthorizedRole(role)) {
      console.log(`\n❌ ERROR: Role "${role}" is not authorized for removal approval.`);
      console.log(`   Authorized roles: ${AUTHORIZED_ROLES.join(', ')}`);
      process.exit(1);
    }

    // Get item IDs to approve
    let itemIds: string[];
    if (args.includes('--approve-all')) {
      itemIds = report.eligibleItems.map(r => r.item.id);
    } else {
      const approveIndex = args.indexOf('--approve');
      const idsArg = args[approveIndex + 1];
      if (!idsArg) {
        console.log('\n❌ ERROR: --approve requires comma-separated item IDs.');
        console.log('   Example: --approve resolve-auth-context-fn,auth-context-type');
        process.exit(1);
      }
      itemIds = idsArg.split(',').map(id => id.trim());
    }

    if (itemIds.length === 0) {
      console.log('\n⚠️ No items to approve.');
      printReport(report);
      process.exit(0);
    }

    // Perform approval
    console.log(`\n🔐 Processing approval by ${name} (${role})...`);
    const { approved, failed } = approveRemoval(tracking, itemIds, name, role);

    if (approved.length > 0) {
      console.log(`\n✅ Approved ${approved.length} item(s) for removal:`);
      approved.forEach(item => console.log(`   - ${item.name} [${item.id}]`));
      saveDeprecationTracking(tracking);
    }

    if (failed.length > 0) {
      console.log(`\n⚠️ Failed to approve ${failed.length} item(s):`);
      failed.forEach(f => console.log(`   - ${f.id}: ${f.reason}`));
    }

    // Regenerate report after approval
    report = generateReport(tracking, mode, authorizedRemover);
  }

  // Print report
  printReport(report);

  // Log the check action for audit
  if (mode === 'check') {
    const decision: RemovalDecision = {
      timestamp: new Date().toISOString(),
      action: 'check_only',
      itemId: 'all',
      itemName: 'Eligibility check performed',
      filePath: '',
      authorizedBy: authorizedRemover?.split(':')[0] || null,
      role: authorizedRemover?.split(':')[1] || null,
      reason: `Found ${report.summary.eligibleForRemoval} eligible item(s)`,
      daysDeprecated: 0,
      correlationId: generateCorrelationId(),
    };
    saveAuditLogEntry(decision);
  }

  // Exit codes
  if (report.summary.eligibleForRemoval > 0 && mode === 'check') {
    console.log('\n⚠️ Action required: Items are eligible for removal.');
    process.exit(2); // Non-zero to indicate action needed
  }

  if (report.summary.approvedPendingRemoval > 0) {
    console.log('\n✅ Items approved for removal. See docs/REMOVAL_APPROVAL_PROCESS.md for next steps.');
  }

  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
