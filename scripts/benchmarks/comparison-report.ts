/**
 * Comparison Report Generator
 *
 * Generates markdown reports comparing current benchmark results with baseline,
 * showing legacy vs new authorization system performance.
 *
 * Features:
 * - Loads previous benchmark results (if exist)
 * - Compares current run with baseline
 * - Generates markdown report showing:
 *   - AuthContext resolution latency (old vs new)
 *   - Permission check latency
 *   - RLS query overhead
 *   - Pass/Fail status for each metric
 *
 * @see FASE 2.11 Task 21.5: Generate legacy vs. new comparison report
 * @see Requirement 12.6: Generate report comparing legacy vs. new authorization latency
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  BenchmarkSuiteResult,
  BenchmarkResult,
  PerformanceThresholds,
  LatencyStats,
} from './performance-benchmarks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input for comparison report generation
 */
export interface ComparisonReportInput {
  /** Current benchmark results */
  currentResults: BenchmarkSuiteResult;
  /** Path to baseline results (optional) */
  baselinePath?: string;
}

/**
 * Metric comparison data
 */
interface MetricComparison {
  name: string;
  current: number;
  baseline?: number;
  threshold: number;
  unit: string;
  passed: boolean;
  changePercent?: number;
  changeDirection?: 'improved' | 'degraded' | 'unchanged';
}

/**
 * Detailed benchmark comparison
 */
interface BenchmarkComparison {
  name: string;
  description: string;
  currentPassed: boolean;
  baselinePassed?: boolean;
  metrics: MetricComparison[];
  latencyComparison?: {
    current: LatencyStats;
    baseline?: LatencyStats;
  };
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Load baseline results from file
 */
function loadBaseline(baselinePath?: string): BenchmarkSuiteResult | null {
  if (!baselinePath) return null;

  try {
    const resolvedPath = path.resolve(baselinePath);
    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      return JSON.parse(content) as BenchmarkSuiteResult;
    }
  } catch (error) {
    console.warn(`Could not load baseline: ${error}`);
  }
  return null;
}

/**
 * Find a benchmark result by name
 */
function findBenchmark(
  results: BenchmarkResult[],
  name: string,
): BenchmarkResult | undefined {
  return results.find((r) => r.name === name);
}

/**
 * Calculate change percentage
 */
function calculateChangePercent(
  current: number,
  baseline: number,
): { percent: number; direction: 'improved' | 'degraded' | 'unchanged' } {
  if (baseline === 0) {
    return { percent: 0, direction: 'unchanged' };
  }

  const percent = ((current - baseline) / baseline) * 100;

  if (Math.abs(percent) < 1) {
    return { percent, direction: 'unchanged' };
  }

  // For latency, lower is better
  return {
    percent,
    direction: percent < 0 ? 'improved' : 'degraded',
  };
}

/**
 * Format a number with appropriate precision
 */
function formatNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

/**
 * Get status emoji
 */
function getStatusEmoji(passed: boolean): string {
  return passed ? '✅' : '❌';
}

/**
 * Get change direction emoji
 */
function getChangeEmoji(
  direction?: 'improved' | 'degraded' | 'unchanged',
): string {
  switch (direction) {
    case 'improved':
      return '📈';
    case 'degraded':
      return '📉';
    default:
      return '➡️';
  }
}

/**
 * Generate the markdown report header
 */
function generateHeader(
  currentResults: BenchmarkSuiteResult,
  hasBaseline: boolean,
): string {
  const status = currentResults.passed ? '✅ PASSED' : '❌ FAILED';
  const deploymentStatus = currentResults.passed
    ? '**Deployment: ALLOWED**'
    : '**Deployment: BLOCKED**';

  return `# Performance Benchmark Report

## Summary

| Metric | Value |
|--------|-------|
| **Status** | ${status} |
| ${deploymentStatus} | |
| **Total Benchmarks** | ${currentResults.totalBenchmarks} |
| **Passed** | ${currentResults.passedBenchmarks} |
| **Failed** | ${currentResults.failedBenchmarks} |
| **Duration** | ${(currentResults.durationMs / 1000).toFixed(2)}s |
| **Executed At** | ${new Date(currentResults.executedAt).toISOString()} |
| **Baseline Comparison** | ${hasBaseline ? 'Yes' : 'No baseline available'} |

### Environment

| Property | Value |
|----------|-------|
| Node.js | ${currentResults.environment.nodeVersion} |
| Platform | ${currentResults.environment.platform} |
| Architecture | ${currentResults.environment.arch} |
| Memory | ${currentResults.environment.memory} MB |
| CPUs | ${currentResults.environment.cpus} |

---

`;
}

