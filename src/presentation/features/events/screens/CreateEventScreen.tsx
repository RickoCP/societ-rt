'use client';

import { useRouter } from 'next/navigation';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useCreateEventViewModel } from '../viewModel/useCreateEventViewModel';

export function CreateEventScreen() {
  const router = useRouter();
  const { createEvent, isPending, isError, error } =
    useCreateEventViewModel();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const eventDate = formData.get('eventDate') as string;
    // Convert datetime-local to ISO string and extract time
    const dateObj = new Date(eventDate);
    const isoDate = dateObj.toISOString();
    const time = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

    createEvent({
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      location: formData.get('location') as string,
      date: isoDate,
      time,
      maxRsvp: formData.get('maxRsvp') ? Number(formData.get('maxRsvp')) : undefined,
    }, {
      onSuccess: () => {
        router.push('/events');
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Create Event
      </h1>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to create event'} />
      )}

      <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Title</span>
          <input
            name="title"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</span>
          <textarea
            name="description"
            rows={3}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Location</span>
          <input
            name="location"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Event Date</span>
          <input
            name="eventDate"
            type="datetime-local"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Max RSVP (kosongkan jika unlimited)</span>
          <input
            name="maxRsvp"
            type="number"
            min="1"
            placeholder="Unlimited"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create Event'}
        </button>
      </form>
    </div>
  );
}
