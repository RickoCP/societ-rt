'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import Link from 'next/link';

export default function CreateVotePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'anonymous' | 'verified'>('anonymous');
  const [deadline, setDeadline] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addOption = () => setOptions(prev => [...prev, '']);
  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, i) => i !== index));
  };
  const updateOption = (index: number, value: string) => {
    setOptions(prev => prev.map((o, i) => i === index ? value : o));
  };

  const handleSubmit = async () => {
    if (!title || !description || !deadline) {
      setError('Title, description, and deadline are required');
      return;
    }
    const validOptions = options.filter(o => o.trim().length > 0);
    if (validOptions.length < 2) {
      setError('At least 2 options are required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/voting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, options: validOptions, mode, deadline }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? json.code ?? 'Failed to create vote');
        return;
      }
      router.push(`/voting/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Vote</h1>
        <Link href="/voting" className="text-sm text-blue-600 hover:underline dark:text-blue-400">← Back</Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="vote-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
            <input id="vote-title" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Pemilihan Ketua RT Baru" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div>
            <label htmlFor="vote-desc" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <textarea id="vote-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Deskripsi voting..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="vote-mode" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Mode</label>
              <select id="vote-mode" value={mode} onChange={e => setMode(e.target.value as 'anonymous' | 'verified')} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="anonymous">Anonymous</option>
                <option value="verified">Verified</option>
              </select>
            </div>
            <div>
              <label htmlFor="vote-deadline" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Deadline</label>
              <input id="vote-deadline" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
          </div>

          {/* Options */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Options (min 2)</label>
              <Button onClick={addOption} variant="ghost" size="sm">+ Add Option</Button>
            </div>
            <div className="flex flex-col gap-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={e => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    aria-label={`Option ${i + 1}`}
                  />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)} className="text-red-500 hover:text-red-700 text-sm" aria-label={`Remove option ${i + 1}`}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <ErrorMessage message={error} />}

          <Button onClick={handleSubmit} disabled={loading} variant="primary">
            {loading ? 'Creating...' : 'Create Vote'}
          </Button>
        </div>
      </div>
    </div>
  );
}
