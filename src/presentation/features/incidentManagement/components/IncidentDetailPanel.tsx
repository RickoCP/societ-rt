'use client';

import { useState } from 'react';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import type { Incident, IncidentStatusEntry, IncidentStatus } from '../viewModel/useIncidentManagementViewModel';

interface Props {
  incident: Incident;
  timeline: IncidentStatusEntry[];
  onUpdateStatus: (input: { incidentId: string; status: IncidentStatus; notes: string }) => void;
  isUpdating: boolean;
  onClose: () => void;
}

const STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ['investigating'],
  investigating: ['resolved'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};

export function IncidentDetailPanel({ incident, timeline, onUpdateStatus, isUpdating, onClose }: Props) {
  const [newStatus, setNewStatus] = useState<IncidentStatus | ''>('');
  const [notes, setNotes] = useState('');

  const availableTransitions = STATUS_TRANSITIONS[incident.status] ?? [];

  const handleSubmitStatus = () => {
    if (!newStatus || !notes.trim()) return;
    onUpdateStatus({ incidentId: incident.id, status: newStatus, notes: notes.trim() });
    setNewStatus('');
    setNotes('');
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{incident.title}</h2>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close detail">
          ✕
        </button>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400">{incident.description}</p>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="info">{incident.category}</Badge>
        <span className="text-gray-500">📍 {incident.location}</span>
        <span className="text-gray-500">Reported: {new Date(incident.createdAt).toLocaleString()}</span>
      </div>

      {/* Evidence */}
      {incident.evidenceUrls.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Evidence</h4>
          <div className="flex flex-wrap gap-2">
            {incident.evidenceUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline hover:text-blue-800">
                Attachment {i + 1}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Status Timeline</h4>
        {timeline.length === 0 ? (
          <p className="text-xs text-gray-400">No status updates yet.</p>
        ) : (
          <div className="space-y-2">
            {timeline.map(entry => (
              <div key={entry.id} className="border-l-2 border-blue-300 pl-3">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{entry.status}</Badge>
                  <span className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">{entry.notes}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status update form */}
      {availableTransitions.length > 0 && (
        <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
          <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Update Status</h4>
          <div className="flex flex-col gap-2">
            <select
              aria-label="New status"
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as IncidentStatus)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Select new status</option>
              {availableTransitions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <textarea
              aria-label="Status notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes about this status change..."
              rows={2}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <Button onClick={handleSubmitStatus} disabled={!newStatus || !notes.trim() || isUpdating} size="sm">
              {isUpdating ? 'Updating...' : 'Update Status'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
