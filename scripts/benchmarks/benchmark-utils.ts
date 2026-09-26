/**
 * Benchmark Utilities — Performance Testing Infrastructure
 *
 * Provides statistical utilities, benchmark runner, and timer utilities for
 * performance benchmarking of the multi-tenant authorization system.
 *
 * Performance Targets (from Design Doc):
 * - AuthorizationContext resolution: p50 < 30ms, p95 < 70ms, p99 < 100ms
 * - Permission check: p99 < 10ms
 * - RLS query overhead: < 20% increase vs baseline
 *
 * @see FASE 2.11 Tasks 21.1: Create performance test infrastructure
 * @see Requirement 12: Authorization Performance Benchmarks
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Statistical summary of benchmark results.
 */
export interface BenchmarkStatistics {
  /** Number of samples collected */
  sampleCount: number;
  /** Minimum latency in milliseconds */
  min: number;
  /** Maximum latency in milliseconds */
  max: number;
  /** Mean (average) latency in milliseconds */
  mean: number;
  /** Standard deviation in milliseconds */
  stdDev: number;
  /** 50th percentile (median) latency in milliseconds */
  p50: number;
  /** 75th percentile latency in milliseconds */
  p75: number;
  /** 90th percentile latency in milliseconds */
  p90: number;
  /** 95th percentile latency in milliseconds */
  p95: number;
  /** 99th percentile latency in milliseconds */
  p99: number;
  /** 99.9th percentile latency in milliseconds */
  p999: number;
  /** Total execution time in milliseconds */
  totalTimeMs: number;
  /** Operations per second */
  opsPerSecond: number;
}

/**
 * Configuration for a benchmark run.
 */
export interface BenchmarkConfig {
  /** Name of the benchmark */
  name: string;
  /** Description of what is being measured */
  description?: string;
  /** Number of warm-up iterations (excluded from results) */
  warmupIterations: number;
  /** Number of measured iterations */
  iterations: number;
  /** Whether to run iterations concurrently */
  concurrent?: boolean;
  /** Maximum concurrency level (default: 100) */
  maxConcurrency?: number;
  /** Timeout per iteration in milliseconds */
  timeoutMs?: number;
}

/**
 * Result of a single benchmark run.
 */
export interface BenchmarkResult {
  /** Benchmark configuration */
  config: BenchmarkConfig;
  /** Statistical summary */
  statistics: BenchmarkStatistics;
  /** Individual latency samples in milliseconds */
  samples: number[];
  /** Timestamp when benchmark started */
  startedAt: Date;
  /** Timestamp when benchmark completed */
  completedAt: Date;
  /** Any errors encountered during benchmark */
  errors: BenchmarkError[];
  /** Whether all target thresholds were met */
  passed: boolean;
  /** Details of threshold checks */
  thresholdResults?: ThresholdResult[];
}

/**
 * Performance thresholds to validate against.
 */
export interface PerformanceThresholds {
  /** Maximum allowed p50 latency in ms */
  p50Max?: number;
  /** Maximum allowed p95 latency in ms */
  p95Max?: number;
  /** Maximum allowed p99 latency in ms */
  p99Max?: number;
  /** Maximum allowed p999 latency in ms */
  p999Max?: number;
  /** Minimum required operations per second */
  minOpsPerSecond?: number;
  /** Maximum allowed mean latency in ms */
  meanMax?: number;
}

/**
 * Result of a threshold check.
 */
export interface ThresholdResult {
  metric: string;
  threshold: number;
  actual: number;
  passed: boolean;
}

/**
 * Error captured during benchmark execution.
 */
export interface BenchmarkError {
  iteration: number;
  error: string;
  timestamp: Date;
}

/**
 * RLS benchmark comparison result.
 */
export interface RlsComparisonResult {
  /** Benchmark without RLS */
  withoutRls: BenchmarkResult;
  /** Benchmark with RLS */
  withRls: BenchmarkResult;
  /** Overhead percentage ((withRls - withoutRls) / withoutRls * 100) */
  overheadPercentage: number;
  /** Whether overhead is within acceptable threshold (<20%) */
  overheadAcceptable: boolean;
}

/**
 * Comprehensive benchmark report.
 */
export interface BenchmarkReport {
  /** Report title */
  title: string;
  /** When the report was generated */
  generatedAt: Date;
  /** Environment information */
  environment: EnvironmentInfo;
  /** Individual benchmark results */
  benchmarks: BenchmarkResult[];
  /** RLS comparison results */
  rlsComparison?: RlsComparisonResult;
  /** Overall pass/fail status */
  allPassed: boolean;
  /** Summary of findings */
  summary: string;
}

