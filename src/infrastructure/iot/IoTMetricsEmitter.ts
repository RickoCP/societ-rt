/**
 * IoTMetricsEmitter — In-memory metrics tracking for IoT observability.
 *
 * Tracks OpenTelemetry-style metrics:
 * - device_online_count, device_offline_count
 * - command_success_rate, command_latency_p95
 * - webhook_processing_latency, token_refresh_count
 *
 * Also exposes Prometheus-compatible metrics:
 * - tuya_api_requests_total, tuya_api_errors_total
 * - tuya_api_latency_seconds, device_events_processed_total
 * - websocket_connections_active
 *
 * Logs all Tuya API interactions with structured fields.
 *
 * @see Requirements 44.6, 44.7, 44.8
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TuyaApiLogEntry {
  readonly requestId: string;
  readonly endpoint: string;
  readonly method: string;
  readonly responseStatus: number;
  readonly latencyMs: number;
  readonly correlationId: string;
  readonly timestamp: Date;
}

export interface IoTMetricsSnapshot {
  // OpenTelemetry-style gauges/counters
  readonly deviceOnlineCount: number;
  readonly deviceOfflineCount: number;
  readonly commandSuccessRate: number;
  readonly commandLatencyP95: number;
  readonly webhookProcessingLatency: number;
  readonly tokenRefreshCount: number;
  // Prometheus-style counters
  readonly tuyaApiRequestsTotal: number;
  readonly tuyaApiErrorsTotal: number;
  readonly tuyaApiLatencySeconds: number;
  readonly deviceEventsProcessedTotal: number;
  readonly websocketConnectionsActive: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IoTMetricsEmitter {
  /** Record a device coming online. */
  recordDeviceOnline(): void;

  /** Record a device going offline. */
  recordDeviceOffline(): void;

  /** Record a device command result. */
  recordCommandResult(success: boolean, latencyMs: number): void;

  /** Record webhook processing latency. */
  recordWebhookLatency(latencyMs: number): void;

  /** Record a token refresh. */
  recordTokenRefresh(): void;

  /** Record a Tuya API request. */
  recordTuyaApiRequest(entry: TuyaApiLogEntry): void;

  /** Record a device event processed. */
  recordDeviceEventProcessed(): void;

  /** Set the active WebSocket connections count. */
  setWebsocketConnectionsActive(count: number): void;

  /** Get current metrics snapshot. */
  getMetrics(): IoTMetricsSnapshot;

  /** Get Prometheus-compatible text format. */
  getPrometheusMetrics(): string;

  /** Get recent Tuya API logs. */
  getRecentApiLogs(limit?: number): TuyaApiLogEntry[];
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const IoTMetricsEmitterImpl = (): IoTMetricsEmitter => {
  // Internal state
  let deviceOnlineCount = 0;
  let deviceOfflineCount = 0;
  let commandSuccessCount = 0;
  let commandTotalCount = 0;
  const commandLatencies: number[] = [];
  let webhookLatencySum = 0;
  let webhookLatencyCount = 0;
  let tokenRefreshCount = 0;
  let tuyaApiRequestsTotal = 0;
  let tuyaApiErrorsTotal = 0;
  let tuyaApiLatencySum = 0;
  let deviceEventsProcessedTotal = 0;
  let websocketConnectionsActive = 0;
  const apiLogs: TuyaApiLogEntry[] = [];
  const MAX_LOG_ENTRIES = 1000;

  function calculateP95(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  return {
    recordDeviceOnline() {
      deviceOnlineCount++;
      if (deviceOfflineCount > 0) deviceOfflineCount--;
    },

    recordDeviceOffline() {
      deviceOfflineCount++;
      if (deviceOnlineCount > 0) deviceOnlineCount--;
    },

    recordCommandResult(success: boolean, latencyMs: number) {
      commandTotalCount++;
      if (success) commandSuccessCount++;
      commandLatencies.push(latencyMs);
      // Keep only last 1000 latencies for P95 calculation
      if (commandLatencies.length > 1000) {
        commandLatencies.shift();
      }
    },

    recordWebhookLatency(latencyMs: number) {
      webhookLatencySum += latencyMs;
      webhookLatencyCount++;
    },

    recordTokenRefresh() {
      tokenRefreshCount++;
    },

    recordTuyaApiRequest(entry: TuyaApiLogEntry) {
      tuyaApiRequestsTotal++;
      tuyaApiLatencySum += entry.latencyMs;
      if (entry.responseStatus >= 400) {
        tuyaApiErrorsTotal++;
      }
      apiLogs.push(entry);
      // Keep only recent entries
      if (apiLogs.length > MAX_LOG_ENTRIES) {
        apiLogs.shift();
      }
    },

    recordDeviceEventProcessed() {
      deviceEventsProcessedTotal++;
    },

    setWebsocketConnectionsActive(count: number) {
      websocketConnectionsActive = count;
    },

    getMetrics(): IoTMetricsSnapshot {
      const commandSuccessRate =
        commandTotalCount > 0 ? commandSuccessCount / commandTotalCount : 0;
      const commandLatencyP95 = calculateP95(commandLatencies);
      const avgWebhookLatency =
        webhookLatencyCount > 0
          ? webhookLatencySum / webhookLatencyCount
          : 0;
      const avgTuyaLatencySeconds =
        tuyaApiRequestsTotal > 0
          ? tuyaApiLatencySum / tuyaApiRequestsTotal / 1000
          : 0;

      return {
        deviceOnlineCount,
        deviceOfflineCount,
        commandSuccessRate,
        commandLatencyP95,
        webhookProcessingLatency: avgWebhookLatency,
        tokenRefreshCount,
        tuyaApiRequestsTotal,
        tuyaApiErrorsTotal,
        tuyaApiLatencySeconds: avgTuyaLatencySeconds,
        deviceEventsProcessedTotal,
        websocketConnectionsActive,
      };
    },

    getPrometheusMetrics(): string {
      const metrics = [
        `# HELP tuya_api_requests_total Total number of Tuya API requests`,
        `# TYPE tuya_api_requests_total counter`,
        `tuya_api_requests_total ${tuyaApiRequestsTotal}`,
        ``,
        `# HELP tuya_api_errors_total Total number of Tuya API errors`,
        `# TYPE tuya_api_errors_total counter`,
        `tuya_api_errors_total ${tuyaApiErrorsTotal}`,
        ``,
        `# HELP tuya_api_latency_seconds Average Tuya API latency in seconds`,
        `# TYPE tuya_api_latency_seconds gauge`,
        `tuya_api_latency_seconds ${tuyaApiRequestsTotal > 0 ? (tuyaApiLatencySum / tuyaApiRequestsTotal / 1000).toFixed(6) : '0'}`,
        ``,
        `# HELP device_events_processed_total Total device events processed`,
        `# TYPE device_events_processed_total counter`,
        `device_events_processed_total ${deviceEventsProcessedTotal}`,
        ``,
        `# HELP websocket_connections_active Current active WebSocket connections`,
        `# TYPE websocket_connections_active gauge`,
        `websocket_connections_active ${websocketConnectionsActive}`,
        ``,
        `# HELP device_online_count Current number of online devices`,
        `# TYPE device_online_count gauge`,
        `device_online_count ${deviceOnlineCount}`,
        ``,
        `# HELP device_offline_count Current number of offline devices`,
        `# TYPE device_offline_count gauge`,
        `device_offline_count ${deviceOfflineCount}`,
        ``,
        `# HELP command_success_rate Command success rate (0-1)`,
        `# TYPE command_success_rate gauge`,
        `command_success_rate ${commandTotalCount > 0 ? (commandSuccessCount / commandTotalCount).toFixed(6) : '0'}`,
        ``,
        `# HELP command_latency_p95 P95 command latency in milliseconds`,
        `# TYPE command_latency_p95 gauge`,
        `command_latency_p95 ${calculateP95(commandLatencies)}`,
        ``,
        `# HELP webhook_processing_latency Average webhook processing latency in ms`,
        `# TYPE webhook_processing_latency gauge`,
        `webhook_processing_latency ${webhookLatencyCount > 0 ? (webhookLatencySum / webhookLatencyCount).toFixed(3) : '0'}`,
        ``,
        `# HELP token_refresh_count Total token refresh operations`,
        `# TYPE token_refresh_count counter`,
        `token_refresh_count ${tokenRefreshCount}`,
      ];

      return metrics.join('\n') + '\n';
    },

    getRecentApiLogs(limit = 50): TuyaApiLogEntry[] {
      return apiLogs.slice(-limit);
    },
  };
};
