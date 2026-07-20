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

export function ResidentListScreen() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { households, totalPages, isLoading, isError, error, refetch } =
    useHouseholdListViewModel(page, search);

  const handleDeleteHousehold = async (householdId: string, hhNumber: string) => {
    if (!confirm(`Hapus rumah tangga "${hhNumber}" beserta semua warganya?`)) return;
    try {
      const res = await fetch(`/api/residents/households/${householdId}`, { method: 'DELETE' });
      if (res.ok) {
        setResidents([]);
        if (showResidents) handleFetchResidents();
        refetch();
      }
    } catch { /* ignore */ }
  };

  const householdColumns: DataTableColumn<HouseholdRow>[] = [
    {
      key: 'householdNumber',
      header: 'No. KK',
      render: row => (
        <a href={`/residents/${row.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
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
          aria-label={`Delete household ${row.householdNumber}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      ),
    },
  ];

  // Add Household form
  const [showAddHousehold, setShowAddHousehold] = useState(false);
  const [hhNumber, setHhNumber] = useState('');
  const [hhAddress, setHhAddress] = useState('');
  const [hhBlock, setHhBlock] = useState('');
  const [hhLoading, setHhLoading] = useState(false);
  const [hhError, setHhError] = useState<string | null>(null);
  const [hhSuccess, setHhSuccess] = useState<string | null>(null);

  // Add Resident form
  const [showAddResident, setShowAddResident] = useState(false);
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
  const [showResidents, setShowResidents] = useState(false);
  const [residents, setResidents] = useState<ResidentRow[]>([]);
  const [resListLoading, setResListLoading] = useState(false);
  const [resSearchQuery, setResSearchQuery] = useState('');

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

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
        body: JSON.stringify({ householdNumber: hhNumber, address: hhAddress, block: hhBlock }),
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
    } catch { /* ignore */ }
    finally { setResListLoading(false); }
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
          prev.map(r => r.id === residentId ? { ...r, status: newStatus } : r),
        );
      }
    } catch { /* ignore */ }
  };

  const handleDeleteResident = async (residentId: string, name: string) => {
    if (!confirm(`Hapus warga "${name}"?`)) return;
    try {
      const res = await fetch(`/api/residents/${residentId}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) {
        setResidents(prev => prev.filter(r => r.id !== residentId));
        refetch();
      }
    } catch { /* ignore */ }
  };

  const handleExport = () => {
    window.open('/api/residents/export', '_blank');
  };

  const totalResidents = households.reduce((sum, h) => sum + h.residentCount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Manajemen Warga
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Kelola data rumah tangga dan warga RT
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => { setShowAddHousehold(!showAddHousehold); setShowAddResident(false); }}>
            {showAddHousehold ? 'Tutup' : '+ Rumah Tangga'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => { setShowAddResident(!showAddResident); setShowAddHousehold(false); }}>
            {showAddResident ? 'Tutup' : '+ Warga'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setShowResidents(!showResidents); if (!showResidents) handleFetchResidents(); }}>
            {showResidents ? 'Sembunyikan' : '👥 Lihat Warga'}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            📥 Export
          </Button>
          <Button variant="secondary" size="sm">
            <a href="/residents/import">📤 Import</a>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Rumah Tangga</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{households.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Warga</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{totalResidents}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Blok</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
            {[...new Set(households.map(h => h.block).filter(Boolean))].length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Rata-rata/KK</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
            {households.length > 0 ? Math.round(totalResidents / households.length * 10) / 10 : 0}
          </p>
        </div>
      </div>

      {/* Add Household Form */}
      {showAddHousehold && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Tambah Rumah Tangga (KK)</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="hh-number" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">No. KK</label>
              <input id="hh-number" type="text" value={hhNumber} onChange={e => setHhNumber(e.target.value)} placeholder="3201234567890001" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div className="flex-1">
              <label htmlFor="hh-address" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Alamat</label>
              <input id="hh-address" type="text" value={hhAddress} onChange={e => setHhAddress(e.target.value)} placeholder="Jl. Mawar No. 1" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div className="w-full sm:w-32">
              <label htmlFor="hh-block" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Blok</label>
              <input id="hh-block" type="text" value={hhBlock} onChange={e => setHhBlock(e.target.value)} placeholder="A1" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <Button onClick={handleAddHousehold} disabled={hhLoading} variant="primary">
              {hhLoading ? 'Membuat...' : 'Tambah'}
            </Button>
          </div>
          {hhError && <div className="mt-3"><ErrorMessage message={hhError} /></div>}
          {hhSuccess && <p className="mt-3 text-sm font-medium text-green-700 dark:text-green-400">✓ {hhSuccess}</p>}
        </div>
      )}

      {/* Add Resident Form */}
      {showAddResident && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm dark:border-green-800 dark:bg-green-900/20">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Tambah Warga</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="res-hh-id" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Rumah Tangga (KK)</label>
              <select id="res-hh-id" value={resHouseholdId} onChange={e => setResHouseholdId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="">-- Pilih KK --</option>
                {households.map(h => (<option key={h.id} value={h.id}>{h.householdNumber} — {h.address}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="res-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Nama</label>
              <input id="res-name" type="text" value={resName} onChange={e => setResName(e.target.value)} placeholder="Budi Santoso" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="res-nik" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">NIK (16 digit)</label>
              <input id="res-nik" type="text" value={resNik} onChange={e => setResNik(e.target.value)} placeholder="3201234567890001" maxLength={16} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="res-dob" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tanggal Lahir</label>
              <input id="res-dob" type="date" value={resDob} onChange={e => setResDob(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="res-gender" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Jenis Kelamin</label>
              <select id="res-gender" value={resGender} onChange={e => setResGender(e.target.value as 'male' | 'female')} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="male">Laki-laki</option>
                <option value="female">Perempuan</option>
              </select>
            </div>
            <div>
              <label htmlFor="res-phone" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Telepon</label>
              <input id="res-phone" type="text" value={resPhone} onChange={e => setResPhone(e.target.value)} placeholder="08123456789" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="res-status" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
              <select id="res-status" value={resStatus} onChange={e => setResStatus(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleAddResident} disabled={resLoading} variant="primary">
              {resLoading ? 'Menambahkan...' : 'Tambah Warga'}
            </Button>
          </div>
          {resError && <div className="mt-3"><ErrorMessage message={resError} /></div>}
          {resSuccess && <p className="mt-3 text-sm font-medium text-green-700 dark:text-green-400">✓ {resSuccess}</p>}
        </div>
      )}

      {/* Residents List */}
      {showResidents && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Daftar Warga</h2>
          </div>
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-700">
            <div className="relative flex-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={resSearchQuery} onChange={e => setResSearchQuery(e.target.value)} placeholder="Cari nama warga..." className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" onKeyDown={e => e.key === 'Enter' && handleFetchResidents()} />
            </div>
            <Button onClick={handleFetchResidents} disabled={resListLoading} variant="primary" size="sm">
              {resListLoading ? '...' : 'Cari'}
            </Button>
          </div>
          {residents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="text-3xl">👥</span>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Belum ada data warga</p>
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
                    <tr key={r.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{r.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{r.nik}</td>
                      <td className="px-5 py-3">
                        <Badge variant={r.gender === 'male' ? 'info' : 'warning'}>
                          {r.gender === 'male' ? '♂ L' : '♀ P'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{r.phone || '-'}</td>
                      <td className="px-5 py-3">
                        <select value={r.status} onChange={e => handleUpdateStatus(r.id, e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" aria-label={`Status for ${r.name}`}>
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <button type="button" onClick={() => handleDeleteResident(r.id, r.name)} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400" aria-label={`Delete ${r.name}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Households Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Daftar Rumah Tangga</h2>
          <div className="relative w-64">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Cari KK..." value={search} onChange={handleSearch} className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
        </div>

        {isError && (
          <div className="px-5 pt-4">
            <ErrorMessage message={error?.message ?? 'Failed to load households'} />
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
      </div>
    </div>
  );
}
