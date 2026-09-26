# Performance Benchmarks — Multi-Tenant Authorization System

This directory contains performance benchmarks for validating the multi-tenant authorization system meets its SLA requirements.

## Overview

The benchmarks measure three critical authorization operations:

| Metric | Target | Requirement |
|--------|--------|-------------|
| AuthorizationContext resolution (p99) | < 100ms | Requirement D4, 12.1 |
| AuthorizationContext resolution (p95) | < 70ms | Requirement 12.1 |
| AuthorizationContext resolution (p50) | < 30ms | Requirement 12.1 |
| Permission check (p99) | < 10ms | Requirement 12.2 |
| RLS query overhead | < 20% | Requirement 12.3 |

## Quick Start

```bash
# Run with default settings (1000 iterations)
npx tsx scripts/benchmarks/performance-benchmarks.ts

# Run with more iterations for production validation
npx tsx scripts/benchmarks/performance-benchmarks.ts --iterations 10000 --warmup 1000

# CI mode (exit code 1 if benchmarks fail)
npx tsx scripts/benchmarks/performance-benchmarks.ts --ci

# Concurrent load test
npx tsx scripts/benchmarks/performance-benchmarks.ts --concurrent --concurrency 100
```

## Files

| File | Description |
|------|-------------|
| `benchmark-utils.ts` | Statistical utilities, benchmark runner, timer utilities |
| `performance-benchmarks.ts` | Main benchmark entry point |
| `README.md` | This documentation |

## CLI Options

```
Options:
  --iterations <n>     Number of benchmark iterations (default: 1000)
  --warmup <n>         Number of warmup iterations (default: 100)
  --concurrent         Run benchmarks concurrently (default: sequential)
  --concurrency <n>    Max concurrent operations (default: 100)
  --output <file>      Output file for JSON results (default: benchmark-results.json)
  --verbose            Enable verbose output
  --skip-rls           Skip RLS overhead benchmark (requires database)
  --ci                 CI mode - fail with exit code 1 if benchmarks fail
  --help               Show help message
```

## Benchmarks

### 1. AuthorizationContextResolver.resolve()

**What it measures:**
- Full authorization context resolution from JWT claims
- Includes JWT validation, membership resolution, and permission lookup

**Target thresholds:**
- p50: < 30ms
- p95: < 70ms
- p99: < 100ms

**Components involved:**
- `AuthorizationContextResolver.resolve()`
- `MembershipResolutionService.resolve()`
- `PermissionRegistry.getPermissionsForRole()`

### 2. PermissionRegistry.getMissingPermissions()

**What it measures:**
- Time to check if a role has required permissions
- Tests various role/permission combinations

**Target thresholds:**
- p99: < 10ms

**Notes:**
- This is a synchronous operation using Set lookups
- Should be extremely fast (sub-millisecond) in practice

### 3. RLS Query Overhead

**What it measures:**
- Overhead introduced by Row-Level Security policies
- Compares query latency with and without RLS

**Target thresholds:**
- Overhead: < 20% increase

**Components involved:**
- `RlsPrismaMiddleware.executeWithRlsContext()`
- PostgreSQL RLS policies
- `SET LOCAL "app.current_tenant_id"`

### 4. Concurrent Authorization Load

**What it measures:**
- Authorization performance under concurrent load
- Simulates 100 concurrent requests (per Requirement 12.5)

**Target thresholds:**
- Same as AuthorizationContextResolver (p99 < 100ms)

## Output Format

### Console Output

```
╔══════════════════════════════════════════════════════════════════╗
║         Performance Benchmarks — Multi-Tenant Authorization       ║
╚══════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 AuthorizationContextResolver.resolve()
   Measures full authorization context resolution from JWT claims
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Latency Statistics:
  ├── Min:    5.123 ms
  ├── Max:    45.678 ms
  ├── Mean:   15.234 ms (σ = 8.123 ms)
  ├── p50:    14.567 ms
  ├── p75:    18.234 ms
  ├── p90:    23.456 ms
  ├── p95:    28.789 ms
  ├── p99:    42.345 ms
  └── p99.9:  45.123 ms

Throughput:
  ├── Samples: 1000
  ├── Total:   15234.56 ms
  └── Rate:    65.64 ops/sec

Threshold Checks:
  ✅ p50: 14.567 (threshold: 30)
  ✅ p95: 28.789 (threshold: 70)
  ✅ p99: 42.345 (threshold: 100)

Result: ✅ PASSED
```

### JSON Output

Results are written to `benchmark-results.json` (configurable via `--output`):

