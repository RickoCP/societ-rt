'use client';

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
  } = useEventDetailViewModel(id);

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
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {event.title}
      </h1>

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
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{event.rsvpCount}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Organizer</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{event.createdBy}</dd>
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

      <div>
        <Button
          size="sm"
          onClick={() => submitRsvp()}
          disabled={isSubmittingRsvp}
        >
          {isSubmittingRsvp ? 'Submitting…' : 'RSVP'}
        </Button>
      </div>
    </div>
  );
}
