'use client';

import { useState, useCallback } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { Button } from '@components/atoms/Button';
import { Badge } from '@components/atoms/Badge';
import { useHouseholdListViewModel } from '../viewModel/useHouseholdListViewModel';

interface HouseholdRow {
  id: string;
  householdNumber: string;
  address: string;
  block: string;
  headOfHousehold: string;
  residentCount: number;
  createdAt: string;
}

interface ResidentRow {
  id: string;
  name: string;
  nik: string;
  status: string;
  gender: string;
  phone: string;
}

const STATUS_OPTIONS = ['tetap', 'kontrak', 'kos', 'pindah'] as const;

type ViewMode = 'households' | 'residents';

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';
const LABEL_CLASS =
  'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

export function ResidentListScreen() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { households, totalPages, isLoading, isError, error, refetch } =
    useHouseholdListViewModel(page, search);

  // Which list is on screen.
  const [viewMode, setViewMode] = useState<ViewMode>('households');
  // Which add-form drawer is open (null = none).
  const [activeForm, setActiveForm] = useState<'household' | 'resident' | null>(
    null,
  );

  const handleDeleteHousehold = async (
    householdId: string,
    hhNumber: string,
  ) => {
    if (!confirm(`Hapus rumah tangga "${hhNumber}" beserta semua warganya?`))
      return;
    try {
      const res = await fetch(`/api/residents/households/${householdId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setResidents([]);
        if (viewMode === 'residents') handleFetchResidents();
        refetch();
      }
    } catch {
      /* ignore */
    }
  };

  const householdColumns: DataTableColumn<HouseholdRow>[] = [
    {
      key: 'householdNumber',
      header: 'No. KK',
      render: row => (
        <a
          href={`/residents/${row.id}`}
          className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          {row.householdNumber}
        </a>
      ),
    },
    { key: 'headOfHousehold', header: 'Kepala Keluarga' },
    { key: 'address', header: 'Alamat' },
    { key: 'block', header: 'Blok' },
    {
      key: 'residentCount',
      header: 'Anggota',
      render: row => (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          👥 {row.residentCount}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: '',
      render: row => (
        <button
          type="button"
          onClick={() => handleDeleteHousehold(row.id, row.householdNumber)}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          aria-label={`Delete household ${row.householdNumber}`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      ),
    },
  ];

  // Add Household form
  const [hhNumber, setHhNumber] = useState('');
  const [hhAddress, setHhAddress] = useState('');
  const [hhBlock, setHhBlock] = useState('');
  const [hhLoading, setHhLoading] = useState(false);
  const [hhError, setHhError] = useState<string | null>(null);
  const [hhSuccess, setHhSuccess] = useState<string | null>(null);

  // Add Resident form
  const [resHouseholdId, setResHouseholdId] = useState('');
  const [resName, setResName] = useState('');
  const [resNik, setResNik] = useState('');
  const [resDob, setResDob] = useState('');
  const [resGender, setResGender] = useState<'male' | 'female'>('male');
  const [resPhone, setResPhone] = useState('');
  const [resStatus, setResStatus] = useState<string>('tetap');
  const [resLoading, setResLoading] = useState(false);
  const [resError, setResError] = useState<string | null>(null);
  const [resSuccess, setResSuccess] = useState<string | null>(null);

  // Residents list
  const [residents, setResidents] = useState<ResidentRow[]>([]);
  const [resListLoading, setResListLoading] = useState(false);
  const [resSearchQuery, setResSearchQuery] = useState('');

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const toggleForm = (form: 'household' | 'resident') => {
    setActiveForm(prev => (prev === form ? null : form));
  };

  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'residents' && residents.length === 0) handleFetchResidents();
  };

  const handleAddHousehold = async () => {
    if (!hhNumber || !hhAddress) {
      setHhError('Nomor KK dan alamat wajib diisi');
      return;
    }
    setHhLoading(true);
    setHhError(null);
    setHhSuccess(null);
    try {
      const res = await fetch('/api/residents/households', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdNumber: hhNumber,
          address: hhAddress,
          block: hhBlock,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setHhError(json.message ?? json.code ?? 'Failed');
        return;
      }
      setHhSuccess(`Berhasil dibuat: ${json.data.householdNumber}`);
      setHhNumber('');
      setHhAddress('');
      setHhBlock('');
      refetch();
    } catch (err) {
      setHhError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setHhLoading(false);
    }
  };

  const handleAddResident = async () => {
    if (!resHouseholdId || !resName || !resNik || !resDob) {
      setResError('KK, nama, NIK, dan tanggal lahir wajib diisi');
      return;
    }
    setResLoading(true);
    setResError(null);
    setResSuccess(null);
    try {
      const res = await fetch('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdId: resHouseholdId,
          name: resName,
          nik: resNik,
          dateOfBirth: resDob,
          gender: resGender,
          phone: resPhone || undefined,
          status: resStatus,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResError(json.message ?? json.code ?? 'Failed');
        return;
      }
      setResSuccess(`Berhasil ditambahkan: ${json.data.name}`);
      setResName('');
      setResNik('');
      setResDob('');
      setResPhone('');
      refetch();
    } catch (err) {
      setResError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setResLoading(false);
    }
  };

  const handleFetchResidents = async () => {
    setResListLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (resSearchQuery) params.set('search', resSearchQuery);
      const res = await fetch(`/api/residents?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setResidents(json.data ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setResListLoading(false);
    }
  };

  const handleUpdateStatus = async (residentId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/residents/${residentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setResidents(prev =>
          prev.map(r => (r.id === residentId ? { ...r, status: newStatus } : r)),
        );
      }
    } catch {
      /* ignore */
    }
  };

  const handleDeleteResident = async (residentId: string, name: string) => {
    if (!confirm(`Hapus warga "${name}"?`)) return;
    try {
      const res = await fetch(`/api/residents/${residentId}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 404) {
        setResidents(prev => prev.filter(r => r.id !== residentId));
        refetch();
      }
    } catch {
      /* ignore */
    }
  };

  const handleExport = () => {
    window.open('/api/residents/export', '_blank');
  };

  const totalResidents = households.reduce(
    (sum, h) => sum + h.residentCount,
    0,
  );
  const blockCount = [
    ...new Set(households.map(h => h.block).filter(Boolean)),
  ].length;
  const avgPerHousehold =
    households.length > 0
      ? Math.round((totalResidents / households.length) * 10) / 10
      : 0;

  const stats = [
    { label: 'Rumah Tangga', value: households.length, icon: '🏠', accent: 'from-blue-500 to-indigo-500' },
    { label: 'Total Warga', value: totalResidents, icon: '👥', accent: 'from-emerald-500 to-teal-500' },
    { label: 'Blok', value: blockCount, icon: '📍', accent: 'from-amber-500 to-orange-500' },
    { label: 'Rata-rata/KK', value: avgPerHousehold, icon: '📊', accent: 'from-fuchsia-500 to-pink-500' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Manajemen Warga
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Kelola data rumah tangga dan warga RT
          </p>
        </div>

        {/* Action bar: grouped add actions + utility actions.
            Mobile: add-group on one row, Export/Import on the next.
            sm+: everything inline. */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => toggleForm('household')}
              aria-pressed={activeForm === 'household'}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none ${
                activeForm === 'household'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}>
              <span className="text-base leading-none">🏠</span>
              Rumah Tangga
            </button>
            <button
              type="button"
              onClick={() => toggleForm('resident')}
              aria-pressed={activeForm === 'resident'}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none ${
                activeForm === 'resident'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}>
              <span className="text-base leading-none">➕</span>
              Warga
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={handleExport}
              className="flex-1 sm:flex-none">
              📥 Export
            </Button>
            <Button variant="secondary" size="md" className="flex-1 sm:flex-none">
              <a href="/residents/import">📤 Import</a>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(s => (
          <div
            key={s.label}
            className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {s.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {s.value}
                </p>
              </div>
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${s.accent} text-lg text-white shadow-sm`}>
                {s.icon}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Household Form */}
      {activeForm === 'household' && (
        <div className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm dark:border-blue-900/60 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-3 dark:border-blue-900/40 dark:bg-blue-900/20">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <span>🏠</span> Tambah Rumah Tangga (KK)
            </h2>
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-600 dark:hover:bg-gray-700"
              aria-label="Tutup form rumah tangga">
              ✕
            </button>
          </div>
          <div className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="hh-number" className={LABEL_CLASS}>
                  No. KK
                </label>
                <input
                  id="hh-number"
                  type="text"
                  value={hhNumber}
                  onChange={e => setHhNumber(e.target.value)}
                  placeholder="3201234567890001"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex-1">
                <label htmlFor="hh-address" className={LABEL_CLASS}>
                  Alamat
                </label>
                <input
                  id="hh-address"
                  type="text"
                  value={hhAddress}
                  onChange={e => setHhAddress(e.target.value)}
                  placeholder="Jl. Mawar No. 1"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="w-full sm:w-32">
                <label htmlFor="hh-block" className={LABEL_CLASS}>
                  Blok
                </label>
                <input
                  id="hh-block"
                  type="text"
                  value={hhBlock}
                  onChange={e => setHhBlock(e.target.value)}
                  placeholder="A1"
                  className={INPUT_CLASS}
                />
              </div>
              <Button
                onClick={handleAddHousehold}
                disabled={hhLoading}
                loading={hhLoading}
                variant="primary">
                {hhLoading ? 'Membuat...' : 'Tambah'}
              </Button>
            </div>
            {hhError && (
              <div className="mt-3">
                <ErrorMessage message={hhError} />
              </div>
            )}
            {hhSuccess && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
                ✓ {hhSuccess}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Add Resident Form */}
      {activeForm === 'resident' && (
        <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900/60 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50 px-5 py-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <span>👤</span> Tambah Warga
            </h2>
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-600 dark:hover:bg-gray-700"
              aria-label="Tutup form warga">
              ✕
            </button>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="res-hh-id" className={LABEL_CLASS}>
                  Rumah Tangga (KK)
                </label>
                <select
                  id="res-hh-id"
                  value={resHouseholdId}
                  onChange={e => setResHouseholdId(e.target.value)}
                  className={INPUT_CLASS}>
                  <option value="">-- Pilih KK --</option>
                  {households.map(h => (
                    <option key={h.id} value={h.id}>
                      {h.householdNumber} — {h.address}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="res-name" className={LABEL_CLASS}>
                  Nama
                </label>
                <input
                  id="res-name"
                  type="text"
                  value={resName}
                  onChange={e => setResName(e.target.value)}
                  placeholder="Budi Santoso"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="res-nik" className={LABEL_CLASS}>
                  NIK (16 digit)
                </label>
                <input
                  id="res-nik"
                  type="text"
                  value={resNik}
                  onChange={e => setResNik(e.target.value)}
                  placeholder="3201234567890001"
                  maxLength={16}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="res-dob" className={LABEL_CLASS}>
                  Tanggal Lahir
                </label>
                <input
                  id="res-dob"
                  type="date"
                  value={resDob}
                  onChange={e => setResDob(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="res-gender" className={LABEL_CLASS}>
                  Jenis Kelamin
                </label>
                <select
                  id="res-gender"
                  value={resGender}
                  onChange={e =>
                    setResGender(e.target.value as 'male' | 'female')
                  }
                  className={INPUT_CLASS}>
                  <option value="male">Laki-laki</option>
                  <option value="female">Perempuan</option>
                </select>
              </div>
              <div>
                <label htmlFor="res-phone" className={LABEL_CLASS}>
                  Telepon
                </label>
                <input
                  id="res-phone"
                  type="text"
                  value={resPhone}
                  onChange={e => setResPhone(e.target.value)}
                  placeholder="08123456789"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="res-status" className={LABEL_CLASS}>
                  Status
                </label>
                <select
                  id="res-status"
                  value={resStatus}
                  onChange={e => setResStatus(e.target.value)}
                  className={INPUT_CLASS}>
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <Button
                onClick={handleAddResident}
                disabled={resLoading}
                loading={resLoading}
                variant="primary">
                {resLoading ? 'Menambahkan...' : 'Tambah Warga'}
              </Button>
            </div>
            {resError && (
              <div className="mt-3">
                <ErrorMessage message={resError} />
              </div>
            )}
            {resSuccess && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
                ✓ {resSuccess}
              </p>
            )}
          </div>
        </div>
      )}

      {/* List panel with view switcher */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {/* View switcher tabs + contextual search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div
            role="tablist"
            aria-label="Pilih tampilan data"
            className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-900/50">
            <button
              role="tab"
              type="button"
              aria-selected={viewMode === 'households'}
              onClick={() => switchView('households')}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'households'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}>
              🏠 Rumah Tangga
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={viewMode === 'residents'}
              onClick={() => switchView('residents')}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'residents'
                  ? 'bg-white text-emerald-600 shadow-sm dark:bg-gray-700 dark:text-emerald-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}>
              👥 Warga
            </button>
          </div>

          {viewMode === 'households' ? (
            <div className="relative w-full sm:w-64">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Cari KK..."
                value={search}
                onChange={handleSearch}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          ) : (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={resSearchQuery}
                  onChange={e => setResSearchQuery(e.target.value)}
                  placeholder="Cari nama warga..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  onKeyDown={e => e.key === 'Enter' && handleFetchResidents()}
                />
              </div>
              <Button
                onClick={handleFetchResidents}
                disabled={resListLoading}
                loading={resListLoading}
                variant="primary"
                size="sm">
                {resListLoading ? '...' : 'Cari'}
              </Button>
            </div>
          )}
        </div>

        {/* Households view */}
        {viewMode === 'households' && (
          <>
            {isError && (
              <div className="px-5 pt-4">
                <ErrorMessage
                  message={error?.message ?? 'Failed to load households'}
                />
              </div>
            )}
            <DataTable<HouseholdRow>
              columns={householdColumns}
              data={households}
              loading={isLoading}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              rowKey={row => row.id}
              emptyMessage="Belum ada data rumah tangga"
            />
          </>
        )}

        {/* Residents view */}
        {viewMode === 'residents' &&
          (resListLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <span className="text-3xl">⏳</span>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Memuat data warga...
              </p>
            </div>
          ) : residents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <span className="text-4xl">👥</span>
              <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                Belum ada data warga
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Tambahkan warga melalui tombol "Warga" di atas
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Nama</th>
                    <th className="px-5 py-3">NIK</th>
                    <th className="px-5 py-3">Gender</th>
                    <th className="px-5 py-3">Telepon</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {residents.map(r => (
                    <tr
                      key={r.id}
                      className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {r.name}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {r.nik}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={r.gender === 'male' ? 'info' : 'warning'}>
                          {r.gender === 'male' ? '♂ L' : '♀ P'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                        {r.phone || '-'}
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={r.status}
                          onChange={e =>
                            handleUpdateStatus(r.id, e.target.value)
                          }
                          className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          aria-label={`Status for ${r.name}`}>
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => handleDeleteResident(r.id, r.name)}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                          aria-label={`Delete ${r.name}`}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    </div>
  );
}