/**
 * Environment information for the report.
 */
export interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpus: number;
  memory: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Statistical Utilities
// ---------------------------------------------------------------------------

/**
 * Calculate the percentile value from a sorted array of numbers.
 *
 * @param sortedValues - Array of numbers sorted in ascending order
 * @param percentile - Percentile to calculate (0-100)
 * @returns The value at the given percentile
 */
export function calculatePercentile(
  sortedValues: readonly number[],
  percentile: number,
): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  if (percentile <= 0) {
    return sortedValues[0];
  }

  if (percentile >= 100) {
    return sortedValues[sortedValues.length - 1];
  }

  // Linear interpolation for percentile
  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const fraction = index - lower;
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

/**
 * Calculate the mean (average) of an array of numbers.
 *
 * @param values - Array of numbers
 * @returns The mean value
 */
export function calculateMean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculate the standard deviation of an array of numbers.
 *
 * @param values - Array of numbers
 * @param mean - Pre-calculated mean (optional, will be calculated if not provided)
 * @returns The standard deviation
 */
export function calculateStdDev(
  values: readonly number[],
  mean?: number,
): number {
  if (values.length === 0) {
    return 0;
  }

  const actualMean = mean ?? calculateMean(values);
  const squaredDiffs = values.map(val => Math.pow(val - actualMean, 2));
  const avgSquaredDiff =
    squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length;

  return Math.sqrt(avgSquaredDiff);
}

/**
 * Calculate comprehensive statistics from latency samples.
 *
 * @param samples - Array of latency samples in milliseconds
 * @param totalTimeMs - Total execution time in milliseconds
 * @returns BenchmarkStatistics object
 */
export function calculateStatistics(
  samples: readonly number[],
  totalTimeMs: number,
): BenchmarkStatistics {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      min: 0,
      max: 0,
      mean: 0,
      stdDev: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      p999: 0,
      totalTimeMs,
      opsPerSecond: 0,
    };
  }

  // Sort samples for percentile calculations
  const sorted = [...samples].sort((a, b) => a - b);

  const mean = calculateMean(sorted);
  const stdDev = calculateStdDev(sorted, mean);

  return {
    sampleCount: samples.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    stdDev,
    p50: calculatePercentile(sorted, 50),
    p75: calculatePercentile(sorted, 75),
    p90: calculatePercentile(sorted, 90),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99),
    p999: calculatePercentile(sorted, 99.9),
    totalTimeMs,
    opsPerSecond:
      totalTimeMs > 0 ? (samples.length / totalTimeMs) * 1000 : 0,
  };
}

// ---------------------------------------------------------------------------
// Timer Utilities
// ---------------------------------------------------------------------------

/**
 * High-resolution timer for precise latency measurement.
 *
 * Uses process.hrtime.bigint() for nanosecond precision.
 */
export class HighResolutionTimer {
  private startTime: bigint | null = null;

  /**
   * Start the timer.
   */
  start(): void {
    this.startTime = process.hrtime.bigint();
  }

  /**
   * Stop the timer and return elapsed time in milliseconds.
   *
   * @returns Elapsed time in milliseconds (with sub-millisecond precision)
   */
  stop(): number {
    if (this.startTime === null) {
      throw new Error('Timer was not started');
    }

    const endTime = process.hrtime.bigint();
    const elapsedNs = endTime - this.startTime;
    this.startTime = null;

    // Convert nanoseconds to milliseconds
    return Number(elapsedNs) / 1_000_000;
  }

  /**
   * Reset the timer without stopping.
   */
  reset(): void {
    this.startTime = null;
  }
}

/**
 * Measure the execution time of an async function.
 *
 * @param fn - Async function to measure
 * @returns Object containing the result and elapsed time in milliseconds
 */
export async function measureAsync<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; elapsedMs: number }> {
  const timer = new HighResolutionTimer();
  timer.start();

  const result = await fn();
  const elapsedMs = timer.stop();

  return { result, elapsedMs };
}

/**
 * Measure the execution time of a sync function.
 *
 * @param fn - Sync function to measure
 * @returns Object containing the result and elapsed time in milliseconds
 */
export function measureSync<T>(fn: () => T): { result: T; elapsedMs: number } {
  const timer = new HighResolutionTimer();
  timer.start();

  const result = fn();
  const elapsedMs = timer.stop();

  return { result, elapsedMs };
}

