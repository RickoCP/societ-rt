'use client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GateStatusSummary {
  open: number;
  closed: number;
  offline: number;
}

interface CctvStatusSummary {
  online: number;
  offline: number;
}

interface PatrolStatusSummary {
  activeSessions: number;
}

interface SecurityEvent {
  id: string;
  type: 'incident' | 'alert' | 'device_event' | 'patrol_checkin' | 'gate_event';
  title: string;
  severity: string | null;
  category: string | null;
  timestamp: string;
}

interface DashboardMetrics {
  activeIncidents: number;
  emergencyAlerts: number;
  gateStatus: GateStatusSummary;
  cctvStatus: CctvStatusSummary;
  patrolStatus: PatrolStatusSummary;
  recentEvents: SecurityEvent[];
}

interface SecurityDashboardPanelProps {
  metrics: DashboardMetrics;
  isConnected: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeverityColor(severity: string | null): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'high':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'low':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

function getEventTypeIcon(type: string): string {
  switch (type) {
    case 'incident':
      return '🚨';
    case 'alert':
      return '⚠️';
    case 'device_event':
      return '📡';
    case 'patrol_checkin':
      return '🚶';
    case 'gate_event':
      return '🚪';
    default:
      return '📋';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecurityDashboardPanel({ metrics, isConnected }: SecurityDashboardPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Connection status */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          aria-label={isConnected ? 'Connected' : 'Disconnected'}
        />
        <span className="text-gray-500 dark:text-gray-400">
          {isConnected ? 'Live' : 'Reconnecting...'}
        </span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Active Incidents */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Incidents</p>
          <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
            {metrics.activeIncidents}
          </p>
        </div>

        {/* Emergency Alerts */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Emergency Alerts</p>
          <p className="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">
            {metrics.emergencyAlerts}
          </p>
        </div>

        {/* Gate Status */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Gate Status</p>
          <div className="mt-1 flex gap-3 text-sm">
            <span className="text-green-600 dark:text-green-400">
              {metrics.gateStatus.closed} closed
            </span>
            <span className="text-red-600 dark:text-red-400">
              {metrics.gateStatus.open} open
            </span>
            {metrics.gateStatus.offline > 0 && (
              <span className="text-gray-500">
                {metrics.gateStatus.offline} offline
              </span>
            )}
          </div>
        </div>

        {/* CCTV Status */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">CCTV Status</p>
          <div className="mt-1 flex gap-3 text-sm">
            <span className="text-green-600 dark:text-green-400">
              {metrics.cctvStatus.online} online
            </span>
            {metrics.cctvStatus.offline > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {metrics.cctvStatus.offline} offline
              </span>
            )}
          </div>
        </div>

        {/* Patrol Status */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Patrols</p>
          <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {metrics.patrolStatus.activeSessions}
          </p>
        </div>
      </div>

      {/* Recent Events */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Recent Events
        </h3>
        {metrics.recentEvents.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No recent events</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {metrics.recentEvents.slice(0, 10).map(event => (
              <li
                key={event.id}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="text-base" aria-hidden="true">
                  {getEventTypeIcon(event.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {event.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                </div>
                {event.severity && (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getSeverityColor(event.severity)}`}
                  >
                    {event.severity}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
