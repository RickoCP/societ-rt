/**
 * Remediation Report Generator
 *
 * Generates comprehensive reports for the remediation workflow,
 * including before/after state, summary statistics, and detailed
 * results per user.
 *
 * @see Task 33: Evidence-Based Remediation Workflow
 * @see Requirement 11 AC 5: Generate report with before/after state
 * @see Requirement 11 AC 6: Support dry-run mode report
 */

import { randomUUID } from 'node:crypto';

import type {
  CreatedMembershipEntry,
  QuarantineVerificationResult,
  RemediationReport,
  RemediationReportMetadata,
  RemediationResult,
  RemediationSummary,
  SkippedUserEntry,
} from './types';
import { REMEDIATION_SERVICE_VERSION } from './types';

// ---------------------------------------------------------------------------
// Report Generator Interface
// ---------------------------------------------------------------------------

/**
 * Report Generator interface.
 */
export interface IRemediationReportGenerator {
  /**
   * Generate a complete remediation report.
   *
   * @param params - Report generation parameters
   * @returns Complete remediation report
   */
  generate(params: ReportGeneratorParams): RemediationReport;

  /**
   * Generate report metadata.
   *
   * @param dryRun - Whether this is a dry-run
   * @param correlationId - Correlation ID for tracing
   * @returns Report metadata
   */
  generateMetadata(dryRun: boolean, correlationId?: string): RemediationReportMetadata;

  /**
   * Generate summary statistics from results.
   *
   * @param results - Remediation results
   * @returns Summary statistics
   */
  generateSummary(results: readonly RemediationResult[]): RemediationSummary;

  /**
   * Extract skipped users from results.
   *
   * @param results - Remediation results
   * @returns Skipped user entries
   */
  extractSkippedUsers(results: readonly RemediationResult[]): readonly SkippedUserEntry[];

  /**
   * Extract created memberships from results.
   *
   * @param results - Remediation results
   * @returns Created membership entries
   */
  extractCreatedMemberships(
    results: readonly RemediationResult[],
  ): readonly CreatedMembershipEntry[];

  /**
   * Format report as JSON string.
   *
   * @param report - Remediation report
   * @param pretty - Whether to pretty-print
   * @returns JSON string
   */
  toJson(report: RemediationReport, pretty?: boolean): string;

  /**
   * Format report as markdown.
   *
   * @param report - Remediation report
   * @returns Markdown string
   */
  toMarkdown(report: RemediationReport): string;
}

/**
 * Parameters for report generation.
 */
export interface ReportGeneratorParams {
  /** Whether this is a dry-run */
  readonly dryRun: boolean;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Quarantine verification result */
  readonly quarantineVerification: QuarantineVerificationResult;
  /** Remediation results */
  readonly results: readonly RemediationResult[];
}

// ---------------------------------------------------------------------------
// Report Generator Implementation
// ---------------------------------------------------------------------------

/**
 * Creates a RemediationReportGenerator instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @returns RemediationReportGenerator instance
 *
 * @example
 * ```typescript
 * const generator = createRemediationReportGenerator();
 *
 * const report = generator.generate({
 *   dryRun: true,
 *   quarantineVerification: { verified: true, ... },
 *   results: [...],
 * });
 *
 * console.log(generator.toMarkdown(report));
 * ```
 */
