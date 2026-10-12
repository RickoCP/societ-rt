'use client';

import { useState } from 'react';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { SearchableSelect } from '@components/molecules/SearchableSelect';
import { useVisitorListViewModel } from '../viewModel/useVisitorListViewModel';

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VisitorListScreen() {
  const {
    visitors,
    households,
    isLoading,
    isError,
    error,
    createVisitor,
    isCreating,
    createError,
    checkoutVisitor,
    deleteVisitor,
    isDeleting,
  } = useVisitorListViewModel();

  const [showForm, setShowForm] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [destHousehold, setDestHousehold] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!visitorName || !purpose || !destHousehold) {
      setSubmitError('Semua field harus diisi');
      return;
    }
    setSubmitError(null);
    try {
      await createVisitor({ visitorName, purpose, destinationHouseholdId: destHousehold });
      setVisitorName('');
      setPurpose('');
      setShowForm(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteError(null);
    try {
      await deleteVisitor(id);
      setDeleteConfirmId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Gagal menghapus');
    }
  };

  const filteredVisitors = visitors.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return v.visitorName.toLowerCase().includes(q) || v.purpose.toLowerCase().includes(q);
  });

  const activeVisitors = visitors.filter(v => !v.exitTimestamp).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Log Tamu</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Pencatatan tamu masuk dan keluar</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Tutup' : '+ Catat Tamu'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Tamu</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{visitors.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Masih di Lokasi</p>
          <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">{activeVisitors}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Sudah Keluar</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{visitors.length - activeVisitors}</p>
        </div>
      </div>

      {/* Add Visitor Form */}
      {showForm && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm dark:border-green-800 dark:bg-green-900/20">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Catat Tamu Baru</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="v-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Nama Tamu</label>
              <input id="v-name" type="text" value={visitorName} onChange={e => setVisitorName(e.target.value)} placeholder="Nama lengkap" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="v-purpose" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Keperluan</label>
              <input id="v-purpose" type="text" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Tujuan berkunjung" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="v-dest" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tujuan (Rumah)</label>
              <SearchableSelect
                id="v-dest"
                value={destHousehold}
                onChange={setDestHousehold}
                options={households.map(h => ({
                  value: h.id,
                  label: `${h.householdNumber} - ${h.address}`,
                }))}
                placeholder="-- Pilih --"
                searchPlaceholder="Cari rumah…"
                noResultsText="Rumah tidak ditemukan"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleSubmit} disabled={isCreating} variant="primary">
              {isCreating ? 'Menyimpan...' : 'Catat Masuk'}
            </Button>
          </div>
          {(submitError ?? createError?.message) && (
            <div className="mt-3"><ErrorMessage message={submitError ?? createError?.message ?? 'Error'} /></div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Cari nama tamu atau keperluan..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {isError && <ErrorMessage message={error?.message ?? 'Failed to load visitors'} />}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1">
                  <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-1 h-3 w-48 rounded bg-gray-100 dark:bg-gray-700" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredVisitors.length === 0 && !isError && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">🚶</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">Belum ada catatan tamu</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {searchQuery ? 'Coba kata kunci lain' : 'Klik "+ Catat Tamu" untuk memulai'}
          </p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                <span className="text-lg">🗑️</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Hapus Catatan Tamu?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>
            
            {deleteError && (
              <div className="mb-4">
                <ErrorMessage message={deleteError} />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmId(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={isDeleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visitor Cards */}
      {!isLoading && filteredVisitors.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Daftar Tamu ({filteredVisitors.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredVisitors.map(v => (
              <div key={v.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                {/* Icon */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  v.exitTimestamp
                    ? 'bg-gray-100 dark:bg-gray-700'
                    : 'bg-green-100 dark:bg-green-900/40'
                }`}>
                  <span className="text-lg">{v.exitTimestamp ? '✓' : '🚶'}</span>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{v.visitorName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{v.purpose}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                    <span>Masuk: {formatDateTime(v.entryTimestamp)}</span>
                    {v.exitTimestamp && <span>Keluar: {formatDateTime(v.exitTimestamp)}</span>}
                  </div>
                </div>

                {/* Status */}
                <Badge variant={v.exitTimestamp ? 'default' : 'success'}>
                  {v.exitTimestamp ? 'Keluar' : '● Di Lokasi'}
                </Badge>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {!v.exitTimestamp && (
                    <button
                      type="button"
                      onClick={() => checkoutVisitor(v.id)}
                      className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400"
                    >
                      Checkout
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(v.id)}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                    title="Hapus catatan tamu"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
