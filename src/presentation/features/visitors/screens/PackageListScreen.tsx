'use client';

import { useState } from 'react';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { usePackageListViewModel } from '../viewModel/usePackageListViewModel';

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function PackageListScreen() {
  const {
    packages,
    households,
    isLoading,
    isError,
    error,
    createPackage,
    isCreating,
    createError,
    collectPackage,
  } = usePackageListViewModel();

  const [showForm, setShowForm] = useState(false);
  const [courierName, setCourierName] = useState('');
  const [description, setDescription] = useState('');
  const [recipientHousehold, setRecipientHousehold] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSubmit = async () => {
    if (!courierName || !description || !recipientHousehold) {
      setSubmitError('Semua field harus diisi');
      return;
    }
    setSubmitError(null);
    try {
      await createPackage({ courierName, description, recipientHouseholdId: recipientHousehold });
      setCourierName('');
      setDescription('');
      setShowForm(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    }
  };

  const filteredPackages = packages.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.courierName.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
  });

  const pendingCount = packages.filter(p => !p.collectedAt).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Log Paket</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Pencatatan paket masuk dan pengambilan</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Tutup' : '+ Catat Paket'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Paket</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{packages.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Belum Diambil</p>
          <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Sudah Diambil</p>
          <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">{packages.length - pendingCount}</p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Catat Paket Masuk</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="p-courier" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Kurir</label>
              <input id="p-courier" type="text" value={courierName} onChange={e => setCourierName(e.target.value)} placeholder="JNE, J&T, Grab, dll" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="p-desc" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Deskripsi</label>
              <input id="p-desc" type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Paket besar, amplop, dll" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="p-recipient" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Penerima</label>
              <select id="p-recipient" value={recipientHousehold} onChange={e => setRecipientHousehold(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="">-- Pilih --</option>
                {households.map(h => (
                  <option key={h.id} value={h.id}>{h.householdNumber} - {h.address}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleSubmit} disabled={isCreating} variant="primary">
              {isCreating ? 'Menyimpan...' : 'Catat Paket'}
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
        <input type="text" placeholder="Cari kurir atau deskripsi..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
      </div>

      {isError && <ErrorMessage message={error?.message ?? 'Failed to load packages'} />}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1">
                  <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-1 h-3 w-48 rounded bg-gray-100 dark:bg-gray-700" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && filteredPackages.length === 0 && !isError && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">📦</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">Belum ada catatan paket</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {searchQuery ? 'Coba kata kunci lain' : 'Klik "+ Catat Paket" untuk memulai'}
          </p>
        </div>
      )}

      {/* Package List */}
      {!isLoading && filteredPackages.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Daftar Paket ({filteredPackages.length})</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredPackages.map(p => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                {/* Icon */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  p.collectedAt
                    ? 'bg-green-100 dark:bg-green-900/40'
                    : 'bg-amber-100 dark:bg-amber-900/40'
                }`}>
                  <span className="text-lg">{p.collectedAt ? '✓' : '📦'}</span>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.description}</p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">{p.courierName}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>🏠 {p.recipientHousehold ?? 'Unknown'}</span>
                    <span>•</span>
                    <span>Tiba: {formatDateTime(p.arrivalTimestamp)}</span>
                    {p.collectedAt && <><span>•</span><span>Diambil: {formatDateTime(p.collectedAt)}</span></>}
                  </div>
                </div>

                {/* Status */}
                <Badge variant={p.collectedAt ? 'success' : 'warning'}>
                  {p.collectedAt ? 'Diambil' : 'Menunggu'}
                </Badge>

                {/* Action */}
                {!p.collectedAt && (
                  <button
                    type="button"
                    onClick={() => collectPackage(p.id)}
                    className="shrink-0 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                  >
                    ✓ Diambil
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
