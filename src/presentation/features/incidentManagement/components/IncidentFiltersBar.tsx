'use client';

import type { IncidentFilters, IncidentStatus, IncidentSeverity, IncidentCategory } from '../viewModel/useIncidentManagementViewModel';

interface Props {
  filters: IncidentFilters;
  onFilterChange: (filters: Partial<IncidentFilters>) => void;
}

const STATUS_OPTIONS: { value: IncidentStatus | ''; label: string }[] = [
  { value: '', label: 'All Status' },
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const SEVERITY_OPTIONS: { value: IncidentSeverity | ''; label: string }[] = [
  { value: '', label: 'All Severity' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const CATEGORY_OPTIONS: { value: IncidentCategory | ''; label: string }[] = [
  { value: '', label: 'All Categories' },
  { value: 'theft', label: 'Theft' },
  { value: 'vandalism', label: 'Vandalism' },
  { value: 'fire', label: 'Fire' },
  { value: 'intrusion', label: 'Intrusion' },
  { value: 'accident', label: 'Accident' },
  { value: 'other', label: 'Other' },
];

export function IncidentFiltersBar({ filters, onFilterChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        aria-label="Filter by status"
        value={filters.status}
        onChange={e => onFilterChange({ status: e.target.value as IncidentStatus | '' })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      >
        {STATUS_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select
        aria-label="Filter by severity"
        value={filters.severity}
        onChange={e => onFilterChange({ severity: e.target.value as IncidentSeverity | '' })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      >
        {SEVERITY_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select
        aria-label="Filter by category"
        value={filters.category}
        onChange={e => onFilterChange({ category: e.target.value as IncidentCategory | '' })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      >
        {CATEGORY_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
