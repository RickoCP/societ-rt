'use client';

import { useState, useEffect } from 'react';
import { Button } from '@components/atoms/Button';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';

interface IncidentRow {
  id: string;
  title: string;
  description: string;
  severity: string;
  location: string;
  reportedBy: string;
  createdAt: string;
}

const severityVariant: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [location, setLocation] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/security/incidents');
      const json = await res.json();
      if (res.ok) setIncidents(json.data ?? []);
      else setError(json.message ?? 'Failed');
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchIncidents(); }, []);

  const handleSubmit = async () => {
    if (!title || !description || !location) {
      setSubmitError('Semua field harus diisi');
      return;
    }
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const now = new Date();
      const res = await fetch('/api/security/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          severityLevel: severity,
          location,
          date: now.toISOString(),
          time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.message ?? json.code ?? 'Failed');
        return;
      }
      setTitle('');
      setDescription('');
      setLocation('');
      setShowForm(false);
      fetchIncidents();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Incident Reports</h1>
        <Button variant="danger" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Tutup' : '+ Lapor Insiden'}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Lapor Insiden Baru</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="inc-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Judul</label>
              <input id="inc-title" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Pencurian, kebakaran, dll" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="inc-location" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Lokasi</label>
              <input id="inc-location" type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Blok A, parkiran, dll" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="inc-severity" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tingkat</label>
              <select id="inc-severity" value={severity} onChange={e => setSeverity(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="inc-desc" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Deskripsi</label>
              <textarea id="inc-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Detail kejadian..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleSubmit} disabled={submitLoading} variant="danger">
              {submitLoading ? 'Mengirim...' : 'Laporkan'}
            </Button>
          </div>
          {submitError && <div className="mt-3"><ErrorMessage message={submitError} /></div>}
        </div>
      )}

      {error && <ErrorMessage message={error} />}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
        </div>
      ) : incidents.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada laporan insiden.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {incidents.map(inc => (
            <div key={inc.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{inc.title}</h3>
                    <Badge variant={severityVariant[inc.severity] ?? 'default'}>{inc.severity}</Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{inc.description}</p>
                  <p className="mt-1 text-xs text-gray-400">📍 {inc.location} | {new Date(inc.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      const newDesc = prompt('Edit deskripsi:', inc.description);
                      if (newDesc === null || newDesc === inc.description) return;
                      await fetch(`/api/security/incidents/${inc.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ description: newDesc }),
                      });
                      fetchIncidents();
                    }}
                    className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Hapus laporan "${inc.title || inc.description.slice(0, 30)}"?`)) return;
                      await fetch(`/api/security/incidents/${inc.id}`, { method: 'DELETE' });
                      fetchIncidents();
                    }}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