/**
 * Generate performance thresholds section
 */
function generateThresholdsSection(thresholds: PerformanceThresholds): string {
  return `## Performance Thresholds

These are the **MANDATORY** thresholds that must be met for deployment:

| Metric | Target | Description |
|--------|--------|-------------|
| AuthContext Resolution p50 | < ${thresholds.authContextResolution.p50}ms | Median latency |
| AuthContext Resolution p95 | < ${thresholds.authContextResolution.p95}ms | 95th percentile |
| AuthContext Resolution p99 | < ${thresholds.authContextResolution.p99}ms | **Critical deployment gate** |
| Permission Check p99 | < ${thresholds.permissionCheck.p99}ms | getMissingPermissions() |
| RLS Query Overhead | < ${thresholds.rlsOverhead.maxPercentage}% | Compared to non-RLS baseline |

---

`;
}

/**
 * Generate legacy vs new comparison section
 */
function generateLegacyVsNewSection(
  currentResults: BenchmarkSuiteResult,
  baseline?: BenchmarkSuiteResult | null,
): string {
  const legacyVsNew = findBenchmark(
    currentResults.results,
    'Legacy vs New Authorization Comparison',
  );

  if (!legacyVsNew || !legacyVsNew.additionalMetrics) {
    return '';
  }

  const metrics = legacyVsNew.additionalMetrics;
  const status = getStatusEmoji(legacyVsNew.passed);

  let section = `## Legacy vs New Authorization Comparison

${status} **Status: ${legacyVsNew.passed ? 'PASSED' : 'FAILED'}**

This comparison shows the latency difference between the legacy \`resolveAuthContext()\` and the new \`AuthorizationContextResolver.resolve()\`.

### Latency Comparison

| Metric | Legacy (Old) | New | Difference | Status |
|--------|--------------|-----|------------|--------|
| **p50** | ${formatNumber(metrics.legacy_p50_ms)}ms | ${formatNumber(metrics.new_p50_ms)}ms | ${formatNumber(metrics.new_p50_ms - metrics.legacy_p50_ms)}ms | ${metrics.new_p50_ms < currentResults.thresholds.authContextResolution.p50 ? '✅' : '❌'} |
| **p95** | ${formatNumber(metrics.legacy_p95_ms)}ms | ${formatNumber(metrics.new_p95_ms)}ms | ${formatNumber(metrics.new_p95_ms - metrics.legacy_p95_ms)}ms | ${metrics.new_p95_ms < currentResults.thresholds.authContextResolution.p95 ? '✅' : '❌'} |
| **p99** | ${formatNumber(metrics.legacy_p99_ms)}ms | ${formatNumber(metrics.new_p99_ms)}ms | ${formatNumber(metrics.new_p99_ms - metrics.legacy_p99_ms)}ms | ${metrics.new_p99_ms < currentResults.thresholds.authContextResolution.p99 ? '✅' : '❌'} |
| **Mean** | ${formatNumber(metrics.legacy_mean_ms)}ms | ${formatNumber(metrics.new_mean_ms)}ms | ${formatNumber(metrics.new_mean_ms - metrics.legacy_mean_ms)}ms | - |

### Overhead Analysis

| Metric | Value |
|--------|-------|
| **Overhead Percentage** | ${formatNumber(metrics.overhead_percentage)}% |
| **Acceptable** | ${metrics.overhead_percentage < 50 ? 'Yes' : 'No (consider optimization)'} |

`;

  // Add baseline comparison if available
  if (baseline) {
    const baselineLegacyVsNew = findBenchmark(
      baseline.results,
      'Legacy vs New Authorization Comparison',
    );
    if (baselineLegacyVsNew?.additionalMetrics) {
      const baselineMetrics = baselineLegacyVsNew.additionalMetrics;
      const p99Change = calculateChangePercent(
        metrics.new_p99_ms,
        baselineMetrics.new_p99_ms,
      );

      section += `
### Comparison with Previous Run

| Metric | Previous p99 | Current p99 | Change |
|--------|--------------|-------------|--------|
| **New Auth** | ${formatNumber(baselineMetrics.new_p99_ms)}ms | ${formatNumber(metrics.new_p99_ms)}ms | ${getChangeEmoji(p99Change.direction)} ${formatNumber(p99Change.percent)}% |

`;
    }
  }

  section += `---

`;

  return section;
}

/**
 * Generate individual benchmark results section
 */