export function createRemediationReportGenerator(): IRemediationReportGenerator {
  return {
    generate(params: ReportGeneratorParams): RemediationReport {
      const metadata = this.generateMetadata(params.dryRun, params.correlationId);
      const summary = this.generateSummary(params.results);
      const skippedUsers = this.extractSkippedUsers(params.results);
      const createdMemberships = this.extractCreatedMemberships(params.results);

      return {
        metadata,
        quarantineVerification: params.quarantineVerification,
        summary,
        results: params.results,
        skippedUsers,
        createdMemberships,
      };
    },

    generateMetadata(dryRun: boolean, correlationId?: string): RemediationReportMetadata {
      return {
        generatedAt: new Date().toISOString(),
        dryRun,
        correlationId: correlationId ?? randomUUID(),
        serviceVersion: REMEDIATION_SERVICE_VERSION,
      };
    },

    generateSummary(results: readonly RemediationResult[]): RemediationSummary {
      const summary = {
        totalDiscovered: results.length,
        created: 0,
        skippedQuarantine: 0,
        skippedMissingTenant: 0,
        skippedInvalidRole: 0,
        skippedAmbiguous: 0,
        skippedDryRun: 0,
        totalSkipped: 0,
      };

      for (const result of results) {
        switch (result.disposition) {
          case 'created':
            summary.created++;
            break;
          case 'skipped-quarantine':
            summary.skippedQuarantine++;
            summary.totalSkipped++;
            break;
          case 'skipped-missing-tenant':
            summary.skippedMissingTenant++;
            summary.totalSkipped++;
            break;
          case 'skipped-invalid-role':
            summary.skippedInvalidRole++;
            summary.totalSkipped++;
            break;
          case 'skipped-ambiguous':
            summary.skippedAmbiguous++;
            summary.totalSkipped++;
            break;
          case 'skipped-dry-run':
            summary.skippedDryRun++;
            summary.totalSkipped++;
            break;
        }
      }

      return summary;
    },

    extractSkippedUsers(
      results: readonly RemediationResult[],
    ): readonly SkippedUserEntry[] {
      return results
        .filter((r) => r.disposition !== 'created')
        .map((r) => ({
          userId: r.userId,
          email: r.email,
          name: r.beforeState.name,
          legacyTenantId: r.beforeState.legacyTenantId,
          legacyRole: r.beforeState.legacyRole,
          disposition: r.disposition,
          reason: r.reason,
        }));
    },

    extractCreatedMemberships(
      results: readonly RemediationResult[],
    ): readonly CreatedMembershipEntry[] {
      return results
        .filter((r) => r.disposition === 'created' && r.afterState !== null)
        .map((r) => ({
          userId: r.userId,
          email: r.email,
          name: r.beforeState.name,
          membershipId: r.afterState!.membershipId,
          tenantId: r.afterState!.tenantId,
          orgUnitId: r.afterState!.orgUnitId,
          role: r.afterState!.role,
          legacyRole: r.beforeState.legacyRole,
        }));
    },

    toJson(report: RemediationReport, pretty = true): string {
      return JSON.stringify(report, null, pretty ? 2 : undefined);
    },

    toMarkdown(report: RemediationReport): string {
      const lines: string[] = [];

      // Header
      lines.push('# Legacy Data Remediation Report');
      lines.push('');

      // Metadata
      lines.push('## Metadata');
      lines.push('');
      lines.push(`- **Generated At:** ${report.metadata.generatedAt}`);
      lines.push(`- **Dry Run:** ${report.metadata.dryRun ? 'Yes' : 'No'}`);
      lines.push(`- **Correlation ID:** \`${report.metadata.correlationId}\``);
      lines.push(`- **Service Version:** ${report.metadata.serviceVersion}`);
      lines.push('');

      // Quarantine Verification
      lines.push('## Quarantine Verification');
      lines.push('');
      const qv = report.quarantineVerification;
      lines.push(`- **Verified:** ${qv.verified ? '✅ Yes' : '❌ No'}`);
      lines.push(`- **Expected Count:** ${qv.expectedCount}`);
      lines.push(`- **Actual Count:** ${qv.actualCount}`);
      lines.push(`- **Manifest Version:** ${qv.manifestVersion}`);
      if (qv.errorMessage) {
        lines.push(`- **Error:** ${qv.errorMessage}`);
      }
      lines.push('');

      // Summary
      lines.push('## Summary');
      lines.push('');
      const s = report.summary;
      lines.push(`| Metric | Count |`);
      lines.push(`|--------|-------|`);
      lines.push(`| Total Discovered | ${s.totalDiscovered} |`);
      lines.push(`| Created | ${s.created} |`);
      lines.push(`| Skipped (Quarantine) | ${s.skippedQuarantine} |`);
      lines.push(`| Skipped (Missing Tenant) | ${s.skippedMissingTenant} |`);
      lines.push(`| Skipped (Invalid Role) | ${s.skippedInvalidRole} |`);
      lines.push(`| Skipped (Ambiguous) | ${s.skippedAmbiguous} |`);
      lines.push(`| Skipped (Dry Run) | ${s.skippedDryRun} |`);
      lines.push(`| **Total Skipped** | **${s.totalSkipped}** |`);
      lines.push('');

      // Created Memberships
      if (report.createdMemberships.length > 0) {
        lines.push('## Created Memberships');
        lines.push('');
        lines.push(
          '| User ID | Email | Legacy Role | Target Role | OrgUnit ID |',
        );
        lines.push(
          '|---------|-------|-------------|-------------|------------|',
        );
        for (const m of report.createdMemberships) {
          const orgUnit = m.orgUnitId ?? '(tenant-level)';
          lines.push(
            `| \`${m.userId.slice(0, 8)}...\` | ${m.email} | ${m.legacyRole} | ${m.role} | \`${orgUnit.slice(0, 8)}...\` |`,
          );
        }
        lines.push('');
      }

      // Skipped Users
      if (report.skippedUsers.length > 0) {
        lines.push('## Skipped Users');
        lines.push('');
        lines.push('| User ID | Email | Disposition | Reason |');
        lines.push('|---------|-------|-------------|--------|');
        for (const u of report.skippedUsers) {
          lines.push(
            `| \`${u.userId.slice(0, 8)}...\` | ${u.email} | ${u.disposition} | ${u.reason} |`,
          );
        }
        lines.push('');
      }

      // Footer
      lines.push('---');
      lines.push('');
      lines.push('*Report generated by LegacyDataRemediationService*');
      lines.push('');

      return lines.join('\n');
    },
  };
}

// ---------------------------------------------------------------------------
// Default Instance
// ---------------------------------------------------------------------------

/**
 * Default generator instance for convenience imports.
 */
const defaultGenerator = createRemediationReportGenerator();

/**
 * Generate a complete remediation report.
 *
 * Convenience function using default generator.
 *
 * @param params - Report generation parameters
 * @returns Complete remediation report
 */
export function generateRemediationReport(
  params: ReportGeneratorParams,
): RemediationReport {
  return defaultGenerator.generate(params);
}

/**
 * Format report as JSON string.
 *
 * Convenience function using default generator.
 *
 * @param report - Remediation report
 * @param pretty - Whether to pretty-print
 * @returns JSON string
 */
export function formatReportAsJson(
  report: RemediationReport,
  pretty = true,
): string {
  return defaultGenerator.toJson(report, pretty);
}

/**
 * Format report as markdown.
 *
 * Convenience function using default generator.
 *
 * @param report - Remediation report
 * @returns Markdown string
 */
export function formatReportAsMarkdown(report: RemediationReport): string {
  return defaultGenerator.toMarkdown(report);
}