// ---------------------------------------------------------------------------
// Benchmark Runner
// ---------------------------------------------------------------------------

/**
 * Run a benchmark with warm-up and measured iterations.
 *
 * @param config - Benchmark configuration
 * @param operation - Async operation to benchmark
 * @param thresholds - Optional performance thresholds to validate
 * @returns BenchmarkResult
 */
export async function runBenchmark(
  config: BenchmarkConfig,
  operation: () => Promise<void>,
  thresholds?: PerformanceThresholds,
): Promise<BenchmarkResult> {
  const startedAt = new Date();
  const samples: number[] = [];
  const errors: BenchmarkError[] = [];
  const maxConcurrency = config.maxConcurrency ?? 100;

  console.log(`\n📊 Starting benchmark: ${config.name}`);
  if (config.description) {
    console.log(`   ${config.description}`);
  }

  // Warm-up phase
  if (config.warmupIterations > 0) {
    console.log(`   Warming up (${config.warmupIterations} iterations)...`);
    for (let i = 0; i < config.warmupIterations; i++) {
      try {
        await operation();
      } catch {
        // Ignore warm-up errors
      }
    }
  }

  // Measurement phase
  console.log(`   Running ${config.iterations} iterations...`);
  const measurementStart = process.hrtime.bigint();

  if (config.concurrent) {
    // Run iterations concurrently with concurrency limit
    const batches = Math.ceil(config.iterations / maxConcurrency);

    for (let batch = 0; batch < batches; batch++) {
      const batchStart = batch * maxConcurrency;
      const batchEnd = Math.min(batchStart + maxConcurrency, config.iterations);
      const batchPromises: Promise<void>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const iterationPromise = (async () => {
          try {
            const { elapsedMs } = await measureAsync(operation);
            samples.push(elapsedMs);
          } catch (error) {
            errors.push({
              iteration: i,
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date(),
            });
          }
        })();

        batchPromises.push(iterationPromise);
      }

      await Promise.all(batchPromises);
    }
  } else {
    // Run iterations sequentially
    for (let i = 0; i < config.iterations; i++) {
      try {
        const { elapsedMs } = await measureAsync(operation);
        samples.push(elapsedMs);
      } catch (error) {
        errors.push({
          iteration: i,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        });
      }
    }
  }

  const measurementEnd = process.hrtime.bigint();
  const totalTimeMs = Number(measurementEnd - measurementStart) / 1_000_000;

  const statistics = calculateStatistics(samples, totalTimeMs);
  const completedAt = new Date();

  // Check thresholds
  const thresholdResults: ThresholdResult[] = [];
  let passed = true;

  if (thresholds) {
    if (thresholds.p50Max !== undefined) {
      const result = statistics.p50 <= thresholds.p50Max;
      passed = passed && result;
      thresholdResults.push({
        metric: 'p50',
        threshold: thresholds.p50Max,
        actual: statistics.p50,
        passed: result,
      });
    }

    if (thresholds.p95Max !== undefined) {
      const result = statistics.p95 <= thresholds.p95Max;
      passed = passed && result;
      thresholdResults.push({
        metric: 'p95',
        threshold: thresholds.p95Max,
        actual: statistics.p95,
        passed: result,
      });
    }

    if (thresholds.p99Max !== undefined) {
      const result = statistics.p99 <= thresholds.p99Max;
      passed = passed && result;
      thresholdResults.push({
        metric: 'p99',
        threshold: thresholds.p99Max,
        actual: statistics.p99,
        passed: result,
      });
    }

    if (thresholds.p999Max !== undefined) {
      const result = statistics.p999 <= thresholds.p999Max;
      passed = passed && result;
      thresholdResults.push({
        metric: 'p999',
        threshold: thresholds.p999Max,
        actual: statistics.p999,
        passed: result,
      });
    }

    if (thresholds.meanMax !== undefined) {
      const result = statistics.mean <= thresholds.meanMax;
      passed = passed && result;
      thresholdResults.push({
        metric: 'mean',
        threshold: thresholds.meanMax,
        actual: statistics.mean,
        passed: result,
      });
    }

    if (thresholds.minOpsPerSecond !== undefined) {
      const result = statistics.opsPerSecond >= thresholds.minOpsPerSecond;
      passed = passed && result;
      thresholdResults.push({
        metric: 'opsPerSecond',
        threshold: thresholds.minOpsPerSecond,
        actual: statistics.opsPerSecond,
        passed: result,
      });
    }
  }

  // Also check for errors
  if (errors.length > 0) {
    passed = false;
  }

  // Print summary
  console.log(
    `   ${passed ? '✅' : '❌'} Completed in ${totalTimeMs.toFixed(2)}ms`,
  );
  console.log(`   Stats: p50=${statistics.p50.toFixed(2)}ms, p95=${statistics.p95.toFixed(2)}ms, p99=${statistics.p99.toFixed(2)}ms`);
  
  if (errors.length > 0) {
    console.log(`   ⚠️ ${errors.length} errors occurred`);
  }

  return {
    config,
    statistics,
    samples,
    startedAt,
    completedAt,
    errors,
    passed,
    thresholdResults: thresholdResults.length > 0 ? thresholdResults : undefined,
  };
}

