'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useEventListViewModel } from '../viewModel/useEventListViewModel';

interface EventRow {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  rsvpCount: number;
  createdBy: string;
  authorName: string;
  createdAt: string;
}

function isUpcoming(dateStr: string): boolean {
  return new Date(dateStr) > new Date();
}

function getDay(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).getDate().toString();
}

function getMonth(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('id-ID', { month: 'short' }).toUpperCase();
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function EventListScreen() {
  const [page, setPage] = useState(1);
  const { events, totalPages, isLoading, isError, error, deleteEvent, isDeleting, canDeleteEvent } =
    useEventListViewModel(page);

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Delete event "${title}" and all RSVPs?`)) return;
    deleteEvent(id);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Events
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Kegiatan dan acara komunitas RT
          </p>
        </div>
        <Button size="sm">
          <Link href="/events/create">Create Event</Link>
        </Button>
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load events'} />
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex gap-4">
                <div className="h-14 w-14 rounded-lg bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1">
                  <div className="h-5 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-gray-100 dark:bg-gray-700" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && events.length === 0 && !isError && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">📅</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No events found</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Create the first event for your community</p>
        </div>
      )}

      {/* Event Cards */}
      {!isLoading && events.length > 0 && (
        <div className="flex flex-col gap-4">
          {events.map((event: EventRow) => {
            const upcoming = isUpcoming(event.date);
            return (
              <article
                key={event.id}
                className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex">
                  {/* Date Block */}
                  <div className={`flex w-20 shrink-0 flex-col items-center justify-center border-r px-3 py-4 ${
                    upcoming
                      ? 'border-blue-100 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20'
                      : 'border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                  }`}>
                    <span className={`text-2xl font-bold ${upcoming ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                      {getDay(event.date)}
                    </span>
                    <span className={`text-xs font-semibold ${upcoming ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400'}`}>
                      {getMonth(event.date)}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 items-start justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      {/* Title + Status */}
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <a
                          href={`/events/${event.id}`}
                          className="font-semibold text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400"
                        >
                          {event.title}
                        </a>
                        <Badge variant={upcoming ? 'success' : 'default'}>
                          {upcoming ? 'Upcoming' : 'Past'}
                        </Badge>
                      </div>

                      {/* Description */}
                      {event.description && (
                        <p className="mb-2 line-clamp-1 text-sm text-gray-500 dark:text-gray-400">
                          {event.description}
                        </p>
                      )}

                      {/* Meta Info */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        {/* Location */}
                        <div className="flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{event.location}</span>
                        </div>

                        {/* Time */}
                        {event.time && (
                          <div className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{event.time}</span>
                          </div>
                        )}

                        {/* RSVPs */}
                        <div className="flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{event.rsvpCount} attending</span>
                        </div>

                        {/* Author */}
                        <div className="flex items-center gap-1.5">
                          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-100 text-[8px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                            {getInitials(event.authorName)}
                          </div>
                          <span>{event.authorName}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {canDeleteEvent(event.createdBy) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(event.id, event.title)}
                        disabled={isDeleting}
                        className="shrink-0 rounded-lg p-2 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        aria-label={`Delete ${event.title}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
