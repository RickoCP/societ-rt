'use client';

import { useState } from 'react';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { usePackageListViewModel } from '../viewModel/usePackageListViewModel';

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

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [courierName, setCourierName] = useState('');
  const [description, setDescription] = useState('');
  const [recipientHousehold, setRecipientHousehold] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Search
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Package Log</h1>
        <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Tutup' : '+ Catat Paket'}
        </Button>
      </div>

      {/* Add Package Form */}
      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Catat Paket Masuk</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="p-courier" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Kurir</label>
              <input id="p-courier" type="text" value={courierName} onChange={e => setCourierName(e.target.value)} placeholder="JNE, J&T, Grab, dll" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="p-desc" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Deskripsi</label>
              <input id="p-desc" type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Paket besar, amplop, dll" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="p-recipient" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Penerima (Household)</label>
              <select id="p-recipient" value={recipientHousehold} onChange={e => setRecipientHousehold(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="">-- Pilih --</option>
                {households.map(h => (
                  <option key={h.id} value={h.id}>{h.householdNumber} — {h.address}</option>
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
      <input
        type="text"
        placeholder="Cari kurir atau deskripsi..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />

      {isError && <ErrorMessage message={error?.message ?? 'Failed to load packages'} />}

      {/* Package List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : filteredPackages.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada catatan paket.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3">Kurir</th>
                <th className="px-4 py-3">Deskripsi</th>
                <th className="px-4 py-3">Penerima</th>
                <th className="px-4 py-3">Waktu Tiba</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredPackages.map(p => (
                <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{p.courierName}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.description}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    <div>{p.recipientHousehold}</div>
                    <div className="text-xs text-gray-400">{p.recipientAddress}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(p.arrivalTimestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {p.collectedAt ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">Diambil</span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Belum Diambil</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!p.collectedAt && (
                      <button
                        type="button"
                        onClick={() => collectPackage(p.id)}
                        className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                      >
                        ✓ Sudah Diambil
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">Total: {filteredPackages.length} paket</p>
    </div>
  );
}
