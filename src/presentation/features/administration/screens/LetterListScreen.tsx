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

const statusLabels: Record<string, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};

const LETTER_TYPES = ['surat_pengantar', 'domisili', 'SKTM'] as const;

const letterTypeLabels: Record<string, string> = {
  surat_pengantar: 'Surat Pengantar',
  domisili: 'Surat Domisili',
  SKTM: 'SKTM',
};

const letterTypeIcons: Record<string, string> = {
  surat_pengantar: '📋',
  domisili: '🏠',
  SKTM: '📄',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function LetterListScreen() {
  const [page, setPage] = useState(1);
  const { letters, totalPages, isLoading, isError, error, refetch, canApproveReject, canEditLetter } =
    useLetterListViewModel(page);

  // Submit form state
  const [showForm, setShowForm] = useState(false);
  const [letterType, setLetterType] = useState<string>('surat_pengantar');
  const [purpose, setPurpose] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!purpose.trim()) {
      setSubmitError('Tujuan surat harus diisi');
      return;
    }
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/administration/letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterType, purpose }),
      });
      if (!res.ok) {
        const json = await res.json();
        setSubmitError(json.message ?? 'Failed');
        return;
      }
      setPurpose('');
      setShowForm(false);
      refetch();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitLoading(false);
    }
  };

  const startEdit = (letter: LetterRow) => {
    setEditingId(letter.id);
    setEditType(letter.letterType);
    setEditPurpose(letter.purpose);
    setEditMsg(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setEditLoading(true);
    setEditMsg(null);
    try {
      const res = await fetch(`/api/administration/letters/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterType: editType, purpose: editPurpose }),
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

  const handleApprove = async (id: string) => {
    if (!confirm('Setujui pengajuan surat ini?')) return;
    setActionLoading(id);
    try {
      await fetch(`/api/administration/letters/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentUrl: `/api/administration/letters/${id}/document` }),
      });
      refetch();
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Alasan penolakan:');
    if (!reason) return;
    setActionLoading(id);
    try {
      await fetch(`/api/administration/letters/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reason }),
      });
      refetch();
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Surat Administrasi
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Pengajuan dan pengelolaan surat keterangan
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Tutup' : '+ Ajukan Surat'}
        </Button>
      </div>

      {/* Submit Form */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Ajukan Surat Baru</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="letter-type" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Jenis Surat</label>
              <select id="letter-type" value={letterType} onChange={e => setLetterType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                {LETTER_TYPES.map(t => <option key={t} value={t}>{letterTypeLabels[t]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="letter-purpose" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tujuan / Keperluan</label>
              <textarea id="letter-purpose" value={purpose} onChange={e => setPurpose(e.target.value)} rows={3} placeholder="Contoh: Untuk keperluan melamar pekerjaan..." className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            {submitError && <ErrorMessage message={submitError} />}
            <Button onClick={handleSubmit} disabled={submitLoading} variant="primary">
              {submitLoading ? 'Mengirim...' : 'Ajukan'}
            </Button>
          </div>
        </div>
      )}

      {/* Edit Form */}
      {editingId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Edit Pengajuan Surat</h3>
          <div className="flex flex-col gap-3">
            <select value={editType} onChange={e => setEditType(e.target.value)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              {LETTER_TYPES.map(t => <option key={t} value={t}>{letterTypeLabels[t]}</option>)}
            </select>
            <textarea value={editPurpose} onChange={e => setEditPurpose(e.target.value)} rows={3} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" placeholder="Tujuan surat" />
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} disabled={editLoading} variant="primary" size="sm">
                {editLoading ? 'Menyimpan...' : 'Simpan'}
              </Button>
              <Button onClick={() => setEditingId(null)} variant="secondary" size="sm">Batal</Button>
            </div>
            {editMsg && <p className="mt-1 text-xs text-red-600">{editMsg}</p>}
          </div>
        </div>
      )}

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load letter requests'} />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <div className="h-5 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-3 h-4 w-2/3 rounded bg-gray-100 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && letters.length === 0 && !isError && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">📮</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">Belum ada pengajuan surat</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Klik &quot;+ Ajukan Surat&quot; untuk memulai</p>
        </div>
      )}

      {/* Letter Cards */}
      {!isLoading && letters.length > 0 && (
        <div className="flex flex-col gap-4">
          {(letters as LetterRow[]).map(letter => (
            <article
              key={letter.id}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              {/* Status accent bar */}
              <div className={`absolute left-0 top-0 h-full w-1 ${
                letter.status === 'approved'
                  ? 'bg-green-500'
                  : letter.status === 'rejected'
                    ? 'bg-red-500'
                    : 'bg-amber-500'
              }`} />

              <div className="flex items-start justify-between gap-3 p-5 pl-6">
                <div className="min-w-0 flex-1">
                  {/* Type + Status */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-lg">{letterTypeIcons[letter.letterType] ?? '📄'}</span>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {letterTypeLabels[letter.letterType] ?? letter.letterType}
                    </h3>
                    <Badge variant={statusVariantMap[letter.status] ?? 'default'}>
                      {statusLabels[letter.status] ?? letter.status}
                    </Badge>
                  </div>

                  {/* Purpose */}
                  <p className="mb-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {letter.purpose}
                  </p>

                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>Diajukan: {formatDate(letter.createdAt)}</span>
                    {letter.decidedAt && (
                      <span>Diputuskan: {formatDate(letter.decidedAt)}</span>
                    )}
                  </div>

                  {/* Rejection Reason */}
                  {letter.rejectionReason && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
                      Alasan: {letter.rejectionReason}
                    </p>
                  )}

                  {/* Download link */}
                  {letter.status === 'approved' && (
                    <a
                      href={`/api/administration/letters/${letter.id}/document`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      📄 Unduh Surat Digital
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {/* Edit button for creator on pending letters */}
                  {canEditLetter(letter.userId, letter.status) && (
                    <button
                      type="button"
                      onClick={() => startEdit(letter)}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
                      aria-label="Edit pengajuan"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}

                  {/* Approve/Reject for admins on pending letters */}
                  {letter.status === 'pending' && canApproveReject() && (
                    <>
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
                    </>
                  )}
                </div>
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