/**
 * Compare two benchmark results for RLS overhead calculation.
 *
 * @param withoutRls - Benchmark result without RLS
 * @param withRls - Benchmark result with RLS
 * @param maxOverheadPercentage - Maximum acceptable overhead (default: 20%)
 * @returns RlsComparisonResult
 */
export function compareRlsOverhead(
  withoutRls: BenchmarkResult,
  withRls: BenchmarkResult,
  maxOverheadPercentage = 20,
): RlsComparisonResult {
  const baselineP99 = withoutRls.statistics.p99;
  const rlsP99 = withRls.statistics.p99;

  const overheadPercentage =
    baselineP99 > 0 ? ((rlsP99 - baselineP99) / baselineP99) * 100 : 0;

  return {
    withoutRls,
    withRls,
    overheadPercentage,
    overheadAcceptable: overheadPercentage <= maxOverheadPercentage,
  };
}

// ---------------------------------------------------------------------------
// Environment Information
// ---------------------------------------------------------------------------

/**
 * Get current environment information for benchmark reports.
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  const os = require('os');

  const totalMemoryGb = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);

  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    memory: `${totalMemoryGb} GB`,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Format a benchmark result as human-readable text.
 *
 * @param result - BenchmarkResult to format
 * @returns Formatted string
 */
