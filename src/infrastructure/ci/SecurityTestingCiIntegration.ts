/**
 * Security Testing CI/CD Integration Module.
 *
 * This module provides integration hooks for running security tests in CI/CD pipelines.
 * It includes:
 * - GitHub Actions integration
 * - GitLab CI integration
 * - Jenkins integration hooks
 * - CircleCI integration
 * - Generic CI runner interface
 *
 * CI Features:
 * - Automated security test execution
 * - Security gate enforcement (block on critical/high findings)
 * - Report generation (JSON, JUnit XML, SARIF)
 * - Vulnerability scan result aggregation
 * - Slack/Teams notification hooks
 *
 * @see FASE 1.21 Task 76: Security Testing Suite (Req 37)
 * @see SecurityTestingSuite for test implementation
 */

import type {
  SecurityTestSuiteReport,
  SecurityTestingConfig,
  RiskLevel,
  SecurityTestResult,
  SecurityTestCategory,
  SecurityTestStatus,
  VulnerabilityScanResult,
} from '@core/domains/authorization/services/SecurityTestingSuite';

// ---------------------------------------------------------------------------
// CI Integration Types
// ---------------------------------------------------------------------------

/**
 * Supported CI platforms.
 */
export enum CiPlatform {
  GITHUB_ACTIONS = 'GITHUB_ACTIONS',
  GITLAB_CI = 'GITLAB_CI',
  JENKINS = 'JENKINS',
  CIRCLE_CI = 'CIRCLE_CI',
  AZURE_DEVOPS = 'AZURE_DEVOPS',
  BITBUCKET = 'BITBUCKET',
  GENERIC = 'GENERIC',
}

/**
 * CI execution status.
 */
export enum CiExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMED_OUT = 'TIMED_OUT',
}

/**
 * Report format types.
 */
export enum ReportFormat {
  JSON = 'JSON',
  JUNIT_XML = 'JUNIT_XML',
  SARIF = 'SARIF',
  HTML = 'HTML',
  MARKDOWN = 'MARKDOWN',
}

/**
 * Notification channel types.
 */
export enum NotificationChannel {
  SLACK = 'SLACK',
  TEAMS = 'TEAMS',
  EMAIL = 'EMAIL',
  WEBHOOK = 'WEBHOOK',
  CONSOLE = 'CONSOLE',
}

/**
 * CI execution context from environment.
 */
export interface CiExecutionContext {
  /** CI platform detected */
  readonly platform: CiPlatform;
  /** Build/run ID */
  readonly buildId: string;
  /** Pipeline name */
  readonly pipelineName: string;
  /** Git branch */
  readonly branch: string;
  /** Git commit SHA */
  readonly commitSha: string;
  /** Pull/merge request number (if applicable) */
  readonly prNumber?: string;
  /** Repository URL */
  readonly repositoryUrl?: string;
  /** Triggered by */
  readonly triggeredBy: string;
  /** Environment variables available */
  readonly envVars: Readonly<Record<string, string | undefined>>;
}

/**
 * CI security gate configuration.
 */
export interface CiSecurityGateConfig {
  /** Whether to enforce security gate */
  readonly enforceGate: boolean;
  /** Risk levels that block the build */
  readonly blockingRiskLevels: readonly RiskLevel[];
  /** Maximum allowed vulnerabilities by risk level */
  readonly maxVulnerabilities: Partial<Record<RiskLevel, number>>;
  /** Require all regression tests to pass */
  readonly requireRegressionPass: boolean;
  /** Require all penetration tests to pass */
  readonly requirePenetrationPass: boolean;
  /** Allow override with explicit approval */
  readonly allowOverride: boolean;
  /** Override approval reviewers (GitHub usernames, etc.) */
  readonly overrideApprovers?: readonly string[];
}

/**
 * Report output configuration.
 */
export interface ReportOutputConfig {
  /** Formats to generate */
  readonly formats: readonly ReportFormat[];
  /** Output directory */
  readonly outputDir: string;
  /** Upload to artifact storage */
  readonly uploadArtifacts: boolean;
  /** Publish to security dashboard (if available) */
  readonly publishToDashboard: boolean;
  /** Include detailed findings */
  readonly includeDetailedFindings: boolean;
  /** Mask sensitive data */
  readonly maskSensitiveData: boolean;
}

