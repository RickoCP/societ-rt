/**
 * Legacy Removal Report Generator — Generates comprehensive migration reports.
 *
 * This service generates reports including:
 * 1. Overall migration status summary
 * 2. Detailed code path usages with classification
 * 3. Route authorization validation results
 * 4. Recommendations for next steps
 * 5. External integration tracking
 *
 * **Output Formats:**
 * - JSON (for programmatic consumption)
 * - Markdown (for documentation/review)
 * - HTML (for dashboard display)
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 1-6)
 */

import { randomUUID } from 'crypto';
import type {
  ILegacyRemovalReportGenerator,
  LegacyRemovalReport,
  MigrationStatus,
  ReportMetadata,
  FileSummary,
  Recommendation,
  ExternalIntegration,
  ReportOptions,
  ReportFormat,
  CodePathUsage,
  RouteAuthorizationValidation,
  ICodePathAnalyzer,
  IAuthPathValidator,
  IMigrationStatusTracker,
} from './types';
import {
  DEFAULT_REPORT_OPTIONS,
  LEGACY_REMOVAL_SERVICE_VERSION,
} from './types';

// ---------------------------------------------------------------------------
// Report Generator Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies for LegacyRemovalReportGenerator.
 */
export interface LegacyRemovalReportGeneratorDependencies {
  /**
   * Code path analyzer instance.
   */
  readonly codePathAnalyzer: ICodePathAnalyzer;

  /**
   * Authorization path validator instance.
   */
  readonly authPathValidator: IAuthPathValidator;

  /**
   * Migration status tracker instance.
   */
  readonly migrationStatusTracker: IMigrationStatusTracker;
}

// ---------------------------------------------------------------------------
// Report Generation Helpers
// ---------------------------------------------------------------------------

/**
 * Generate file summaries from code path usages.
 */
function generateFileSummaries(
  usages: readonly CodePathUsage[],
): readonly FileSummary[] {
  const fileMap: Map<string, CodePathUsage[]> = new Map();

  // Group by file
  for (const usage of usages) {
    const existing = fileMap.get(usage.filePath) ?? [];
    existing.push(usage);
    fileMap.set(usage.filePath, existing);
  }

  // Create summaries
  const summaries: FileSummary[] = [];
  for (const [filePath, fileUsages] of fileMap) {
    const authCritical = fileUsages.filter(
      (u) => u.classification === 'authorization-critical',
    ).length;

    // Determine overall file migration status
    const statuses = fileUsages.map((u) => u.status);
    let migrationStatus = fileUsages[0]?.status ?? 'pending';
    if (statuses.every((s) => s === 'migrated' || s === 'removed')) {
      migrationStatus = 'migrated';
    } else if (statuses.some((s) => s === 'in-progress')) {
      migrationStatus = 'in-progress';
    } else {
      migrationStatus = 'pending';
    }

    // Get highest priority
    const priorities = fileUsages.map((u) => u.priority);
    let highestPriority = fileUsages[0]?.priority ?? 'medium';
    if (priorities.includes('critical')) {
      highestPriority = 'critical';
    } else if (priorities.includes('high')) {
      highestPriority = 'high';
    } else if (priorities.includes('medium')) {
      highestPriority = 'medium';
    }

    summaries.push({
      filePath,
      totalUsages: fileUsages.length,
      authorizationCritical: authCritical,
      migrationStatus,
      highestPriority,
    });
  }

  // Sort by priority (critical first) then by auth-critical count
  return summaries.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff =
      priorityOrder[a.highestPriority] - priorityOrder[b.highestPriority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.authorizationCritical - a.authorizationCritical;
  });
}

/**
 * Generate recommendations based on analysis results.
 */
