'use client';

import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useSecurityTimelineViewModel } from '../viewModel/useSecurityTimelineViewModel';
import type { TimeRange } from '../viewModel/useSecurityTimelineViewModel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '12h', label: '12 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '48h', label: '48 Hours' },
  { value: '7d', label: '7 Days' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeverityDot(severity: string | null): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500';
    case 'high':
      return 'bg-orange-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'low':
      return 'bg-blue-500';
    default:
      return 'bg-gray-400';
  }
}

function getEventTypeLabel(type: string): string {
  switch (type) {
    case 'incident':
      return 'Incident';
    case 'alert':
      return 'Alert';
    case 'device_event':
      return 'Device';
    case 'patrol_checkin':
      return 'Patrol';
    case 'gate_event':
      return 'Gate';
    default:
      return 'Event';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IncidentTimelinePanel() {
  const { events, isLoading, isError, error, timeRange, setTimeRange } =
    useSecurityTimelineViewModel();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      {/* Header with time range filter */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Incident Timeline
        </h3>
        <select
          value={timeRange}
          onChange={e => setTimeRange(e.target.value as TimeRange)}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          aria-label="Time range filter"
        >
          {TIME_RANGE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load timeline'} />
      )}

      {!isLoading && !isError && events.length === 0 && (
        <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          No events in this time range
        </p>
      )}

      {!isLoading && !isError && events.length > 0 && (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-3 top-0 h-full w-px bg-gray-200 dark:bg-gray-700" />

          <ul className="flex flex-col gap-3">
            {events.map(event => (
              <li key={event.id} className="relative flex gap-3 pl-8">
                {/* Dot */}
                <span
                  className={`absolute left-2 top-1.5 h-2.5 w-2.5 rounded-full ${getSeverityDot(event.severity)}`}
                  aria-hidden="true"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                      {getEventTypeLabel(event.type)}
                    </span>
                    {event.severity && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {event.severity}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {event.title}
                  </p>
                  {event.description && (
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {event.description}
                    </p>
                  )}
                  <div className="mt-0.5 flex gap-3 text-xs text-gray-400">
                    <span>{new Date(event.timestamp).toLocaleString()}</span>
                    {event.location && <span>📍 {event.location}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
