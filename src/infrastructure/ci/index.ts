/**
 * CI/CD Integration module exports.
 *
 * @see FASE 1.21 Task 76: Security Testing Suite
 */

// Security Testing CI Integration
export {
  CiPlatform,
  CiExecutionStatus,
  ReportFormat,
  NotificationChannel,
  DEFAULT_SECURITY_GATE_CONFIG,
  DEFAULT_REPORT_OUTPUT_CONFIG,
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_CI_INTEGRATION_CONFIG,
  detectCiPlatformFromEnv,
  getCiContextFromEnv,
  generateJUnitXmlReport,
  generateSarifReport,
  generateMarkdownReport,
  generateHtmlReport,
  generateGitHubActionsAnnotations,
  generateGitHubActionsSummary,
} from './SecurityTestingCiIntegration';

export type {
  ISecurityTestingCiIntegration,
  CiExecutionContext,
  CiSecurityGateConfig,
  ReportOutputConfig,
  NotificationConfig,
  CiIntegrationConfig,
  CiExecutionResult,
  CiExecutionSummary,
} from './SecurityTestingCiIntegration';