function generateBenchmarkResultsSection(
  currentResults: BenchmarkSuiteResult,
  baseline?: BenchmarkSuiteResult | null,
): string {
  let section = `## Detailed Benchmark Results

`;

  for (const result of currentResults.results) {
    const status = getStatusEmoji(result.passed);
    const baselineResult = baseline
      ? findBenchmark(baseline.results, result.name)
      : undefined;

    section += `### ${result.name}

${status} **Status: ${result.passed ? 'PASSED' : 'FAILED'}**

${result.description}

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **${result.thresholdTarget}** | ${formatNumber(result.actualValue)}${result.thresholdTarget === 'overhead_percentage' ? '%' : 'ms'} | <${result.thresholdValue}${result.thresholdTarget === 'overhead_percentage' ? '%' : 'ms'} | ${status} |
| **% of Target** | ${formatNumber(result.percentageOfTarget)}% | - | ${result.percentageOfTarget < 100 ? '✅' : '⚠️'} |

#### Latency Statistics

| Statistic | Value |
|-----------|-------|
| Min | ${formatNumber(result.latencyStats.min)}ms |
| Max | ${formatNumber(result.latencyStats.max)}ms |
| Mean | ${formatNumber(result.latencyStats.mean)}ms |
| Median | ${formatNumber(result.latencyStats.median)}ms |
| p50 | ${formatNumber(result.latencyStats.p50)}ms |
| p75 | ${formatNumber(result.latencyStats.p75)}ms |
| p90 | ${formatNumber(result.latencyStats.p90)}ms |
| p95 | ${formatNumber(result.latencyStats.p95)}ms |
| p99 | ${formatNumber(result.latencyStats.p99)}ms |
| Std Dev | ${formatNumber(result.latencyStats.standardDeviation)}ms |
| Samples | ${result.latencyStats.samples} |

`;

    // Add baseline comparison if available
    if (baselineResult) {
      const p99Change = calculateChangePercent(
        result.latencyStats.p99,
        baselineResult.latencyStats.p99,
      );

      section += `#### Baseline Comparison

| Metric | Previous | Current | Change |
|--------|----------|---------|--------|
| p99 | ${formatNumber(baselineResult.latencyStats.p99)}ms | ${formatNumber(result.latencyStats.p99)}ms | ${getChangeEmoji(p99Change.direction)} ${formatNumber(p99Change.percent)}% |
| Mean | ${formatNumber(baselineResult.latencyStats.mean)}ms | ${formatNumber(result.latencyStats.mean)}ms | ${getChangeEmoji(calculateChangePercent(result.latencyStats.mean, baselineResult.latencyStats.mean).direction)} ${formatNumber(calculateChangePercent(result.latencyStats.mean, baselineResult.latencyStats.mean).percent)}% |

`;
    }

    // Add additional metrics if available
    if (result.additionalMetrics && Object.keys(result.additionalMetrics).length > 0) {
      section += `#### Additional Metrics

| Metric | Value |
|--------|-------|
`;
      for (const [key, value] of Object.entries(result.additionalMetrics)) {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        section += `| ${formattedKey} | ${formatNumber(value)} |\n`;
      }
      section += '\n';
    }

    section += `---

`;
  }

  return section;
}

/**
 * Generate RLS overhead section
 */
function generateRlsOverheadSection(
  currentResults: BenchmarkSuiteResult,
): string {
  const rlsOverhead = findBenchmark(currentResults.results, 'RLS Query Overhead');

  if (!rlsOverhead || !rlsOverhead.additionalMetrics) {
    return '';
  }

  const metrics = rlsOverhead.additionalMetrics;
  const status = getStatusEmoji(rlsOverhead.passed);

  return `## RLS Query Overhead Analysis

${status} **Status: ${rlsOverhead.passed ? 'PASSED' : 'FAILED'}**

Row-Level Security (RLS) adds a small overhead to database queries. This benchmark measures the impact.

### Query Latency Comparison

| Query Type | Mean Latency | Notes |
|------------|--------------|-------|
| **Non-RLS (Baseline)** | ${formatNumber(metrics.non_rls_mean_ms)}ms | Queries without RLS filtering |
| **With RLS** | ${formatNumber(metrics.rls_mean_ms)}ms | Queries with tenant isolation |
| **Overhead** | ${formatNumber(metrics.overhead_ms)}ms | Additional latency from RLS |

### Overhead Percentage

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **Overhead %** | ${formatNumber(rlsOverhead.actualValue)}% | <${rlsOverhead.thresholdValue}% | ${status} |

---

`;
}