/**
 * Notification configuration.
 */
export interface NotificationConfig {
  /** Channels to notify */
  readonly channels: readonly NotificationChannel[];
  /** Notify on success */
  readonly notifyOnSuccess: boolean;
  /** Notify on failure (always true if gate fails) */
  readonly notifyOnFailure: boolean;
  /** Slack webhook URL (if using Slack) */
  readonly slackWebhookUrl?: string;
  /** Teams webhook URL (if using Teams) */
  readonly teamsWebhookUrl?: string;
  /** Email recipients */
  readonly emailRecipients?: readonly string[];
  /** Custom webhook URL */
  readonly customWebhookUrl?: string;
}

/**
 * Full CI integration configuration.
 */
export interface CiIntegrationConfig {
  /** Security testing configuration */
  readonly testConfig: SecurityTestingConfig;
  /** Security gate configuration */
  readonly gateConfig: CiSecurityGateConfig;
  /** Report output configuration */
  readonly reportConfig: ReportOutputConfig;
  /** Notification configuration */
  readonly notificationConfig: NotificationConfig;
  /** Timeout in seconds */
  readonly timeoutSeconds: number;
  /** Retry failed tests */
  readonly retryFailedTests: boolean;
  /** Maximum retries */
  readonly maxRetries: number;
}

/**
 * CI execution result.
 */
export interface CiExecutionResult {
  /** Execution status */
  readonly status: CiExecutionStatus;
  /** Security gate passed */
  readonly gatePassed: boolean;
  /** Gate failure reasons (if failed) */
  readonly gateFailureReasons: readonly string[];
  /** Security test report */
  readonly report: SecurityTestSuiteReport;
  /** Generated report file paths */
  readonly reportFiles: readonly string[];
  /** Execution duration in seconds */
  readonly durationSeconds: number;
  /** Context information */
  readonly context: CiExecutionContext;
  /** Summary for display */
  readonly summary: CiExecutionSummary;
}

/**
 * Execution summary for CI display.
 */
export interface CiExecutionSummary {
  /** One-line status */
  readonly statusLine: string;
  /** Total tests */
  readonly totalTests: number;
  /** Passed tests */
  readonly passedTests: number;
  /** Failed tests */
  readonly failedTests: number;
  /** Blocked attacks */
  readonly blockedAttacks: number;
  /** Critical issues */
  readonly criticalIssues: number;
  /** High issues */
  readonly highIssues: number;
  /** Gate decision */
  readonly gateDecision: 'PASS' | 'FAIL' | 'WARN';
}

// ---------------------------------------------------------------------------
// CI Integration Interface
// ---------------------------------------------------------------------------

/**
 * Interface for CI/CD integration.
 */
export interface ISecurityTestingCiIntegration {
  /**
   * Detect CI platform from environment.
   */
  detectCiPlatform(): CiPlatform;

  /**
   * Get CI execution context from environment.
   */
  getCiContext(): CiExecutionContext;

  /**
   * Run security tests with CI integration.
   * @param config - CI integration configuration
   */
  runSecurityTests(config: CiIntegrationConfig): Promise<CiExecutionResult>;

  /**
   * Generate security gate annotation for CI.
   * @param result - Execution result
   */
  generateGateAnnotation(result: CiExecutionResult): string;

  /**
   * Generate CI-specific output (GitHub Actions annotations, GitLab CI reports, etc.).
   * @param result - Execution result
   */
  generateCiOutput(result: CiExecutionResult): Promise<void>;

  /**
   * Send notifications.
   * @param result - Execution result
   * @param config - Notification configuration
   */
  sendNotifications(
    result: CiExecutionResult,
    config: NotificationConfig,
  ): Promise<void>;

  /**
   * Get default configuration for CI platform.
   * @param platform - CI platform
   */
  getDefaultConfig(platform: CiPlatform): CiIntegrationConfig;

