#!/usr/bin/env npx tsx
/**
 * Shadow Mode Metrics Verification Script
 *
 * Validates shadow mode authorization metrics for production cutover readiness.
 * This script verifies that the 7-day shadow mode validation period has been completed
 * with 0% mismatch rate and sufficient sample size.
 *
 * **CRITICAL**: This validation MUST pass before production cutover is allowed.
 *
 * Usage:
 *   npx tsx scripts/validation/verify-shadow-mode-metrics.ts
 *
 * Exit codes:
 *   0 - All criteria met (ready for cutover)
 *   1 - Validation criteria not met (not ready for cutover)
 *   2 - Error during execution or missing data
 *
 * Environment:
 *   SHADOW_METRICS_SOURCE - Path to metrics file or "api" for metrics API (default: local file)
 *   METRICS_API_URL - URL for metrics API endpoint (if using API source)
 *   MIN_SAMPLE_SIZE - Minimum total requests required (default: 10,000)
 *   OBSERVATION_DAYS - Number of days to verify (default: 7)
 *
 * @see FASE 2.16 Task 27.5: Verify shadow mode 0% mismatch for 7 days
 * @see Requirement 16.6: Shadow mode mismatch rate at 0% for 7 consecutive days
 * @see Requirement 5.6: Minimum observation window of 7 days, sample size >= 10,000
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'verify-shadow-mode-metrics';

/**
 * Default minimum sample size for validation
 * @see Requirement 5.6
 */
const DEFAULT_MIN_SAMPLE_SIZE = 10_000;

/**
 * Default observation window in days
 * @see Requirement 16.6
 */
const DEFAULT_OBSERVATION_DAYS = 7;

/**
 * Maximum allowed mismatch rate (0% for production readiness)
 * @see Requirement 16.6
 */
const MAX_ALLOWED_MISMATCH_RATE = 0;

/**
 * Configuration for the verification script
 */
interface VerificationConfig {
  /** Source of metrics: 'file' or 'api' */
  metricsSource: 'file' | 'api';
  /** Path to metrics file (if using file source) */
  metricsFilePath: string;
  /** Metrics API URL (if using API source) */
  metricsApiUrl?: string;
  /** Minimum sample size required */
  minSampleSize: number;
  /** Number of observation days required */
  observationDays: number;
  /** Whether to output verbose logs */
  verbose: boolean;
}

/**
 * Parse configuration from environment variables
 */
