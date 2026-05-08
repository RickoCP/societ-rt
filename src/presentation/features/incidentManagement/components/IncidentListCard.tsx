'use client';

import { Badge } from '@components/atoms/Badge';
import type { Incident } from '../viewModel/useIncidentManagementViewModel';

interface Props {
  incident: Incident;
  onSelect: (id: string) => void;
}

const severityVariant: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
};

const statusVariant: Record<string, 'danger' | 'warning' | 'info' | 'success' | 'default'> = {
  open: 'danger',
  investigating: 'warning',
  resolved: 'success',
  closed: 'default',
};

export function IncidentListCard({ incident, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(incident.id)}
      className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-gray-900 dark:text-gray-100">
              {incident.title}
            </h3>
            <Badge variant={severityVariant[incident.severity] ?? 'default'}>
              {incident.severity}
            </Badge>
            <Badge variant={statusVariant[incident.status] ?? 'default'}>
              {incident.status}
            </Badge>
          </div>
          <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
            {incident.description}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            📍 {incident.location} • {new Date(incident.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </button>
  );
}
