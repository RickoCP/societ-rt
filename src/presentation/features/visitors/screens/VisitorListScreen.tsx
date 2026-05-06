'use client';

import { useState } from 'react';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useVisitorListViewModel } from '../viewModel/useVisitorListViewModel';

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
  } = useVisitorListViewModel();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [destHousehold, setDestHousehold] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredVisitors = visitors.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return v.visitorName.toLowerCase().includes(q) || v.purpose.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Visitor Log</h1>
        <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Tutup' : '+ Catat Tamu'}
        </Button>
      </div>

      {/* Add Visitor Form */}
      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Catat Tamu Baru</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="v-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Nama Tamu</label>
              <input id="v-name" type="text" value={visitorName} onChange={e => setVisitorName(e.target.value)} placeholder="Nama lengkap" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="v-purpose" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Keperluan</label>
              <input id="v-purpose" type="text" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Tujuan berkunjung" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="v-dest" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tujuan (Household)</label>
              <select id="v-dest" value={destHousehold} onChange={e => setDestHousehold(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="">-- Pilih --</option>
                {households.map(h => (
                  <option key={h.id} value={h.id}>{h.householdNumber} — {h.address}</option>
                ))}
              </select>
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
      <input
        type="text"
        placeholder="Cari nama tamu atau keperluan..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />

      {isError && <ErrorMessage message={error?.message ?? 'Failed to load visitors'} />}

      {/* Visitor List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : filteredVisitors.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada catatan tamu.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3">Nama Tamu</th>
                <th className="px-4 py-3">Keperluan</th>
                <th className="px-4 py-3">Masuk</th>
                <th className="px-4 py-3">Keluar</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredVisitors.map(v => (
                <tr key={v.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{v.visitorName}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.purpose}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(v.entryTimestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{v.exitTimestamp ? new Date(v.exitTimestamp).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={v.exitTimestamp ? 'default' : 'success'}>
                      {v.exitTimestamp ? 'Sudah Keluar' : 'Masih di Lokasi'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {!v.exitTimestamp && (
                      <button
                        type="button"
                        onClick={() => checkoutVisitor(v.id)}
                        className="rounded bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
                      >
                        Checkout
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">Total: {filteredVisitors.length} tamu</p>
    </div>
  );
}