function getConfig(): VerificationConfig {
  const metricsSource = process.env.SHADOW_METRICS_SOURCE === 'api' ? 'api' : 'file';
  const defaultMetricsPath = path.join(
    process.cwd(),
    '.kiro',
    'shadow-mode-metrics.json'
  );

  return {
    metricsSource,
    metricsFilePath: process.env.SHADOW_METRICS_FILE ?? defaultMetricsPath,
    metricsApiUrl: process.env.METRICS_API_URL,
    minSampleSize: parseInt(process.env.MIN_SAMPLE_SIZE ?? '', 10) || DEFAULT_MIN_SAMPLE_SIZE,
    observationDays: parseInt(process.env.OBSERVATION_DAYS ?? '', 10) || DEFAULT_OBSERVATION_DAYS,
    verbose: process.env.VERBOSE === 'true',
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Daily shadow mode metrics
 */
interface DailyMetrics {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Total requests processed on this day */
  totalRequests: number;
  /** Number of mismatches detected */
  mismatchCount: number;
  /** Mismatch rate percentage (mismatchCount / totalRequests * 100) */
  mismatchRate: number;
  /** Number of false positives (new allows when legacy denies) */
  falsePositives: number;
  /** Number of false negatives (new denies when legacy allows) */
  falseNegatives: number;
  /** Average latency impact in milliseconds */
  avgLatencyImpactMs: number;
  /** P95 latency impact in milliseconds */
  p95LatencyImpactMs: number;
  /** Timestamp when metrics were recorded */
  recordedAt: string;
}

/**
 * Aggregate shadow mode metrics
 */
interface ShadowModeMetrics {
  /** Version of the metrics schema */
  schemaVersion: string;
  /** When the metrics were last updated */
  lastUpdated: string;
  /** Environment (staging/production) */
  environment: string;
  /** Daily metrics array (sorted by date, most recent last) */
  dailyMetrics: DailyMetrics[];
  /** Aggregate totals */
  totals: {
    totalRequests: number;
    totalMismatches: number;
    totalFalsePositives: number;
    totalFalseNegatives: number;
    overallMismatchRate: number;
    avgLatencyImpactMs: number;
    p95LatencyImpactMs: number;
  };
}

/**
 * Verification result
 */
interface VerificationResult {
  /** Overall pass/fail status */
  passed: boolean;
  /** Individual criteria results */
  criteria: CriteriaResult[];
  /** Daily metrics summary */
  dailySummary: DailyMetricsSummary[];
  /** Aggregate statistics */
  aggregateStats: AggregateStats;
  /** Verification timestamp */
  verifiedAt: Date;
  /** Any warnings or recommendations */
  warnings: string[];
  /** Recommendations if not passed */
  recommendations: string[];
}

/**
 * Individual criteria result
 */
interface CriteriaResult {
  /** Criteria name */
  name: string;
  /** Whether criteria was met */
  passed: boolean;
  /** Required value */
  required: string;
  /** Actual value */
  actual: string;
  /** Description of the criteria */
  description: string;
}

/**
 * Summary of daily metrics for reporting
 */
interface DailyMetricsSummary {
  date: string;
  requests: number;
  mismatches: number;
  mismatchRate: string;
  falsePositives: number;
  falseNegatives: number;
  status: '✅ PASS' | '❌ FAIL';
}

/**
 * Aggregate statistics
 */
interface AggregateStats {
  totalDays: number;
  daysWithData: number;
  consecutiveDaysAt0Percent: number;
  totalRequests: number;
  totalMismatches: number;
  overallMismatchRate: number;
  avgLatencyImpactMs: number;
  p95LatencyImpactMs: number;
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

// ---------------------------------------------------------------------------
// Metrics Loading
// ---------------------------------------------------------------------------

/**
 * Load metrics from file
 */
async function loadMetricsFromFile(filePath: string): Promise<ShadowModeMetrics | null> {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const metrics = JSON.parse(content) as ShadowModeMetrics;

    // Validate schema
    if (!metrics.dailyMetrics || !Array.isArray(metrics.dailyMetrics)) {
      throw new Error('Invalid metrics file: missing dailyMetrics array');
    }

    return metrics;
  } catch (error) {
    throw new Error(
      `Failed to load metrics from file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load metrics from API endpoint
 */
async function loadMetricsFromApi(apiUrl: string): Promise<ShadowModeMetrics | null> {
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const metrics = await response.json() as ShadowModeMetrics;

    // Validate schema
    if (!metrics.dailyMetrics || !Array.isArray(metrics.dailyMetrics)) {
      throw new Error('Invalid API response: missing dailyMetrics array');
    }

    return metrics;
  } catch (error) {
    throw new Error(
      `Failed to load metrics from API: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load metrics based on configuration
 */
async function loadMetrics(config: VerificationConfig): Promise<ShadowModeMetrics | null> {
  if (config.metricsSource === 'api') {
    if (!config.metricsApiUrl) {
      throw new Error('METRICS_API_URL is required when using API source');
    }
    return loadMetricsFromApi(config.metricsApiUrl);
  }

  return loadMetricsFromFile(config.metricsFilePath);
}

// ---------------------------------------------------------------------------
// Validation Logic
// ---------------------------------------------------------------------------

/**
 * Get the last N days of metrics
 */
function getLastNDaysMetrics(
  metrics: ShadowModeMetrics,
  days: number
): DailyMetrics[] {
  // Sort by date descending and take the last N days
  const sorted = [...metrics.dailyMetrics].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return sorted.slice(0, days).reverse();
}

/**
 * Calculate aggregate statistics from daily metrics
 */
function calculateAggregateStats(
  dailyMetrics: DailyMetrics[],
  totalDaysRequired: number
): AggregateStats {
  const daysWithData = dailyMetrics.length;

  // Count consecutive days at 0% mismatch rate (from most recent)
  let consecutiveDaysAt0Percent = 0;
  const reversedMetrics = [...dailyMetrics].reverse();
  for (const day of reversedMetrics) {
    if (day.mismatchRate === 0) {
      consecutiveDaysAt0Percent++;
    } else {
      break;
    }
  }

  const totalRequests = dailyMetrics.reduce((sum, d) => sum + d.totalRequests, 0);
  const totalMismatches = dailyMetrics.reduce((sum, d) => sum + d.mismatchCount, 0);
  const overallMismatchRate = totalRequests > 0 ? (totalMismatches / totalRequests) * 100 : 0;

  const avgLatencyImpactMs =
    dailyMetrics.length > 0
      ? dailyMetrics.reduce((sum, d) => sum + d.avgLatencyImpactMs, 0) / dailyMetrics.length
      : 0;

  // P95 latency is the max of daily P95s (conservative estimate)
  const p95LatencyImpactMs = Math.max(...dailyMetrics.map(d => d.p95LatencyImpactMs), 0);

  return {
    totalDays: totalDaysRequired,
    daysWithData,
    consecutiveDaysAt0Percent,
    totalRequests,
    totalMismatches,
    overallMismatchRate,
    avgLatencyImpactMs,
    p95LatencyImpactMs,
  };
}

/**
 * Build verification criteria results
 */
function buildCriteriaResults(
  stats: AggregateStats,
  config: VerificationConfig
): CriteriaResult[] {
  const results: CriteriaResult[] = [];

  // Criterion 1: Observation window (7 consecutive days)
  results.push({
    name: 'Observation Window',
    passed: stats.consecutiveDaysAt0Percent >= config.observationDays,
    required: `${config.observationDays} consecutive days at 0% mismatch`,
    actual: `${stats.consecutiveDaysAt0Percent} consecutive days at 0%`,
    description: `Shadow mode must run for ${config.observationDays} consecutive days with 0% mismatch rate`,
  });

  // Criterion 2: Sample size
  results.push({
    name: 'Sample Size',
    passed: stats.totalRequests >= config.minSampleSize,
    required: `>= ${config.minSampleSize.toLocaleString()} requests`,
    actual: `${stats.totalRequests.toLocaleString()} requests`,
    description: `Minimum ${config.minSampleSize.toLocaleString()} requests must be processed during observation`,
  });

  // Criterion 3: Mismatch rate = 0%
  results.push({
    name: 'Mismatch Rate',
    passed: stats.overallMismatchRate === MAX_ALLOWED_MISMATCH_RATE,
    required: `${MAX_ALLOWED_MISMATCH_RATE}%`,
    actual: `${stats.overallMismatchRate.toFixed(4)}%`,
    description: 'Overall mismatch rate must be exactly 0% for production cutover',
  });

  // Criterion 4: No mismatches in the observation period
  results.push({
    name: 'Total Mismatches',
    passed: stats.totalMismatches === 0,
    required: '0 mismatches',
    actual: `${stats.totalMismatches} mismatches`,
    description: 'No authorization mismatches allowed during observation period',
  });

  // Criterion 5: Latency impact within threshold
  const latencyThreshold = 100; // ms
  results.push({
    name: 'Latency Impact',
    passed: stats.p95LatencyImpactMs <= latencyThreshold,
    required: `<= ${latencyThreshold}ms P95`,
    actual: `${stats.p95LatencyImpactMs.toFixed(2)}ms P95`,
    description: `Shadow mode latency impact must be within ${latencyThreshold}ms P95`,
  });

  return results;
}

/**
 * Build daily summary for reporting
 */
function buildDailySummary(dailyMetrics: DailyMetrics[]): DailyMetricsSummary[] {
  return dailyMetrics.map((day) => ({
    date: day.date,
    requests: day.totalRequests,
    mismatches: day.mismatchCount,
    mismatchRate: `${day.mismatchRate.toFixed(4)}%`,
    falsePositives: day.falsePositives,
    falseNegatives: day.falseNegatives,
    status: day.mismatchRate === 0 ? '✅ PASS' : '❌ FAIL',
  }));
}

/**
 * Generate recommendations for failures
 */
function generateRecommendations(
  stats: AggregateStats,
  config: VerificationConfig
): string[] {
  const recommendations: string[] = [];

  if (stats.consecutiveDaysAt0Percent < config.observationDays) {
    const remaining = config.observationDays - stats.consecutiveDaysAt0Percent;
    recommendations.push(
      `Continue shadow mode for ${remaining} more consecutive days at 0% mismatch rate`
    );
  }

  if (stats.totalRequests < config.minSampleSize) {
    const remaining = config.minSampleSize - stats.totalRequests;
    recommendations.push(
      `Process ${remaining.toLocaleString()} more requests to meet minimum sample size`
    );
  }

  if (stats.totalMismatches > 0) {
    recommendations.push('Investigate and fix authorization mismatches before cutover');
    recommendations.push('Review mismatch logs in observability system for root cause');
  }

  if (stats.p95LatencyImpactMs > 100) {
    recommendations.push(
      'Optimize shadow mode execution to reduce latency impact below 100ms P95'
    );
  }

  return recommendations;
}

/**
 * Generate warnings
 */
function generateWarnings(
  stats: AggregateStats,
  config: VerificationConfig
): string[] {
  const warnings: string[] = [];

  if (stats.daysWithData < config.observationDays) {
    warnings.push(
      `Only ${stats.daysWithData} days of data available (${config.observationDays} required)`
    );
  }

  if (stats.avgLatencyImpactMs > 50) {
    warnings.push(
      `Average latency impact is ${stats.avgLatencyImpactMs.toFixed(2)}ms - consider optimization`
    );
  }

  // Warn if sample size is just barely met
  const sampleMargin = 1.1; // 10% margin
  if (
    stats.totalRequests >= config.minSampleSize &&
    stats.totalRequests < config.minSampleSize * sampleMargin
  ) {
    warnings.push(
      'Sample size is close to minimum threshold - consider running longer for higher confidence'
    );
  }

  return warnings;
}

/**
 * Run the complete verification
 */
async function runVerification(config: VerificationConfig): Promise<VerificationResult> {
  // Load metrics
  const metrics = await loadMetrics(config);

  if (!metrics) {
    // No metrics available - create placeholder result
    return createPlaceholderResult(config);
  }

  // Get last N days of metrics
  const dailyMetrics = getLastNDaysMetrics(metrics, config.observationDays);

  // Calculate aggregate statistics
  const aggregateStats = calculateAggregateStats(dailyMetrics, config.observationDays);

  // Build criteria results
  const criteriaResults = buildCriteriaResults(aggregateStats, config);

  // Check if all criteria passed
  const allPassed = criteriaResults.every((c) => c.passed);

  // Build daily summary
  const dailySummary = buildDailySummary(dailyMetrics);

  // Generate recommendations and warnings
  const recommendations = allPassed ? [] : generateRecommendations(aggregateStats, config);
  const warnings = generateWarnings(aggregateStats, config);

  return {
    passed: allPassed,
    criteria: criteriaResults,
    dailySummary,
    aggregateStats,
    verifiedAt: new Date(),
    warnings,
    recommendations,
  };
}

/**
 * Create placeholder result for development/staging environments
 */
function createPlaceholderResult(config: VerificationConfig): VerificationResult {
  return {
    passed: false,
    criteria: [
      {
        name: 'Metrics Data Available',
        passed: false,
        required: 'Shadow mode metrics file or API',
        actual: 'No metrics data found',
        description: 'Shadow mode metrics must be collected before verification',
      },
    ],
    dailySummary: [],
    aggregateStats: {
      totalDays: config.observationDays,
      daysWithData: 0,
      consecutiveDaysAt0Percent: 0,
      totalRequests: 0,
      totalMismatches: 0,
      overallMismatchRate: 0,
      avgLatencyImpactMs: 0,
      p95LatencyImpactMs: 0,
    },
    verifiedAt: new Date(),
    warnings: [
      'No shadow mode metrics data available',
      'Shadow mode must be enabled and collecting metrics before production cutover',
    ],
    recommendations: [
      'Enable shadow mode authorization in staging environment',
      `Run shadow mode for at least ${config.observationDays} days`,
      `Process at least ${config.minSampleSize.toLocaleString()} requests`,
      'Ensure metrics are being recorded to the configured location',
      `Expected metrics file location: ${config.metricsFilePath}`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

/**
 * Format verification result as console output
 */
function formatResultForConsole(result: VerificationResult, config: VerificationConfig): string {
  const lines: string[] = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║     SHADOW MODE METRICS VERIFICATION                            ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    `Verification Time: ${result.verifiedAt.toISOString()}`,
    `Configuration:`,
    `  ├── Observation Days Required: ${config.observationDays}`,
    `  ├── Minimum Sample Size: ${config.minSampleSize.toLocaleString()}`,
    `  └── Maximum Mismatch Rate: ${MAX_ALLOWED_MISMATCH_RATE}%`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'AGGREGATE STATISTICS',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `  ├── Days with Data: ${result.aggregateStats.daysWithData}/${result.aggregateStats.totalDays}`,
    `  ├── Consecutive Days at 0%: ${result.aggregateStats.consecutiveDaysAt0Percent}`,
    `  ├── Total Requests: ${result.aggregateStats.totalRequests.toLocaleString()}`,
    `  ├── Total Mismatches: ${result.aggregateStats.totalMismatches}`,
    `  ├── Overall Mismatch Rate: ${result.aggregateStats.overallMismatchRate.toFixed(4)}%`,
    `  ├── Avg Latency Impact: ${result.aggregateStats.avgLatencyImpactMs.toFixed(2)}ms`,
    `  └── P95 Latency Impact: ${result.aggregateStats.p95LatencyImpactMs.toFixed(2)}ms`,
    '',
  ];

  // Daily summary table
  if (result.dailySummary.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('DAILY METRICS SUMMARY');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(
      '  Date       │ Requests  │ Mismatches │ Rate     │ FP  │ FN  │ Status'
    );
    lines.push('  ──────────────────────────────────────────────────────────────────');

    for (const day of result.dailySummary) {
      lines.push(
        `  ${day.date} │ ${day.requests.toString().padStart(9)} │ ${day.mismatches.toString().padStart(10)} │ ${day.mismatchRate.padStart(8)} │ ${day.falsePositives.toString().padStart(3)} │ ${day.falseNegatives.toString().padStart(3)} │ ${day.status}`
      );
    }
    lines.push('');
  }

  // Criteria results
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('VALIDATION CRITERIA');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const criterion of result.criteria) {
    const icon = criterion.passed ? '✅' : '❌';
    lines.push(`  ${icon} ${criterion.name}`);
    lines.push(`      Required: ${criterion.required}`);
    lines.push(`      Actual:   ${criterion.actual}`);
    lines.push('');
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('⚠️ WARNINGS');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const warning of result.warnings) {
      lines.push(`  ⚠️ ${warning}`);
    }
    lines.push('');
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('📋 RECOMMENDATIONS');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (let i = 0; i < result.recommendations.length; i++) {
      lines.push(`  ${i + 1}. ${result.recommendations[i]}`);
    }
    lines.push('');
  }

  // Final status
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (result.passed) {
    lines.push('✅ VERIFICATION PASSED — Ready for production cutover');
  } else {
    lines.push('❌ VERIFICATION FAILED — NOT ready for production cutover');
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format verification result as JSON
 */
function formatResultAsJson(result: VerificationResult): string {
  return JSON.stringify(result, null, 2);
}

// ---------------------------------------------------------------------------
// Sample Metrics File Generator
// ---------------------------------------------------------------------------

/**
 * Generate a sample metrics file for development/testing
 */
function generateSampleMetricsFile(outputPath: string): void {
  const today = new Date();
  const dailyMetrics: DailyMetrics[] = [];

  // Generate 7 days of sample data
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0] ?? '';

    // Sample data with 0 mismatches (ready for cutover)
    dailyMetrics.push({
      date: dateStr,
      totalRequests: 1500 + Math.floor(Math.random() * 500),
      mismatchCount: 0,
      mismatchRate: 0,
      falsePositives: 0,
      falseNegatives: 0,
      avgLatencyImpactMs: 10 + Math.random() * 10,
      p95LatencyImpactMs: 30 + Math.random() * 20,
      recordedAt: new Date(date.setHours(23, 59, 59, 999)).toISOString(),
    });
  }

  const totalRequests = dailyMetrics.reduce((sum, d) => sum + d.totalRequests, 0);
  const totalMismatches = dailyMetrics.reduce((sum, d) => sum + d.mismatchCount, 0);

  const sampleMetrics: ShadowModeMetrics = {
    schemaVersion: '1.0.0',
    lastUpdated: new Date().toISOString(),
    environment: 'staging',
    dailyMetrics,
    totals: {
      totalRequests,
      totalMismatches,
      totalFalsePositives: 0,
      totalFalseNegatives: 0,
      overallMismatchRate: 0,
      avgLatencyImpactMs: dailyMetrics.reduce((sum, d) => sum + d.avgLatencyImpactMs, 0) / dailyMetrics.length,
      p95LatencyImpactMs: Math.max(...dailyMetrics.map(d => d.p95LatencyImpactMs)),
    },
  };

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(sampleMetrics, null, 2));
  log(`Sample metrics file generated at: ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  log('Starting shadow mode metrics verification...');
  log('');

  const config = getConfig();

  logVerbose(`Configuration:`, config.verbose);
  logVerbose(`  Metrics Source: ${config.metricsSource}`, config.verbose);
  logVerbose(`  Metrics File: ${config.metricsFilePath}`, config.verbose);
  logVerbose(`  Min Sample Size: ${config.minSampleSize}`, config.verbose);
  logVerbose(`  Observation Days: ${config.observationDays}`, config.verbose);

  try {
    // Check for --generate-sample flag
    if (process.argv.includes('--generate-sample')) {
      generateSampleMetricsFile(config.metricsFilePath);
      log('');
      log('Sample metrics file generated. Run without --generate-sample to verify.');
      process.exit(0);
    }

    // Run verification
    const result = await runVerification(config);

    // Output results
    console.log(formatResultForConsole(result, config));

    // Output JSON if requested
    if (process.argv.includes('--json')) {
      console.log('\nJSON Output:');
      console.log(formatResultAsJson(result));
    }

    const endTime = Date.now();
    log(`Verification completed in ${endTime - startTime}ms`);

    // Exit with appropriate code
    if (result.passed) {
      logSuccess('All criteria met — system is ready for production cutover');
      process.exit(0);
    } else {
      logError('Criteria not met — system is NOT ready for production cutover');
      process.exit(1);
    }
  } catch (error) {
    logError(`Verification failed with error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

// Run if executed directly (not when imported as a module)
const isMainModule = process.argv[1]?.includes('verify-shadow-mode-metrics');
if (isMainModule) {
  main();
}
