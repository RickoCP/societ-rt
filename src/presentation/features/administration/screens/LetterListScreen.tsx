'use client';

import { useState } from 'react';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useLetterListViewModel } from '../viewModel/useLetterListViewModel';

interface LetterRow {
  id: string;
  letterType: string;
  purpose: string;
  status: 'pending' | 'approved' | 'rejected';
  userId: string;
  rejectionReason: string | null;
  documentUrl: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

type StatusVariant = 'warning' | 'success' | 'danger' | 'default';

const statusVariantMap: Record<string, StatusVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const LETTER_TYPES = ['surat_pengantar', 'domisili', 'SKTM'] as const;

const letterTypeLabels: Record<string, string> = {
  surat_pengantar: 'Surat Pengantar',
  domisili: 'Surat Domisili',
  SKTM: 'SKTM',
};

export function LetterListScreen() {
  const [page, setPage] = useState(1);
  const { letters, totalPages, isLoading, isError, error, refetch } =
    useLetterListViewModel(page);

  // Submit form state
  const [showForm, setShowForm] = useState(false);
  const [letterType, setLetterType] = useState<string>('surat_pengantar');
  const [purpose, setPurpose] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Approve/Reject state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!purpose.trim()) {
      setSubmitError('Tujuan surat harus diisi');
      return;
    }
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      const res = await fetch('/api/administration/letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterType, purpose }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.message ?? json.code ?? 'Failed');
        return;
      }
      setSubmitSuccess(true);
      setPurpose('');
      setShowForm(false);
      refetch();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('Setujui pengajuan surat ini?')) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/administration/letters/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentUrl: `/api/administration/letters/${id}/document` }),
      });
      if (res.ok) refetch();
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Alasan penolakan:');
    if (!reason) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/administration/letters/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reason }),
      });
      if (res.ok) refetch();
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Surat Administrasi
        </h1>
        <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Tutup' : '+ Ajukan Surat'}
        </Button>
      </div>

      {/* Submit Form */}
      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Ajukan Surat Baru</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="letter-type" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Jenis Surat</label>
              <select id="letter-type" value={letterType} onChange={e => setLetterType(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                {LETTER_TYPES.map(t => <option key={t} value={t}>{letterTypeLabels[t]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="letter-purpose" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tujuan / Keperluan</label>
              <textarea id="letter-purpose" value={purpose} onChange={e => setPurpose(e.target.value)} rows={3} placeholder="Contoh: Untuk keperluan melamar pekerjaan..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            {submitError && <ErrorMessage message={submitError} />}
            {submitSuccess && <p className="text-sm text-green-700 dark:text-green-400">Pengajuan surat berhasil!</p>}
            <Button onClick={handleSubmit} disabled={submitLoading} variant="primary">
              {submitLoading ? 'Mengirim...' : 'Ajukan'}
            </Button>
          </div>
        </div>
      )}

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load letter requests'} />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      )}

      {/* Letters List */}
      {!isLoading && letters.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada pengajuan surat.</p>
      )}

      {letters.length > 0 && (
        <div className="flex flex-col gap-3">
          {(letters as LetterRow[]).map(letter => (
            <div key={letter.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {letterTypeLabels[letter.letterType] ?? letter.letterType}
                    </h3>
                    <Badge variant={statusVariantMap[letter.status] ?? 'default'}>
                      {letter.status === 'pending' ? 'Menunggu' : letter.status === 'approved' ? 'Disetujui' : 'Ditolak'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{letter.purpose}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Diajukan: {new Date(letter.createdAt).toLocaleDateString()}
                    {letter.decidedAt && ` | Diputuskan: ${new Date(letter.decidedAt).toLocaleDateString()}`}
                  </p>
                  {letter.rejectionReason && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">Alasan: {letter.rejectionReason}</p>
                  )}
                  {letter.status === 'approved' && (
                    <a href={`/api/administration/letters/${letter.id}/document`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400">
                      📄 Unduh Surat Digital
                    </a>
                  )}
                </div>
                {letter.status === 'pending' && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApprove(letter.id)}
                      disabled={actionLoading === letter.id}
                    >
                      ✓ Setujui
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleReject(letter.id)}
                      disabled={actionLoading === letter.id}
                    >
                      ✗ Tolak
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
          <span className="text-sm text-gray-600 dark:text-gray-400">{page} / {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
        </div>
      )}
    </div>
  );
}