```json
{
  "title": "Multi-Tenant Authorization Performance Benchmarks",
  "generatedAt": "2024-01-15T10:30:00.000Z",
  "environment": {
    "nodeVersion": "v20.11.0",
    "platform": "win32",
    "arch": "x64",
    "cpus": 8,
    "memory": "16.00 GB"
  },
  "benchmarks": [
    {
      "config": {
        "name": "AuthorizationContextResolver.resolve()",
        "iterations": 1000,
        "warmupIterations": 100
      },
      "statistics": {
        "sampleCount": 1000,
        "min": 5.123,
        "max": 45.678,
        "mean": 15.234,
        "stdDev": 8.123,
        "p50": 14.567,
        "p95": 28.789,
        "p99": 42.345,
        "p999": 45.123,
        "opsPerSecond": 65.64
      },
      "passed": true,
      "thresholdResults": [
        { "metric": "p50", "threshold": 30, "actual": 14.567, "passed": true },
        { "metric": "p95", "threshold": 70, "actual": 28.789, "passed": true },
        { "metric": "p99", "threshold": 100, "actual": 42.345, "passed": true }
      ]
    }
  ],
  "rlsComparison": {
    "overheadPercentage": 15.5,
    "overheadAcceptable": true
  },
  "allPassed": true,
  "summary": "4/4 benchmarks passed. RLS overhead: 15.50% (acceptable)."
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Performance Benchmarks
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx tsx scripts/benchmarks/performance-benchmarks.ts --ci --iterations 5000
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: benchmark-results
          path: benchmark-results.json
```

### Deployment Blocker

Per Requirement 12.7, deployment should be blocked if benchmarks fail:

```bash
# In CI pipeline
npx tsx scripts/benchmarks/performance-benchmarks.ts --ci --iterations 5000
# Exit code 1 if any benchmark fails thresholds
```

## Interpreting Results

### ✅ All Passed

All metrics are within acceptable thresholds. Safe to proceed with deployment.

### ❌ p99 Exceeded

**AuthorizationContext p99 > 100ms:**
- Check for slow database queries in membership resolution
- Review connection pool settings
- Check for lock contention under load

**Permission check p99 > 10ms:**
- This should never happen with the current implementation
- Check for unexpected permission registry modifications
- Review for memory pressure issues

### ❌ RLS Overhead > 20%

**Potential causes:**
- Unoptimized RLS policies (missing indexes)
- Excessive SET LOCAL/RESET overhead
- Connection pool pressure from transactions

**Solutions:**
- Add indexes on `tenant_id` columns
- Review RLS policy complexity
- Consider connection pool tuning

## Development

### Running Individual Benchmarks

```typescript
import { runBenchmark, type BenchmarkConfig } from './benchmark-utils';

const config: BenchmarkConfig = {
  name: 'My Custom Benchmark',
  description: 'Tests something specific',
  warmupIterations: 50,
  iterations: 500,
  concurrent: false,
};

const result = await runBenchmark(config, async () => {
  // Your operation here
  await myOperation();
}, {
  p99Max: 50, // 50ms threshold
});

console.log(result.passed ? '✅ Passed' : '❌ Failed');
```

### Statistical Utilities

```typescript
import {
  calculatePercentile,
  calculateMean,
  calculateStdDev,
  calculateStatistics,
} from './benchmark-utils';

const samples = [10, 15, 20, 25, 30];

const p50 = calculatePercentile(samples, 50);  // 20
const p99 = calculatePercentile(samples, 99);  // ~30
const mean = calculateMean(samples);           // 20
const stdDev = calculateStdDev(samples);       // ~7.07

const stats = calculateStatistics(samples, 1000); // Full statistics
```

## References

- **Requirement 12**: Authorization Performance Benchmarks
- **Requirement D4**: Authorization resolution target < 100ms p99
- **FASE 2.11**: Tasks 21.1-21.6
- **Design Document**: Section on Performance Targets

## Troubleshooting

### "Module not found" Errors

The benchmarks can run in two modes:
1. **Integrated mode**: Uses actual authorization modules
2. **Standalone mode**: Uses mock implementations

For standalone testing without the full application:
```bash
npx tsx scripts/benchmarks/performance-benchmarks.ts
# Will show: "⚠️ Using mock implementation (actual modules not available)"
```

### High Variance in Results

- Increase warmup iterations: `--warmup 500`
- Run more iterations: `--iterations 5000`
- Avoid running on a loaded machine
- Close other applications

### Memory Issues

For large iteration counts:
- Reduce `--concurrency` value
- Run benchmarks sequentially (don't use `--concurrent`)