  /**
   * Generate report files.
   * @param report - Security test report
   * @param config - Report output configuration
   */
  generateReportFiles(
    report: SecurityTestSuiteReport,
    config: ReportOutputConfig,
  ): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Default Configurations
// ---------------------------------------------------------------------------

/**
 * Default security gate configuration.
 */
export const DEFAULT_SECURITY_GATE_CONFIG: CiSecurityGateConfig = {
  enforceGate: true,
  blockingRiskLevels: ['CRITICAL', 'HIGH'] as RiskLevel[],
  maxVulnerabilities: {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 10,
    LOW: 50,
    INFO: 999,
  } as Partial<Record<RiskLevel, number>>,
  requireRegressionPass: true,
  requirePenetrationPass: true,
  allowOverride: false,
} as const;

/**
 * Default report output configuration.
 */
export const DEFAULT_REPORT_OUTPUT_CONFIG: ReportOutputConfig = {
  formats: [ReportFormat.JSON, ReportFormat.SARIF, ReportFormat.JUNIT_XML],
  outputDir: './security-reports',
  uploadArtifacts: true,
  publishToDashboard: false,
  includeDetailedFindings: true,
  maskSensitiveData: true,
} as const;

/**
 * Default notification configuration.
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  channels: [NotificationChannel.CONSOLE],
  notifyOnSuccess: false,
  notifyOnFailure: true,
} as const;

/**
 * Default CI integration configuration.
 */
export const DEFAULT_CI_INTEGRATION_CONFIG: Omit<CiIntegrationConfig, 'testConfig'> = {
  gateConfig: DEFAULT_SECURITY_GATE_CONFIG,
  reportConfig: DEFAULT_REPORT_OUTPUT_CONFIG,
  notificationConfig: DEFAULT_NOTIFICATION_CONFIG,
  timeoutSeconds: 300, // 5 minutes
  retryFailedTests: false,
  maxRetries: 1,
} as const;

// ---------------------------------------------------------------------------
// CI Environment Detection
// ---------------------------------------------------------------------------

/**
 * Detect CI platform from environment variables.
 */
export function detectCiPlatformFromEnv(): CiPlatform {
  const env = process.env;

  // GitHub Actions
  if (env.GITHUB_ACTIONS === 'true') {
    return CiPlatform.GITHUB_ACTIONS;
  }

  // GitLab CI
  if (env.GITLAB_CI === 'true') {
    return CiPlatform.GITLAB_CI;
  }

  // Jenkins
  if (env.JENKINS_URL) {
    return CiPlatform.JENKINS;
  }

  // CircleCI
  if (env.CIRCLECI === 'true') {
    return CiPlatform.CIRCLE_CI;
  }

  // Azure DevOps
  if (env.TF_BUILD === 'True') {
    return CiPlatform.AZURE_DEVOPS;
  }

  // Bitbucket Pipelines
  if (env.BITBUCKET_BUILD_NUMBER) {
    return CiPlatform.BITBUCKET;
  }

  return CiPlatform.GENERIC;
}

/**
 * Get CI context from environment.
 */
export function getCiContextFromEnv(): CiExecutionContext {
  const env = process.env;
  const platform = detectCiPlatformFromEnv();

  let buildId = 'local';
  let pipelineName = 'unknown';
  let branch = 'unknown';
  let commitSha = 'unknown';
  let prNumber: string | undefined;
  let repositoryUrl: string | undefined;
  let triggeredBy = 'unknown';

  switch (platform) {
    case CiPlatform.GITHUB_ACTIONS:
      buildId = env.GITHUB_RUN_ID ?? buildId;
      pipelineName = env.GITHUB_WORKFLOW ?? pipelineName;
      branch = env.GITHUB_REF_NAME ?? env.GITHUB_HEAD_REF ?? branch;
      commitSha = env.GITHUB_SHA ?? commitSha;
      prNumber = env.GITHUB_EVENT_NAME === 'pull_request' ? env.GITHUB_REF?.split('/')[2] : undefined;
      repositoryUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
        : undefined;
      triggeredBy = env.GITHUB_ACTOR ?? triggeredBy;
      break;

    case CiPlatform.GITLAB_CI:
      buildId = env.CI_PIPELINE_ID ?? buildId;
      pipelineName = env.CI_PIPELINE_NAME ?? env.CI_PROJECT_NAME ?? pipelineName;
      branch = env.CI_COMMIT_REF_NAME ?? branch;
      commitSha = env.CI_COMMIT_SHA ?? commitSha;
      prNumber = env.CI_MERGE_REQUEST_IID;
      repositoryUrl = env.CI_PROJECT_URL;
      triggeredBy = env.GITLAB_USER_LOGIN ?? triggeredBy;
      break;

    case CiPlatform.JENKINS:
      buildId = env.BUILD_NUMBER ?? buildId;
      pipelineName = env.JOB_NAME ?? pipelineName;
      branch = env.GIT_BRANCH ?? env.BRANCH_NAME ?? branch;
      commitSha = env.GIT_COMMIT ?? commitSha;
      prNumber = env.CHANGE_ID;
      repositoryUrl = env.GIT_URL;
      triggeredBy = env.BUILD_USER ?? triggeredBy;
      break;

    case CiPlatform.CIRCLE_CI:
      buildId = env.CIRCLE_BUILD_NUM ?? buildId;
      pipelineName = env.CIRCLE_PROJECT_REPONAME ?? pipelineName;
      branch = env.CIRCLE_BRANCH ?? branch;
      commitSha = env.CIRCLE_SHA1 ?? commitSha;
      prNumber = env.CIRCLE_PULL_REQUEST?.split('/').pop();
      repositoryUrl = env.CIRCLE_REPOSITORY_URL;
      triggeredBy = env.CIRCLE_USERNAME ?? triggeredBy;
      break;

    case CiPlatform.AZURE_DEVOPS:
      buildId = env.BUILD_BUILDID ?? buildId;
      pipelineName = env.BUILD_DEFINITIONNAME ?? pipelineName;
      branch = env.BUILD_SOURCEBRANCHNAME ?? branch;
      commitSha = env.BUILD_SOURCEVERSION ?? commitSha;
      prNumber = env.SYSTEM_PULLREQUEST_PULLREQUESTID;
      repositoryUrl = env.BUILD_REPOSITORY_URI;
      triggeredBy = env.BUILD_REQUESTEDFOR ?? triggeredBy;
      break;

    case CiPlatform.BITBUCKET:
      buildId = env.BITBUCKET_BUILD_NUMBER ?? buildId;
      pipelineName = env.BITBUCKET_REPO_SLUG ?? pipelineName;
      branch = env.BITBUCKET_BRANCH ?? branch;
      commitSha = env.BITBUCKET_COMMIT ?? commitSha;
      prNumber = env.BITBUCKET_PR_ID;
      repositoryUrl = env.BITBUCKET_GIT_HTTP_ORIGIN;
      triggeredBy = 'bitbucket';
      break;

    default:
      // Generic/local - use git commands or defaults
      break;
  }

  return {
    platform,
    buildId,
    pipelineName,
    branch,
    commitSha,
    prNumber,
    repositoryUrl,
    triggeredBy,
    envVars: env as Record<string, string | undefined>,
  };
}

// ---------------------------------------------------------------------------
// Report Generation Utilities
// ---------------------------------------------------------------------------

/**
 * Generate JUnit XML report.
 */
export function generateJUnitXmlReport(report: SecurityTestSuiteReport): string {
  const testcases = report.results.map((r) => {
    const failure = r.status === SecurityTestStatus.FAILED
      ? `<failure message="${escapeXml(r.message)}" type="${r.riskLevel ?? 'MEDIUM'}"/>`
      : '';
    const skipped = r.status === SecurityTestStatus.SKIPPED ? '<skipped/>' : '';
    return `
    <testcase name="${escapeXml(r.testName)}" classname="${r.category}" time="${r.durationMs / 1000}">
      ${failure}${skipped}
    </testcase>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="SecurityTestingSuite" tests="${report.totalTests}" failures="${report.failedTests}" skipped="${report.skippedTests}" time="${report.totalDurationMs / 1000}">
  ${testcases}
</testsuite>`;
}

/**
 * Generate SARIF report for GitHub Security.
 */
export function generateSarifReport(report: SecurityTestSuiteReport): string {
  const rules = report.results.map((r) => ({
    id: r.testId,
    name: r.testName,
    shortDescription: { text: r.message.substring(0, 100) },
    defaultConfiguration: {
      level: mapRiskToSarifLevel(r.riskLevel),
    },
  }));

  const results = report.results
    .filter((r) => r.status === SecurityTestStatus.FAILED)
    .map((r) => ({
      ruleId: r.testId,
      level: mapRiskToSarifLevel(r.riskLevel),
      message: { text: r.message },
      locations: [{
        physicalLocation: {
          artifactLocation: {
            uri: 'security-tests',
            uriBaseId: 'ROOTPATH',
          },
        },
      }],
    }));

  const sarif = {
    version: '2.1.0',
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'SecurityTestingSuite',
          version: '1.0.0',
          informationUri: 'https://github.com/societ-rt/security-testing',
          rules,
        },
      },
      results,
    }],
  };

  return JSON.stringify(sarif, null, 2);
}

