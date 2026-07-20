'use client';

import { useState } from 'react';
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
  authorName: string;
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

const categoryIcon: Record<string, string> = {
  umum: '📢',
  keamanan: '🔒',
  keuangan: '💰',
  kegiatan: '🎉',
  darurat: '🚨',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AnnouncementListScreen() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string>('');
  const { announcements, totalPages, isLoading, isError, error, refetch, canEditDelete } =
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Announcements
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Informasi dan pengumuman untuk warga RT
          </p>
        </div>
        <Button size="sm">
          <a href="/announcements/create">New Announcement</a>
        </Button>
      </div>

      {/* Category Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setCategory(''); setPage(1); }}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            category === ''
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          All
        </button>
        {['umum', 'keamanan', 'keuangan', 'kegiatan', 'darurat'].map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => { setCategory(cat); setPage(1); }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              category === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {categoryIcon[cat]} {cat}
          </button>
        ))}
      </div>

      {isError && (
        <ErrorMessage
          message={error?.message ?? 'Failed to load announcements'}
        />
      )}

      {/* Edit Form */}
      {editingId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Edit Announcement</h3>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="Title"
            />
            <select
              value={editCategory}
              onChange={e => setEditCategory(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="umum">Umum</option>
              <option value="keamanan">Keamanan</option>
              <option value="keuangan">Keuangan</option>
              <option value="kegiatan">Kegiatan</option>
              <option value="darurat">Darurat</option>
            </select>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              rows={4}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="Content"
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} disabled={editLoading} variant="primary" size="sm">
                {editLoading ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button onClick={() => setEditingId(null)} variant="secondary" size="sm">Cancel</Button>
            </div>
            {editMsg && <p className="mt-1 text-xs text-red-600">{editMsg}</p>}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <div className="h-5 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-3 h-4 w-full rounded bg-gray-100 dark:bg-gray-700" />
              <div className="mt-2 h-4 w-3/4 rounded bg-gray-100 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && announcements.length === 0 && !isError && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">📭</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No announcements found</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {category ? 'Try a different category filter' : 'Create the first announcement'}
          </p>
        </div>
      )}

      {/* Announcements Cards */}
      {!isLoading && announcements.length > 0 && (
        <div className="flex flex-col gap-4">
          {announcements.map(a => (
            <article
              key={a.id}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              {/* Category accent bar */}
              <div className={`absolute left-0 top-0 h-full w-1 ${
                a.category === 'keamanan' || a.category === 'darurat'
                  ? 'bg-red-500'
                  : a.category === 'keuangan'
                    ? 'bg-amber-500'
                    : a.category === 'kegiatan'
                      ? 'bg-green-500'
                      : 'bg-blue-500'
              }`} />

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 pl-3">
                  {/* Title + Category */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {a.title}
                    </h3>
                    <Badge variant={categoryVariantMap[a.category] ?? 'default'}>
                      {a.category}
                    </Badge>
                  </div>

                  {/* Content */}
                  <p className="line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {a.content}
                  </p>

                  {/* Author + Date Footer */}
                  <div className="mt-3 flex items-center gap-3">
                    {/* Author Avatar */}
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {getInitials(a.authorName)}
                      </div>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {a.authorName}
                      </span>
                    </div>

                    <span className="text-gray-300 dark:text-gray-600">•</span>

                    {/* Date */}
                    <time className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(a.publishedAt || a.createdAt)}
                    </time>
                  </div>
                </div>

                {/* Actions */}
                {canEditDelete(a.createdBy) && (
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
                      aria-label={`Edit ${a.title}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id, a.title)}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      aria-label={`Delete ${a.title}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
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