function generateRecommendations(
  status: MigrationStatus,
  usages: readonly CodePathUsage[],
  routeValidations: readonly RouteAuthorizationValidation[],
): readonly Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Check for critical authorization paths
  const criticalPaths = usages.filter(
    (u) =>
      u.classification === 'authorization-critical' && u.status === 'pending',
  );
  if (criticalPaths.length > 0) {
    const affectedFiles = [...new Set(criticalPaths.map((u) => u.filePath))];
    recommendations.push({
      priority: 'critical',
      title: 'Migrate Authorization-Critical Code Paths',
      description:
        `${criticalPaths.length} code paths read User.tenantId for authorization decisions. ` +
        'These MUST be migrated to use AuthorizationContext before FASE 1.15 cleanup.',
      affectedFiles,
      estimatedEffort: `${Math.ceil(criticalPaths.length / 5)} hours`,
    });
  }

  // Check for legacy routes
  const legacyRoutes = routeValidations.filter(
    (r) => r.validationStatus === 'legacy',
  );
  if (legacyRoutes.length > 0) {
    recommendations.push({
      priority: 'critical',
      title: 'Update Legacy Route Handlers',
      description:
        `${legacyRoutes.length} route handlers still use legacy authorization. ` +
        'Add AuthorizationContext resolution and RequirePermission decorator.',
      affectedFiles: legacyRoutes.map((r) => r.filePath),
      estimatedEffort: `${Math.ceil(legacyRoutes.length * 0.5)} hours`,
    });
  }

  // Check for partial migrations
  const partialRoutes = routeValidations.filter(
    (r) => r.validationStatus === 'partial',
  );
  if (partialRoutes.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Complete Partial Migrations',
      description:
        `${partialRoutes.length} route handlers have mixed legacy/new authorization. ` +
        'Complete the migration by removing legacy User.tenantId references.',
      affectedFiles: partialRoutes.map((r) => r.filePath),
      estimatedEffort: `${Math.ceil(partialRoutes.length * 0.25)} hours`,
    });
  }

  // Check for worker/background job usages
  const workerUsages = usages.filter(
    (u) => u.usageContext.isWorker && u.status === 'pending',
  );
  if (workerUsages.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Update Worker/Background Job Authorization',
      description:
        `${workerUsages.length} background job code paths use User.tenantId. ` +
        'Workers should receive tenantId from job payload or system context.',
      affectedFiles: [...new Set(workerUsages.map((u) => u.filePath))],
      estimatedEffort: `${Math.ceil(workerUsages.length / 3)} hours`,
    });
  }

  // Check for read-only usages
  const readOnlyPending = usages.filter(
    (u) => u.classification === 'read-only' && u.status === 'pending',
  );
  if (readOnlyPending.length > 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Add Deprecation Warnings to Read-Only Usages',
      description:
        `${readOnlyPending.length} read-only code paths can be wrapped with deprecation warnings. ` +
        'This allows tracking while maintaining backward compatibility.',
      affectedFiles: [...new Set(readOnlyPending.map((u) => u.filePath))],
      estimatedEffort: `${Math.ceil(readOnlyPending.length / 10)} hours`,
    });
  }

  // Final recommendation if near complete
  if (status.progressPercentage >= 90 && !status.isComplete) {
    recommendations.push({
      priority: 'medium',
      title: 'Final Cleanup Review',
      description:
        'Migration is nearly complete. Perform a final review of remaining code paths ' +
        'and validate all route handlers before proceeding to FASE 1.15 cleanup.',
      affectedFiles: [],
      estimatedEffort: '2-4 hours',
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Identify potential external integrations.
 */
function identifyExternalIntegrations(
  usages: readonly CodePathUsage[],
): readonly ExternalIntegration[] {
  const integrations: ExternalIntegration[] = [];

  // Look for patterns that suggest external API endpoints
  const apiIntegrations = usages.filter(
    (u) =>
      u.classification === 'backward-compat' ||
      (u.usageContext.isRouteHandler &&
        u.filePath.toLowerCase().includes('external')),
  );

  if (apiIntegrations.length > 0) {
    integrations.push({
      integrationId: 'external-api-endpoints',
      name: 'External API Endpoints',
      dependency:
        'External clients may depend on API responses containing tenantId',
      files: [...new Set(apiIntegrations.map((u) => u.filePath))],
      migrationPlan:
        'Document external clients, communicate deprecation timeline, ' +
        'provide alternative fields in API responses.',
      backwardCompatRequired: true,
    });
  }

  // Look for webhook handlers
  const webhookUsages = usages.filter((u) =>
    u.filePath.toLowerCase().includes('webhook'),
  );
  if (webhookUsages.length > 0) {
    integrations.push({
      integrationId: 'webhook-handlers',
      name: 'Webhook Handlers',
      dependency:
        'Webhook payloads may include tenantId for routing/authorization',
      files: [...new Set(webhookUsages.map((u) => u.filePath))],
      migrationPlan:
        'Review webhook contracts, update to use Membership-based context.',
      backwardCompatRequired: false,
    });
  }

  return integrations;
}

// ---------------------------------------------------------------------------
// Report Formatting
// ---------------------------------------------------------------------------

/**
 * Format report as JSON.
 */
function formatAsJson(report: LegacyRemovalReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Format report as Markdown.
 */
function formatAsMarkdown(report: LegacyRemovalReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# Legacy User.tenantId Removal Report');
  lines.push('');
  lines.push(`**Generated:** ${report.metadata.generatedAt}`);
  lines.push(`**Analyzer Version:** ${report.metadata.analyzerVersion}`);
  lines.push(`**Correlation ID:** ${report.metadata.correlationId}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Code Paths | ${report.migrationStatus.totalPaths} |`);
  lines.push(`| Progress | ${report.migrationStatus.progressPercentage}% |`);
  lines.push(`| Complete | ${report.migrationStatus.isComplete ? 'Yes ✅' : 'No ❌'} |`);
  lines.push('');

  // Classification breakdown
  lines.push('### By Classification');
  lines.push('');
  lines.push('| Classification | Count |');
  lines.push('|----------------|-------|');
  for (const [key, value] of Object.entries(report.migrationStatus.byClassification)) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push('');

  // Status breakdown
  lines.push('### By Status');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');
  for (const [key, value] of Object.entries(report.migrationStatus.byStatus)) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push('');

  // Blocking issues
  if (report.migrationStatus.blockingIssues.length > 0) {
    lines.push('## ⚠️ Blocking Issues');
    lines.push('');
    for (const issue of report.migrationStatus.blockingIssues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (const rec of report.recommendations) {
      const emoji =
        rec.priority === 'critical'
          ? '🔴'
          : rec.priority === 'high'
            ? '🟠'
            : rec.priority === 'medium'
              ? '🟡'
              : '🟢';
      lines.push(`### ${emoji} ${rec.title}`);
      lines.push('');
      lines.push(rec.description);
      if (rec.estimatedEffort) {
        lines.push(`**Estimated Effort:** ${rec.estimatedEffort}`);
      }
      if (rec.affectedFiles.length > 0) {
        lines.push('**Affected Files:**');
        for (const file of rec.affectedFiles.slice(0, 5)) {
          lines.push(`- \`${file}\``);
        }
        if (rec.affectedFiles.length > 5) {
          lines.push(`- ... and ${rec.affectedFiles.length - 5} more`);
        }
      }
      lines.push('');
    }
  }

  // Route validations
  if (report.routeValidations.length > 0) {
    lines.push('## Route Validation Results');
    lines.push('');
    lines.push('| Route | Status | Issues |');
    lines.push('|-------|--------|--------|');
    for (const validation of report.routeValidations.slice(0, 20)) {
      const statusEmoji =
        validation.validationStatus === 'valid'
          ? '✅'
          : validation.validationStatus === 'partial'
            ? '⚠️'
            : validation.validationStatus === 'legacy'
              ? '❌'
              : '❓';
      lines.push(
        `| ${validation.routeId} | ${statusEmoji} ${validation.validationStatus} | ${validation.issues.length} |`,
      );
    }
    if (report.routeValidations.length > 20) {
      lines.push(`| ... | ... | ... |`);
      lines.push(`*${report.routeValidations.length - 20} more routes not shown*`);
    }
    lines.push('');
  }

  // Files summary
  if (report.filesSummary.length > 0) {
    lines.push('## Files Summary');
    lines.push('');
    lines.push('| File | Usages | Auth-Critical | Status |');
    lines.push('|------|--------|---------------|--------|');
    for (const file of report.filesSummary.slice(0, 15)) {
      const shortPath = file.filePath.split(/[/\\]/).slice(-3).join('/');
      lines.push(
        `| ${shortPath} | ${file.totalUsages} | ${file.authorizationCritical} | ${file.migrationStatus} |`,
      );
    }
    if (report.filesSummary.length > 15) {
      lines.push(`*${report.filesSummary.length - 15} more files not shown*`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format report as HTML.
 */
function formatAsHtml(report: LegacyRemovalReport): string {
  const progressColor =
    report.migrationStatus.progressPercentage >= 90
      ? '#22c55e'
      : report.migrationStatus.progressPercentage >= 50
        ? '#eab308'
        : '#ef4444';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Legacy Removal Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.6; }
    h1, h2 { color: #1e293b; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #e2e8f0; padding: 0.5rem; text-align: left; }
    th { background: #f1f5f9; }
    .progress { width: 200px; height: 20px; background: #e2e8f0; border-radius: 10px; }
    .progress-bar { height: 100%; border-radius: 10px; background: ${progressColor}; }
    .status-valid { color: #22c55e; }
    .status-partial { color: #eab308; }
    .status-legacy { color: #ef4444; }
    .priority-critical { color: #ef4444; font-weight: bold; }
    .priority-high { color: #f97316; }
    .priority-medium { color: #eab308; }
    .priority-low { color: #22c55e; }
    .card { background: #f8fafc; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
  </style>
</head>
<body>
  <h1>Legacy User.tenantId Removal Report</h1>
  <p><strong>Generated:</strong> ${report.metadata.generatedAt}</p>
  <p><strong>Version:</strong> ${report.metadata.analyzerVersion}</p>
  
  <div class="card">
    <h2>Migration Progress</h2>
    <div class="progress">
      <div class="progress-bar" style="width: ${report.migrationStatus.progressPercentage}%"></div>
    </div>
    <p>${report.migrationStatus.progressPercentage}% Complete (${report.migrationStatus.byStatus['migrated'] ?? 0} of ${report.migrationStatus.totalPaths} paths)</p>
    <p><strong>Status:</strong> ${report.migrationStatus.isComplete ? '✅ Complete' : '⏳ In Progress'}</p>
  </div>

  ${
    report.migrationStatus.blockingIssues.length > 0
      ? `
  <div class="card" style="background: #fef2f2;">
    <h2>⚠️ Blocking Issues</h2>
    <ul>
      ${report.migrationStatus.blockingIssues.map((i) => `<li>${i}</li>`).join('')}
    </ul>
  </div>
  `
      : ''
  }

  <h2>Classification Breakdown</h2>
  <table>
    <tr><th>Classification</th><th>Count</th></tr>
    ${Object.entries(report.migrationStatus.byClassification)
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('')}
  </table>

  <h2>Status Breakdown</h2>
  <table>
    <tr><th>Status</th><th>Count</th></tr>
    ${Object.entries(report.migrationStatus.byStatus)
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('')}
  </table>

  ${
    report.recommendations.length > 0
      ? `
  <h2>Recommendations</h2>
  ${report.recommendations
    .map(
      (r) => `
    <div class="card">
      <h3 class="priority-${r.priority}">${r.title}</h3>
      <p>${r.description}</p>
      ${r.estimatedEffort ? `<p><strong>Effort:</strong> ${r.estimatedEffort}</p>` : ''}
    </div>
  `,
    )
    .join('')}
  `
      : ''
  }
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Legacy Removal Report Generator Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Legacy Removal Report Generator.
 *
 * @param deps - Dependencies for the generator
 * @returns Legacy Removal Report Generator implementation
 *
 * @example
 * ```typescript
 * const generator = LegacyRemovalReportGeneratorImpl({
 *   codePathAnalyzer,
 *   authPathValidator,
 *   migrationStatusTracker,
 * });
 *
 * const report = await generator.generateReport();
 * const markdown = generator.exportReport(report, 'markdown');
 * ```
 */
export const LegacyRemovalReportGeneratorImpl = (
  deps: LegacyRemovalReportGeneratorDependencies,
): ILegacyRemovalReportGenerator => {
  const { codePathAnalyzer, authPathValidator, migrationStatusTracker } = deps;

  return {
    async generateReport(
      options?: Partial<ReportOptions>,
    ): Promise<LegacyRemovalReport> {
      const mergedOptions: ReportOptions = {
        ...DEFAULT_REPORT_OPTIONS,
        ...options,
      };

      const correlationId = mergedOptions.correlationId ?? randomUUID();

      // Collect data
      const codePaths = await codePathAnalyzer.analyzeCodePaths();
      const routeValidations = await authPathValidator.validateAllRoutes();
      const migrationStatus = migrationStatusTracker.getStatus();

      // Generate metadata
      const metadata: ReportMetadata = {
        generatedAt: new Date().toISOString(),
        correlationId,
        analyzerVersion: LEGACY_REMOVAL_SERVICE_VERSION,
        scanScope: ['src'],
        excludedPatterns: ['node_modules', 'dist', '.next'],
      };

      // Generate file summaries
      const filesSummary = mergedOptions.includeFileSummaries
        ? generateFileSummaries(codePaths)
        : [];

      // Generate recommendations
      const recommendations = mergedOptions.includeRecommendations
        ? generateRecommendations(migrationStatus, codePaths, routeValidations)
        : [];

      // Identify external integrations
      const externalIntegrations = identifyExternalIntegrations(codePaths);

      return {
        metadata,
        migrationStatus,
        codePaths: mergedOptions.includeCodeSnippets
          ? codePaths
          : codePaths.map((p) => ({ ...p, codeSnippet: '[redacted]' })),
        routeValidations,
        filesSummary,
        recommendations,
        externalIntegrations,
      };
    },

    async generateSummary(): Promise<MigrationStatus> {
      return migrationStatusTracker.getStatus();
    },

    exportReport(report: LegacyRemovalReport, format: ReportFormat): string {
      switch (format) {
        case 'json':
          return formatAsJson(report);
        case 'markdown':
          return formatAsMarkdown(report);
        case 'html':
          return formatAsHtml(report);
        default:
          return formatAsJson(report);
      }
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type LegacyRemovalReportGenerator = ILegacyRemovalReportGenerator;
