'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
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

const columns: DataTableColumn<EventRow>[] = [
  { key: 'title', header: 'Title' },
  { key: 'location', header: 'Location' },
  { key: 'eventDate', header: 'Date' },
  {
    key: 'rsvpCount',
    header: 'RSVPs',
    render: row => <span>{row.rsvpCount}</span>,
  },
  { key: 'createdBy', header: 'Organizer' },
];

export function EventListScreen() {
  const [page, setPage] = useState(1);
  const { events, totalPages, isLoading, isError, error } =
    useEventListViewModel(page);

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
        columns={columns}
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
