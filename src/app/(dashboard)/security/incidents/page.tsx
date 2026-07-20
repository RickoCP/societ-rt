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
  category?: string;
  location: string;
  status?: string;
  reportedBy: string;
  createdAt: string;
}

const severityVariant: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
};

const severityIcons: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
};

const categoryLabels: Record<string, string> = {
  theft: 'Pencurian',
  vandalism: 'Vandalisme',
  trespassing: 'Penyusupan',
  fire: 'Kebakaran',
  flood: 'Banjir',
  suspicious_activity: 'Mencurigakan',
  noise_complaint: 'Kebisingan',
  device_alert: 'Alert Perangkat',
  other: 'Lainnya',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [category, setCategory] = useState('other');
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
      const res = await fetch('/api/security/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, severity, category, location }),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json.message ?? json.code ?? 'Failed'); return; }
      setTitle(''); setDescription(''); setLocation(''); setShowForm(false);
      fetchIncidents();
    } catch (err) { setSubmitError(err instanceof Error ? err.message : 'Network error'); }
    finally { setSubmitLoading(false); }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Laporan Insiden</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Pencatatan dan pengelolaan insiden keamanan</p>
        </div>
        <Button variant="danger" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Tutup' : '🚨 Lapor Insiden'}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-800 dark:bg-red-900/20">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Lapor Insiden Baru</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="inc-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Judul</label>
              <input id="inc-title" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Pencurian, kebakaran, dll" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="inc-location" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Lokasi</label>
              <input id="inc-location" type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Blok A, parkiran, dll" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="inc-severity" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tingkat</label>
              <select id="inc-severity" value={severity} onChange={e => setSeverity(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🟠 High</option>
                <option value="critical">🔴 Critical</option>
              </select>
            </div>
            <div>
              <label htmlFor="inc-category" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Kategori</label>
              <select id="inc-category" value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="theft">Pencurian</option>
                <option value="vandalism">Vandalisme</option>
                <option value="trespassing">Penyusupan</option>
                <option value="fire">Kebakaran</option>
                <option value="flood">Banjir</option>
                <option value="suspicious_activity">Aktivitas Mencurigakan</option>
                <option value="noise_complaint">Kebisingan</option>
                <option value="device_alert">Alert Perangkat</option>
                <option value="other">Lainnya</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="inc-desc" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Deskripsi</label>
              <textarea id="inc-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Detail kejadian..." className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
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

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <div className="h-5 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-4 w-2/3 rounded bg-gray-100 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && incidents.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">🛡️</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">Tidak ada laporan insiden</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Lingkungan aman!</p>
        </div>
      )}

      {/* Incident List */}
      {!loading && incidents.length > 0 && (
        <div className="flex flex-col gap-3">
          {incidents.map(inc => (
            <article key={inc.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
              <div className={`h-1 w-full ${inc.severity === 'critical' || inc.severity === 'high' ? 'bg-red-500' : inc.severity === 'medium' ? 'bg-amber-500' : 'bg-green-500'}`} />
              <div className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-lg">{severityIcons[inc.severity] ?? '⚪'}</span>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{inc.title}</h3>
                    <Badge variant={severityVariant[inc.severity] ?? 'default'}>{inc.severity}</Badge>
                    {inc.category && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        {categoryLabels[inc.category] ?? inc.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{inc.description}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>📍 {inc.location}</span>
                    <span>•</span>
                    <span>{formatDate(inc.createdAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" onClick={async () => { const d = prompt('Edit deskripsi:', inc.description); if (!d || d === inc.description) return; await fetch(`/api/security/incidents/${inc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: d }) }); fetchIncidents(); }} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20" aria-label="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button type="button" onClick={async () => { if (!confirm(`Hapus "${inc.title}"?`)) return; await fetch(`/api/security/incidents/${inc.id}`, { method: 'DELETE' }); fetchIncidents(); }} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" aria-label="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
