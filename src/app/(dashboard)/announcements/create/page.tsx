'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import Link from 'next/link';

const CATEGORIES = ['umum', 'keamanan', 'keuangan', 'kegiatan', 'darurat'] as const;

export default function CreateAnnouncementPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('umum');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title || !content) {
      setError('Title and content are required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? json.code ?? 'Failed to create announcement');
        return;
      }
      router.push('/announcements');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Announcement</h1>
        <Link href="/announcements" className="text-sm text-blue-600 hover:underline dark:text-blue-400">← Back</Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="ann-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
            <input id="ann-title" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Judul pengumuman" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label htmlFor="ann-cat" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
            <select id="ann-cat" value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ann-content" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Content</label>
            <textarea id="ann-content" value={content} onChange={e => setContent(e.target.value)} rows={6} placeholder="Isi pengumuman..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>

          {error && <ErrorMessage message={error} />}

          <Button onClick={handleSubmit} disabled={loading} variant="primary">
            {loading ? 'Creating...' : 'Publish Announcement'}
          </Button>
        </div>
      </div>
    </div>
  );
}
