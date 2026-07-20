'use client';

import { useState } from 'react';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useVoteListViewModel } from '../viewModel/useVoteListViewModel';

interface VoteRow {
  id: string;
  title: string;
  description: string;
  mode: 'anonymous' | 'verified';
  deadline: string;
  optionCount: number;
  totalVotes: number;
  createdBy: string;
  authorName: string;
  createdAt: string;
}

function isActive(deadline: string): boolean {
  return new Date(deadline) > new Date();
}

function formatDeadline(deadline: string): string {
  const date = new Date(deadline);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTimeRemaining(deadline: string): string {
  const now = new Date();
  const end = new Date(deadline);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Closed';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes}m remaining`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function VoteListScreen() {
  const [page, setPage] = useState(1);
  const { votes, totalPages, isLoading, isError, error, deleteVote, isDeleting, canDeleteVote } =
    useVoteListViewModel(page);

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Delete vote "${title}" and all its ballots?`)) return;
    deleteVote(id);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Voting
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Polling dan pemungutan suara warga RT
          </p>
        </div>
        <Button size="sm">
          <a href="/voting/create">Create Vote</a>
        </Button>
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load votes'} />
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <div className="h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-3 h-4 w-full rounded bg-gray-100 dark:bg-gray-700" />
              <div className="mt-6 h-8 w-1/2 rounded bg-gray-100 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && votes.length === 0 && !isError && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">🗳️</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No votes found</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Create the first vote for your community</p>
        </div>
      )}

      {/* Vote Cards Grid */}
      {!isLoading && votes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {votes.map((vote: VoteRow) => {
            const active = isActive(vote.deadline);
            return (
              <article
                key={vote.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                {/* Status indicator top bar */}
                <div className={`h-1 w-full ${active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />

                <div className="flex flex-1 flex-col p-5">
                  {/* Header: Status + Mode badges */}
                  <div className="mb-3 flex items-center justify-between">
                    <Badge variant={active ? 'success' : 'default'}>
                      {active ? '● Active' : 'Closed'}
                    </Badge>
                    <Badge variant={vote.mode === 'anonymous' ? 'info' : 'default'}>
                      {vote.mode === 'anonymous' ? '🔒 Anonymous' : '✓ Verified'}
                    </Badge>
                  </div>

                  {/* Title */}
                  <a
                    href={`/voting/${vote.id}`}
                    className="mb-2 text-base font-semibold text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400"
                  >
                    {vote.title}
                  </a>

                  {/* Description */}
                  {vote.description && (
                    <p className="mb-4 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                      {vote.description}
                    </p>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Stats */}
                  <div className="mb-3 flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{vote.optionCount || 0} options</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{vote.totalVotes || 0} votes</span>
                    </div>
                  </div>

                  {/* Deadline */}
                  <div className="mb-3 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${active ? 'text-green-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className={`text-xs font-medium ${active ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {active ? getTimeRemaining(vote.deadline) : `Ended ${formatDeadline(vote.deadline)}`}
                    </span>
                  </div>

                  {/* Footer: Author + Actions */}
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {getInitials(vote.authorName)}
                      </div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {vote.authorName}
                      </span>
                    </div>

                    {canDeleteVote(vote.createdBy) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(vote.id, vote.title)}
                        disabled={isDeleting}
                        className="rounded-lg p-1.5 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        aria-label={`Delete ${vote.title}`}
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