/**
 * Generate Markdown report.
 */
export function generateMarkdownReport(
  report: SecurityTestSuiteReport,
  context: CiExecutionContext,
): string {
  const statusEmoji = report.overallStatus === 'PASS' ? '✅' : report.overallStatus === 'FAIL' ? '❌' : '⚠️';

  let markdown = `# ${statusEmoji} Security Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Status** | ${report.overallStatus} |
| **Total Tests** | ${report.totalTests} |
| **Passed** | ${report.passedTests} |
| **Failed** | ${report.failedTests} |
| **Blocked Attacks** | ${report.blockedAttacks} |
| **Duration** | ${(report.totalDurationMs / 1000).toFixed(2)}s |

## CI Context

| Field | Value |
|-------|-------|
| Platform | ${context.platform} |
| Build ID | ${context.buildId} |
| Branch | ${context.branch} |
| Commit | \`${context.commitSha.substring(0, 8)}\` |
${context.prNumber ? `| PR | #${context.prNumber} |` : ''}

## Results by Category

`;

  for (const [category, stats] of Object.entries(report.summaryByCategory)) {
    markdown += `### ${category}\n\n`;
    markdown += `- Total: ${stats.total}\n`;
    markdown += `- Passed: ${stats.passed}\n`;
    markdown += `- Failed: ${stats.failed}\n\n`;
  }

  if (report.failedTests > 0) {
    markdown += `## Failed Tests\n\n`;
    const failedResults = report.results.filter((r) => r.status === SecurityTestStatus.FAILED);
    for (const result of failedResults) {
      markdown += `### ❌ ${result.testName}\n\n`;
      markdown += `- **ID**: ${result.testId}\n`;
      markdown += `- **Category**: ${result.category}\n`;
      markdown += `- **Risk Level**: ${result.riskLevel ?? 'N/A'}\n`;
      markdown += `- **Message**: ${result.message}\n`;
      if (result.remediation) {
        markdown += `- **Remediation**: ${result.remediation}\n`;
      }
      markdown += `\n`;
    }
  }

  markdown += `## CI Gate Decision\n\n`;
  markdown += report.ciGateResult.pass
    ? '✅ **PASS** - Security gate passed\n'
    : `❌ **FAIL** - ${report.ciGateResult.reason}\n`;

  return markdown;
}