export function formatBenchmarkResult(result: BenchmarkResult): string {
  const { config, statistics, errors, passed, thresholdResults } = result;

  const lines: string[] = [
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📊 ${config.name}`,
    config.description ? `   ${config.description}` : '',
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Latency Statistics:`,
    `  ├── Min:    ${statistics.min.toFixed(3)} ms`,
    `  ├── Max:    ${statistics.max.toFixed(3)} ms`,
    `  ├── Mean:   ${statistics.mean.toFixed(3)} ms (σ = ${statistics.stdDev.toFixed(3)} ms)`,
    `  ├── p50:    ${statistics.p50.toFixed(3)} ms`,
    `  ├── p75:    ${statistics.p75.toFixed(3)} ms`,
    `  ├── p90:    ${statistics.p90.toFixed(3)} ms`,
    `  ├── p95:    ${statistics.p95.toFixed(3)} ms`,
    `  ├── p99:    ${statistics.p99.toFixed(3)} ms`,
    `  └── p99.9:  ${statistics.p999.toFixed(3)} ms`,
    ``,
    `Throughput:`,
    `  ├── Samples: ${statistics.sampleCount}`,
    `  ├── Total:   ${statistics.totalTimeMs.toFixed(2)} ms`,
    `  └── Rate:    ${statistics.opsPerSecond.toFixed(2)} ops/sec`,
  ];

  if (thresholdResults && thresholdResults.length > 0) {
    lines.push(``);
    lines.push(`Threshold Checks:`);
    for (const tr of thresholdResults) {
      const icon = tr.passed ? '✅' : '❌';
      lines.push(
        `  ${icon} ${tr.metric}: ${tr.actual.toFixed(3)} (threshold: ${tr.threshold})`,
      );
    }
  }

  if (errors.length > 0) {
    lines.push(``);
    lines.push(`Errors: ${errors.length}`);
    for (const err of errors.slice(0, 5)) {
      lines.push(`  - Iteration ${err.iteration}: ${err.error}`);
    }
    if (errors.length > 5) {
      lines.push(`  ... and ${errors.length - 5} more`);
    }
  }

  lines.push(``);
  lines.push(`Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push(``);

  return lines.filter(l => l !== '').join('\n');
}

/**
 * Format RLS comparison result as human-readable text.
 *
 * @param comparison - RlsComparisonResult to format
 * @returns Formatted string
 */
export function formatRlsComparison(comparison: RlsComparisonResult): string {
  const lines: string[] = [
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📈 RLS Overhead Comparison`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Without RLS (Baseline):`,
    `  ├── p50:  ${comparison.withoutRls.statistics.p50.toFixed(3)} ms`,
    `  ├── p95:  ${comparison.withoutRls.statistics.p95.toFixed(3)} ms`,
    `  └── p99:  ${comparison.withoutRls.statistics.p99.toFixed(3)} ms`,
    ``,
    `With RLS:`,
    `  ├── p50:  ${comparison.withRls.statistics.p50.toFixed(3)} ms`,
    `  ├── p95:  ${comparison.withRls.statistics.p95.toFixed(3)} ms`,
    `  └── p99:  ${comparison.withRls.statistics.p99.toFixed(3)} ms`,
    ``,
    `Overhead: ${comparison.overheadPercentage.toFixed(2)}% (threshold: 20%)`,
    `Result: ${comparison.overheadAcceptable ? '✅ ACCEPTABLE' : '❌ EXCEEDS THRESHOLD'}`,
    ``,
  ];

  return lines.join('\n');
}

/**
 * Generate a comprehensive benchmark report.
 *
 * @param title - Report title
 * @param benchmarks - Array of benchmark results
 * @param rlsComparison - Optional RLS comparison result
 * @returns BenchmarkReport
 */
export function generateReport(
  title: string,
  benchmarks: BenchmarkResult[],
  rlsComparison?: RlsComparisonResult,
): BenchmarkReport {
  const allPassed =
    benchmarks.every(b => b.passed) &&
    (rlsComparison?.overheadAcceptable ?? true);

  const passedCount = benchmarks.filter(b => b.passed).length;
  const failedCount = benchmarks.length - passedCount;

  let summary = `${passedCount}/${benchmarks.length} benchmarks passed.`;
  if (failedCount > 0) {
    const failedNames = benchmarks
      .filter(b => !b.passed)
      .map(b => b.config.name)
      .join(', ');
    summary += ` Failed: ${failedNames}.`;
  }
  if (rlsComparison) {
    summary += ` RLS overhead: ${rlsComparison.overheadPercentage.toFixed(2)}%`;
    summary += rlsComparison.overheadAcceptable
      ? ' (acceptable).'
      : ' (EXCEEDS THRESHOLD).';
  }

  return {
    title,
    generatedAt: new Date(),
    environment: getEnvironmentInfo(),
    benchmarks,
    rlsComparison,
    allPassed,
    summary,
  };
}

/**
 * Format a full benchmark report as JSON.
 *
 * @param report - BenchmarkReport to format
 * @returns JSON string
 */
export function formatReportAsJson(report: BenchmarkReport): string {
  // Create a serializable version of the report
  const serializableReport = {
    ...report,
    benchmarks: report.benchmarks.map(b => ({
      ...b,
      // Exclude raw samples to reduce size
      samples: undefined,
      sampleCount: b.samples.length,
    })),
  };

  return JSON.stringify(serializableReport, null, 2);
}

/**
 * Format a full benchmark report as human-readable text.
 *
 * @param report - BenchmarkReport to format
 * @returns Formatted string
 */
export function formatReportAsText(report: BenchmarkReport): string {
  const lines: string[] = [
    ``,
    `╔══════════════════════════════════════════════════════════════════╗`,
    `║  ${report.title.padEnd(62)}  ║`,
    `╚══════════════════════════════════════════════════════════════════╝`,
    ``,
    `Generated: ${report.generatedAt.toISOString()}`,
    `Environment:`,
    `  ├── Node: ${report.environment.nodeVersion}`,
    `  ├── Platform: ${report.environment.platform} (${report.environment.arch})`,
    `  ├── CPUs: ${report.environment.cpus}`,
    `  └── Memory: ${report.environment.memory}`,
  ];

  for (const benchmark of report.benchmarks) {
    lines.push(formatBenchmarkResult(benchmark));
  }

  if (report.rlsComparison) {
    lines.push(formatRlsComparison(report.rlsComparison));
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Overall Result: ${report.allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
  lines.push(`Summary: ${report.summary}`);
  lines.push(``);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  // Statistical utilities
  calculatePercentile,
  calculateMean,
  calculateStdDev,
  calculateStatistics,

  // Timer utilities
  HighResolutionTimer,
  measureAsync,
  measureSync,

  // Benchmark runner
  runBenchmark,
  compareRlsOverhead,

  // Environment info
  getEnvironmentInfo,

  // Report generation
  formatBenchmarkResult,
  formatRlsComparison,
  generateReport,
  formatReportAsJson,
  formatReportAsText,
};
