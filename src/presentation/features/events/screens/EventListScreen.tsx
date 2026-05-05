'use client';

import { useState } from 'react';
import { DataTable } from '@components/organisms/DataTable';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useEventListViewModel } from '../viewModel/useEventListViewModel';

interface EventRow {
  id: string;
  title: string;
  description: string;
  location: string;
  eventDate: string;
  rsvpCount: number;
  createdBy: string;
  createdAt: string;
}

export function EventListScreen() {
  const [page, setPage] = useState(1);
  const { events, totalPages, isLoading, isError, error, refetch } =
    useEventListViewModel(page);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete event "${title}"?`)) return;
    try {
      const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
      if (res.ok) refetch();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Events
        </h1>
        <Button size="sm">
          <a href="/events/create">Create Event</a>
        </Button>
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load events'} />
      )}

      <DataTable<EventRow>
        columns={[
          {
            key: 'title',
            header: 'Title',
            render: row => (
              <a href={`/events/${row.id}`} className="text-blue-600 hover:underline dark:text-blue-400">{row.title}</a>
            ),
          },
          { key: 'location', header: 'Location' },
          { key: 'eventDate', header: 'Date' },
          {
            key: 'rsvpCount',
            header: 'RSVPs',
            render: row => <span>{row.rsvpCount}</span>,
          },
          {
            key: 'createdAt',
            header: 'Actions',
            render: row => (
              <button
                type="button"
                onClick={() => handleDelete(row.id, row.title)}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400"
                aria-label={`Delete ${row.title}`}
              >
                Delete
              </button>
            ),
          },
        ]}
        data={events}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No events found"
      />
    </div>
  );
}