/**
 * Generate HTML report.
 */
export function generateHtmlReport(
  report: SecurityTestSuiteReport,
  context: CiExecutionContext,
): string {
  const statusClass = report.overallStatus === 'PASS' ? 'pass' : report.overallStatus === 'FAIL' ? 'fail' : 'warn';

  const resultsHtml = report.results.map((r) => `
    <tr class="${r.status.toLowerCase()}">
      <td>${r.testId}</td>
      <td>${r.testName}</td>
      <td>${r.category}</td>
      <td><span class="status-badge ${r.status.toLowerCase()}">${r.status}</span></td>
      <td>${r.riskLevel ?? '-'}</td>
      <td>${r.durationMs}ms</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <title>Security Test Report - ${context.buildId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .metric { padding: 15px; border-radius: 8px; background: #f5f5f5; }
    .metric.pass { background: #e6ffe6; }
    .metric.fail { background: #ffe6e6; }
    .metric.warn { background: #fff3e6; }
    .metric h3 { margin: 0 0 5px 0; font-size: 14px; color: #666; }
    .metric .value { font-size: 24px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f8f8f8; }
    .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .status-badge.passed { background: #28a745; color: white; }
    .status-badge.blocked { background: #17a2b8; color: white; }
    .status-badge.failed { background: #dc3545; color: white; }
    .status-badge.skipped { background: #6c757d; color: white; }
    tr.failed { background: #fff5f5; }
    .gate-result { padding: 20px; margin-top: 20px; border-radius: 8px; }
    .gate-result.pass { background: #d4edda; border: 1px solid #c3e6cb; }
    .gate-result.fail { background: #f8d7da; border: 1px solid #f5c6cb; }
  </style>
</head>
<body>
  <h1>Security Test Report</h1>
  <p><strong>Build:</strong> ${context.buildId} | <strong>Branch:</strong> ${context.branch} | <strong>Commit:</strong> ${context.commitSha.substring(0, 8)}</p>
  
  <div class="summary">
    <div class="metric ${statusClass}">
      <h3>Status</h3>
      <div class="value">${report.overallStatus}</div>
    </div>
    <div class="metric">
      <h3>Total Tests</h3>
      <div class="value">${report.totalTests}</div>
    </div>
    <div class="metric pass">
      <h3>Passed</h3>
      <div class="value">${report.passedTests}</div>
    </div>
    <div class="metric fail">
      <h3>Failed</h3>
      <div class="value">${report.failedTests}</div>
    </div>
    <div class="metric">
      <h3>Blocked Attacks</h3>
      <div class="value">${report.blockedAttacks}</div>
    </div>
    <div class="metric">
      <h3>Duration</h3>
      <div class="value">${(report.totalDurationMs / 1000).toFixed(2)}s</div>
    </div>
  </div>

  <div class="gate-result ${report.ciGateResult.pass ? 'pass' : 'fail'}">
    <h3>Security Gate: ${report.ciGateResult.pass ? '✅ PASS' : '❌ FAIL'}</h3>
    <p>${report.ciGateResult.reason}</p>
  </div>

  <h2>Test Results</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Category</th>
        <th>Status</th>
        <th>Risk</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody>
      ${resultsHtml}
    </tbody>
  </table>

  <p style="margin-top: 30px; color: #666; font-size: 12px;">
    Generated at ${report.timestamp.toISOString()} by SecurityTestingSuite
  </p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function mapRiskToSarifLevel(risk?: RiskLevel): 'error' | 'warning' | 'note' {
  switch (risk) {
    case 'CRITICAL':
    case 'HIGH':
      return 'error';
    case 'MEDIUM':
      return 'warning';
    default:
      return 'note';
  }
}

// ---------------------------------------------------------------------------
// GitHub Actions Specific Functions
// ---------------------------------------------------------------------------

/**
 * Generate GitHub Actions annotation commands.
 */
export function generateGitHubActionsAnnotations(report: SecurityTestSuiteReport): string {
  const annotations: string[] = [];

  for (const result of report.results) {
    if (result.status === SecurityTestStatus.FAILED) {
      const level = result.riskLevel === 'CRITICAL' || result.riskLevel === 'HIGH' ? 'error' : 'warning';
      annotations.push(`::${level} title=${result.testName}::${result.message}`);
    }
  }

  // Summary annotation
  if (!report.ciGateResult.pass) {
    annotations.push(`::error title=Security Gate Failed::${report.ciGateResult.reason}`);
  }

  return annotations.join('\n');
}

/**
 * Generate GitHub Actions job summary.
 */
export function generateGitHubActionsSummary(
  report: SecurityTestSuiteReport,
  context: CiExecutionContext,
): string {
  return `## Security Test Results

| Status | Value |
|--------|-------|
| Overall | ${report.overallStatus === 'PASS' ? '✅' : '❌'} ${report.overallStatus} |
| Gate | ${report.ciGateResult.pass ? '✅ PASS' : '❌ FAIL'} |
| Tests | ${report.passedTests}/${report.totalTests} passed |
| Attacks Blocked | ${report.blockedAttacks} |
| Duration | ${(report.totalDurationMs / 1000).toFixed(1)}s |

${report.failedTests > 0 ? `### Failed Tests (${report.failedTests})
${report.results
      .filter((r) => r.status === SecurityTestStatus.FAILED)
      .map((r) => `- ❌ **${r.testName}**: ${r.message}`)
      .join('\n')}` : ''}
`;
}

// ---------------------------------------------------------------------------
// Export All
// ---------------------------------------------------------------------------

export type {
  SecurityTestSuiteReport,
  SecurityTestingConfig,
  SecurityTestResult,
  VulnerabilityScanResult,
};
