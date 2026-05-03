/**
 * Observability Infrastructure — Structured JSON logger middleware,
 * API latency tracking, slow request warnings, and queue depth monitoring.
 *
 * Security: MUST NOT log sensitive data (passwords, tokens, OTP, CVV, PII).
 *
 * @see Requirements 25.1, 25.2
 */

import { type Logger, type LogContext, createLogger } from './Logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestMetrics {
  readonly route: string;
  readonly method: string;
  readonly statusCode: number;
  readonly durationMs: number;
  readonly correlationId: string;
  readonly tenantId?: string;
  readonly userId?: string;
}

export interface LatencyPercentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

export interface QueueDepthSnapshot {
  readonly queueName: string;
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLOW_REQUEST_THRESHOLD_MS = 2000;

// ---------------------------------------------------------------------------
// Latency Tracker (in-memory placeholder)
// ---------------------------------------------------------------------------

const latencyBuffer: number[] = [];
const MAX_BUFFER_SIZE = 1000;

function recordLatency(durationMs: number): void {
  latencyBuffer.push(durationMs);
  if (latencyBuffer.length > MAX_BUFFER_SIZE) {
    latencyBuffer.shift();
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

/**
 * Compute p50, p95, p99 from the in-memory latency buffer.
 * This is a placeholder — production should use a proper metrics backend.
 */
export function getLatencyPercentiles(): LatencyPercentiles {
  const sorted = [...latencyBuffer].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// ---------------------------------------------------------------------------
// Queue Depth Monitor (placeholder)
// ---------------------------------------------------------------------------

/**
 * Placeholder for BullMQ queue depth monitoring.
 * In production, this would query BullMQ queue instances.
 */
export function getQueueDepthSnapshot(queueName: string): QueueDepthSnapshot {
  return {
    queueName,
    waiting: 0,
    active: 0,
    delayed: 0,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Request Logger Middleware Helper
// ---------------------------------------------------------------------------

const logger: Logger = createLogger();

/**
 * Log a completed request with structured fields.
 * Emits a warning if the request exceeded the slow threshold.
 */
export function logRequestMetrics(metrics: RequestMetrics): void {
  const context: LogContext = {
    correlation_id: metrics.correlationId,
    tenant_id: metrics.tenantId,
    user_id: metrics.userId,
    route: metrics.route,
    duration_ms: metrics.durationMs,
    method: metrics.method,
    status_code: metrics.statusCode,
  };

  recordLatency(metrics.durationMs);

  if (metrics.durationMs > SLOW_REQUEST_THRESHOLD_MS) {
    logger.warn(
      `Slow request: ${metrics.method} ${metrics.route} took ${metrics.durationMs}ms`,
      context,
    );
  } else {
    logger.info(
      `${metrics.method} ${metrics.route} ${metrics.statusCode} ${metrics.durationMs}ms`,
      context,
    );
  }
}

/**
 * Create a timer that returns elapsed milliseconds when stopped.
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
