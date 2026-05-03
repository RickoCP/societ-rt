'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useAnnouncementListViewModel } from '../viewModel/useAnnouncementListViewModel';

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  category: string;
  createdBy: string;
  publishedAt: string;
  createdAt: string;
}

type CategoryVariant = 'info' | 'danger' | 'warning' | 'success' | 'default';

const categoryVariantMap: Record<string, CategoryVariant> = {
  umum: 'info',
  keamanan: 'danger',
  keuangan: 'warning',
  kegiatan: 'success',
  darurat: 'danger',
};

const columns: DataTableColumn<AnnouncementRow>[] = [
  { key: 'title', header: 'Title' },
  {
    key: 'category',
    header: 'Category',
    render: row => (
      <Badge variant={categoryVariantMap[row.category] ?? 'default'}>
        {row.category}
      </Badge>
    ),
  },
  { key: 'createdBy', header: 'Author' },
  { key: 'publishedAt', header: 'Published' },
];

export function AnnouncementListScreen() {
  const [page, setPage] = useState(1);
  const { announcements, totalPages, isLoading, isError, error } =
    useAnnouncementListViewModel(page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Announcements
        </h1>
        <Button size="sm">
          <a href="/announcements/create">New Announcement</a>
        </Button>
      </div>

      {isError && (
        <ErrorMessage
          message={error?.message ?? 'Failed to load announcements'}
        />
      )}

      <DataTable<AnnouncementRow>
        columns={columns}
        data={announcements}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No announcements found"
      />
    </div>
  );
}