/**
 * Generate CI integration section
 */
function generateCiSection(): string {
  return `## CI Integration

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| **0** | All benchmarks passed | Deployment ALLOWED |
| **1** | One or more benchmarks failed | Deployment BLOCKED |
| **2** | Error during execution | Investigation required |

### Usage in CI Pipeline

\`\`\`yaml
# Example GitHub Actions integration
benchmark:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    
    - name: Run benchmarks
      run: npm run benchmark
      
    - name: Upload results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: benchmark-results
        path: benchmark-results.json
\`\`\`

### JSON Output for CI Parsing

The benchmark results are saved as JSON with the following structure:

\`\`\`json
{
  "passed": boolean,
  "totalBenchmarks": number,
  "passedBenchmarks": number,
  "failedBenchmarks": number,
  "results": [
    {
      "name": string,
      "passed": boolean,
      "actualValue": number,
      "thresholdValue": number
    }
  ]
}
\`\`\`

---

`;
}

/**
 * Generate recommendations section
 */
function generateRecommendationsSection(
  currentResults: BenchmarkSuiteResult,
): string {
  const recommendations: string[] = [];

  // Check each benchmark
  for (const result of currentResults.results) {
    if (!result.passed) {
      recommendations.push(
        `- **${result.name}**: Current ${result.thresholdTarget} of ${formatNumber(result.actualValue)} exceeds target <${result.thresholdValue}. Consider optimizing this path.`,
      );
    } else if (result.percentageOfTarget > 80) {
      recommendations.push(
        `- **${result.name}**: Currently at ${formatNumber(result.percentageOfTarget)}% of threshold. Monitor for regression.`,
      );
    }
  }

  if (recommendations.length === 0) {
    return `## Recommendations

✅ All benchmarks are performing well within targets. No immediate action required.

---

`;
  }

  return `## Recommendations

The following areas require attention:

${recommendations.join('\n')}

---

`;
}

/**
 * Generate the footer
 */
function generateFooter(): string {
  return `## Report Metadata

- **Report Version**: 1.0.0
- **Generated At**: ${new Date().toISOString()}
- **Script**: \`scripts/benchmarks/comparison-report.ts\`

---

*This report was automatically generated by the performance benchmark suite.*
`;
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive comparison report in markdown format
 */
export async function generateComparisonReport(
  input: ComparisonReportInput,
): Promise<string> {
  const { currentResults, baselinePath } = input;
  const baseline = loadBaseline(baselinePath);

  const sections: string[] = [
    generateHeader(currentResults, !!baseline),
    generateThresholdsSection(currentResults.thresholds),
    generateLegacyVsNewSection(currentResults, baseline),
    generateRlsOverheadSection(currentResults),
    generateBenchmarkResultsSection(currentResults, baseline),
    generateRecommendationsSection(currentResults),
    generateCiSection(),
    generateFooter(),
  ];

  return sections.join('');
}

/**
 * Generate report and save to file
 */
export async function generateAndSaveReport(
  currentResultsPath: string,
  outputPath?: string,
  baselinePath?: string,
): Promise<void> {
  // Load current results
  const content = fs.readFileSync(currentResultsPath, 'utf-8');
  const currentResults = JSON.parse(content) as BenchmarkSuiteResult;

  // Generate report
  const report = await generateComparisonReport({
    currentResults,
    baselinePath,
  });

  // Save report
  const finalOutputPath =
    outputPath ?? currentResultsPath.replace('.json', '-report.md');
  fs.writeFileSync(finalOutputPath, report);

  console.log(`Comparison report saved to: ${finalOutputPath}`);
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: npx tsx scripts/benchmarks/comparison-report.ts <results-path> [options]

Arguments:
  <results-path>       Path to benchmark results JSON file

Options:
  --output <path>      Output path for markdown report (default: <results-path>-report.md)
  --baseline <path>    Path to baseline results for comparison
  --help               Show this help message

Example:
  npx tsx scripts/benchmarks/comparison-report.ts ./benchmark-results.json --baseline ./baseline-results.json
    `);
    process.exit(0);
  }

  const resultsPath = args[0]!;
  let outputPath: string | undefined;
  let baselinePath: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--output':
        outputPath = args[++i];
        break;
      case '--baseline':
        baselinePath = args[++i];
        break;
    }
  }

  try {
    await generateAndSaveReport(resultsPath, outputPath, baselinePath);
  } catch (error) {
    console.error(
      'Error generating report:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
