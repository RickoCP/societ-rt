'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
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
  createdAt: string;
}

function isActive(deadline: string): boolean {
  return new Date(deadline) > new Date();
}

const columns: DataTableColumn<VoteRow>[] = [
  {
    key: 'title',
    header: 'Title',
    render: row => (
      <a href={`/voting/${row.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
        {row.title}
      </a>
    ),
  },
  {
    key: 'mode',
    header: 'Mode',
    render: row => (
      <Badge variant={row.mode === 'anonymous' ? 'info' : 'default'}>
        {row.mode}
      </Badge>
    ),
  },
  {
    key: 'deadline',
    header: 'Status',
    render: row => (
      <Badge variant={isActive(row.deadline) ? 'success' : 'default'}>
        {isActive(row.deadline) ? 'Active' : 'Closed'}
      </Badge>
    ),
  },
  {
    key: 'totalVotes',
    header: 'Votes',
    render: row => <span>{row.totalVotes}</span>,
  },
  {
    key: 'optionCount',
    header: 'Options',
    render: row => <span>{row.optionCount}</span>,
  },
];

export function VoteListScreen() {
  const [page, setPage] = useState(1);
  const { votes, totalPages, isLoading, isError, error, deleteVote, isDeleting } =
    useVoteListViewModel(page);

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Delete vote "${title}" and all its ballots?`)) return;
    deleteVote(id);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Voting
        </h1>
        <Button size="sm">
          <a href="/voting/create">Create Vote</a>
        </Button>
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load votes'} />
      )}

      <DataTable<VoteRow>
        columns={[
          ...columns,
          {
            key: 'createdAt',
            header: 'Actions',
            render: row => (
              <button
                type="button"
                onClick={() => handleDelete(row.id, row.title)}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                aria-label={`Delete ${row.title}`}
              >
                Delete
              </button>
            ),
          },
        ]}
        data={votes}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No votes found"
      />
    </div>
  );
}
