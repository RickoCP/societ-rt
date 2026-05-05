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
  const [category, setCategory] = useState<string>('');
  const { announcements, totalPages, isLoading, isError, error, refetch } =
    useAnnouncementListViewModel(page, category || undefined);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  const startEdit = (row: AnnouncementRow) => {
    setEditingId(row.id);
    setEditTitle(row.title);
    setEditContent(row.content);
    setEditCategory(row.category);
    setEditMsg(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setEditLoading(true);
    setEditMsg(null);
    try {
      const res = await fetch(`/api/announcements/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, content: editContent, category: editCategory }),
      });
      if (!res.ok) {
        const json = await res.json();
        setEditMsg(json.message ?? 'Failed');
        return;
      }
      setEditingId(null);
      refetch();
    } catch (err) {
      setEditMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete announcement "${title}"?`)) return;
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
      if (res.ok) refetch();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Announcements
        </h1>
        <Button size="sm">
          <a href="/announcements/create">New Announcement</a>
        </Button>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2">
        <label htmlFor="ann-category" className="text-sm text-gray-600 dark:text-gray-400">Filter:</label>
        <select
          id="ann-category"
          value={category}
          onChange={e => { setCategory(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="">All Categories</option>
          <option value="umum">Umum</option>
          <option value="keamanan">Keamanan</option>
          <option value="keuangan">Keuangan</option>
          <option value="kegiatan">Kegiatan</option>
          <option value="darurat">Darurat</option>
        </select>
      </div>

      {isError && (
        <ErrorMessage
          message={error?.message ?? 'Failed to load announcements'}
        />
      )}

      {/* Edit Form */}
      {editingId && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Edit Announcement</h3>
          <div className="flex flex-col gap-3">
            <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" placeholder="Title" />
            <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="umum">Umum</option>
              <option value="keamanan">Keamanan</option>
              <option value="keuangan">Keuangan</option>
              <option value="kegiatan">Kegiatan</option>
              <option value="darurat">Darurat</option>
            </select>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" placeholder="Content" />
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} disabled={editLoading} variant="primary" size="sm">
                {editLoading ? 'Saving...' : 'Save'}
              </Button>
              <Button onClick={() => setEditingId(null)} variant="secondary" size="sm">Cancel</Button>
            </div>
            {editMsg && <p className="text-xs text-red-600">{editMsg}</p>}
          </div>
        </div>
      )}

      {/* Announcements as Cards with Edit/Delete */}
      {!isLoading && announcements.length > 0 && (
        <div className="flex flex-col gap-3">
          {announcements.map(a => (
            <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{a.title}</h3>
                    <Badge variant={categoryVariantMap[a.category] ?? 'default'}>{a.category}</Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{a.content}</p>
                  <p className="mt-1 text-xs text-gray-400">{a.publishedAt ? new Date(a.publishedAt).toLocaleString() : ''}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => startEdit(a)} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400" aria-label={`Edit ${a.title}`}>Edit</button>
                  <button type="button" onClick={() => handleDelete(a.id, a.title)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400" aria-label={`Delete ${a.title}`}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <DataTable<AnnouncementRow>
        columns={columns}
        data={[]}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage={announcements.length > 0 ? '' : 'No announcements found'}
      />
    </div>
  );
}
