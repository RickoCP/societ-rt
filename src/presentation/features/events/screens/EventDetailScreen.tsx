'use client';

import { useState } from 'react';
import { Button } from '@components/atoms/Button';
import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useEventDetailViewModel } from '../viewModel/useEventDetailViewModel';

export function EventDetailScreen({ id }: { id: string }) {
  const {
    event,
    isLoading,
    isError,
    error,
    submitRsvp,
    isSubmittingRsvp,
    rsvpError,
    refetch,
  } = useEventDetailViewModel(id);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const startEdit = () => {
    if (!event) return;
    setEditTitle(event.title);
    setEditDesc(event.description);
    setEditLocation(event.location);
    setEditing(true);
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, description: editDesc, location: editLocation }),
      });
      if (!res.ok) {
        const json = await res.json();
        setEditError(json.message ?? 'Failed to update');
        return;
      }
      setEditing(false);
      refetch();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error');
    } finally {
      setEditSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage message={error?.message ?? 'Failed to load event'} />
    );
  }

  if (!event) {
    return <ErrorMessage message="Event not found" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {event.title}
        </h1>
        <Button variant="ghost" size="sm" onClick={startEdit}>Edit Event</Button>
      </div>

      {/* Edit Form */}
      {editing && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Edit Event</h3>
          <div className="flex flex-col gap-3">
            <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            <input type="text" value={editLocation} onChange={e => setEditLocation(e.target.value)} placeholder="Location" className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} placeholder="Description" className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} disabled={editSaving} variant="primary" size="sm">
                {editSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button onClick={() => setEditing(false)} variant="secondary" size="sm">Cancel</Button>
            </div>
            {editError && <p className="text-xs text-red-600">{editError}</p>}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Location</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{event.location}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Date</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{event.eventDate}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">RSVPs</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {event.rsvpCount}{event.maxRsvp ? ` / ${event.maxRsvp}` : ''} {event.maxRsvp ? '(limited)' : '(unlimited)'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Organizer</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{event.organizerName}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{event.description}</dd>
          </div>
        </dl>
      </div>

      {rsvpError && (
        <ErrorMessage message={rsvpError.message ?? 'Failed to submit RSVP'} />
      )}

      {/* RSVP Status & Button */}
      <div className="flex flex-wrap items-center gap-3">
        {event.myRsvpStatus && (
          <p className={`rounded-md border px-4 py-2 text-sm font-medium ${event.myRsvpStatus === 'attending' ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'}`}>
            {event.myRsvpStatus === 'attending' ? '✓ Hadir' : '✗ Tidak Hadir'}
          </p>
        )}
        <Button
          size="sm"
          variant={event.myRsvpStatus === 'attending' ? 'secondary' : 'primary'}
          onClick={() => submitRsvp('attending')}
          disabled={isSubmittingRsvp || event.myRsvpStatus === 'attending'}
        >
          {isSubmittingRsvp ? 'Submitting…' : 'Hadir'}
        </Button>
        <Button
          size="sm"
          variant={event.myRsvpStatus === 'not_attending' ? 'secondary' : 'danger'}
          onClick={() => submitRsvp('not_attending')}
          disabled={isSubmittingRsvp || event.myRsvpStatus === 'not_attending'}
        >
          {isSubmittingRsvp ? 'Submitting…' : 'Tidak Hadir'}
        </Button>
      </div>

      {/* Attendees List */}
      {event.attendees && event.attendees.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Attendees ({event.attendees.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Response</th>
                  <th className="px-3 py-2">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {event.attendees.map((a, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{a.userName}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.response === 'attending' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                        {a.response}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{new Date(a.respondedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
