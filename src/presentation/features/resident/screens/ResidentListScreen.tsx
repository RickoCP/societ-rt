'use client';

import { useState, useCallback } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { SearchBar } from '@components/molecules/SearchBar';
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
    if (!confirm(`Delete household "${hhNumber}" and all its residents?`)) return;
    try {
      const res = await fetch(`/api/residents/households/${householdId}`, { method: 'DELETE' });
      if (res.ok) {
        // Clear residents list since some may have been cascade-deleted
        setResidents([]);
        if (showResidents) handleFetchResidents();
        refetch();
      }
    } catch { /* ignore */ }
  };

  const householdColumns: DataTableColumn<HouseholdRow>[] = [
    {
      key: 'id',
      header: 'ID',
      render: row => (
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(row.id); }}
          className="max-w-[120px] truncate font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
          title={`Click to copy: ${row.id}`}
          aria-label={`Copy ID ${row.id}`}
        >
          {row.id.slice(0, 8)}...
        </button>
      ),
    },
    { key: 'householdNumber', header: 'No. KK' },
    { key: 'headOfHousehold', header: 'Head of Household' },
    { key: 'address', header: 'Address' },
    { key: 'block', header: 'Block' },
    {
      key: 'residentCount',
      header: 'Residents',
      render: row => <span>{row.residentCount}</span>,
    },
    {
      key: 'createdAt',
      header: 'Actions',
      render: row => (
        <button
          type="button"
          onClick={() => handleDeleteHousehold(row.id, row.householdNumber)}
          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          aria-label={`Delete household ${row.householdNumber}`}
        >
          Delete
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

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(1);
  }, []);

  const handleAddHousehold = async () => {
    if (!hhNumber || !hhAddress) {
      setHhError('Household number and address are required');
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
      setHhSuccess(`Household created: ${json.data.householdNumber} (ID: ${json.data.id})`);
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
      setResError('Household ID, name, NIK, and date of birth are required');
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
      setResSuccess(`Resident added: ${json.data.name} (ID: ${json.data.id})`);
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
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const res = await fetch(`/api/residents/${residentId}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) {
        // Remove from local state (404 means already deleted via cascade)
        setResidents(prev => prev.filter(r => r.id !== residentId));
        refetch();
      }
    } catch { /* ignore */ }
  };

  const handleExport = () => {
    window.open('/api/residents/export', '_blank');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Resident Management
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => setShowAddHousehold(!showAddHousehold)}>
            {showAddHousehold ? 'Close' : '+ Household'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowAddResident(!showAddResident)}>
            {showAddResident ? 'Close' : '+ Resident'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setShowResidents(!showResidents); if (!showResidents) handleFetchResidents(); }}>
            {showResidents ? 'Hide Residents' : 'View Residents'}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            Export CSV
          </Button>
          <Button variant="secondary" size="sm">
            <a href="/residents/import">Import CSV</a>
          </Button>
        </div>
      </div>

      {/* Add Household Form */}
      {showAddHousehold && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Create Household (KK)
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="hh-number" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">No. KK</label>
              <input id="hh-number" type="text" value={hhNumber} onChange={e => setHhNumber(e.target.value)} placeholder="3201234567890001" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div className="flex-1">
              <label htmlFor="hh-address" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Address</label>
              <input id="hh-address" type="text" value={hhAddress} onChange={e => setHhAddress(e.target.value)} placeholder="Jl. Mawar No. 1" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div className="w-full sm:w-32">
              <label htmlFor="hh-block" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Block</label>
              <input id="hh-block" type="text" value={hhBlock} onChange={e => setHhBlock(e.target.value)} placeholder="A1" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <Button onClick={handleAddHousehold} disabled={hhLoading} variant="primary">
              {hhLoading ? 'Creating...' : 'Create'}
            </Button>
          </div>
          {hhError && <div className="mt-3"><ErrorMessage message={hhError} /></div>}
          {hhSuccess && <p className="mt-3 text-sm font-medium text-green-700 dark:text-green-400">{hhSuccess}</p>}
        </div>
      )}

      {/* Add Resident Form */}
      {showAddResident && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Add Resident
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="res-hh-id" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Household (No. KK)</label>
              <select id="res-hh-id" value={resHouseholdId} onChange={e => setResHouseholdId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="">-- Select Household --</option>
                {households.map(h => (
                  <option key={h.id} value={h.id}>{h.householdNumber} — {h.address}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="res-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
              <input id="res-name" type="text" value={resName} onChange={e => setResName(e.target.value)} placeholder="Budi Santoso" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="res-nik" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">NIK (16 digits)</label>
              <input id="res-nik" type="text" value={resNik} onChange={e => setResNik(e.target.value)} placeholder="3201234567890001" maxLength={16} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="res-dob" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Date of Birth</label>
              <input id="res-dob" type="date" value={resDob} onChange={e => setResDob(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="res-gender" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Gender</label>
              <select id="res-gender" value={resGender} onChange={e => setResGender(e.target.value as 'male' | 'female')} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label htmlFor="res-phone" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
              <input id="res-phone" type="text" value={resPhone} onChange={e => setResPhone(e.target.value)} placeholder="08123456789" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="res-status" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
              <select id="res-status" value={resStatus} onChange={e => setResStatus(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleAddResident} disabled={resLoading} variant="primary">
              {resLoading ? 'Adding...' : 'Add Resident'}
            </Button>
          </div>
          {resError && <div className="mt-3"><ErrorMessage message={resError} /></div>}
          {resSuccess && <p className="mt-3 text-sm font-medium text-green-700 dark:text-green-400">{resSuccess}</p>}
        </div>
      )}

      {/* Residents List with Search & Status Update */}
      {showResidents && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Residents List
          </h2>
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={resSearchQuery}
              onChange={e => setResSearchQuery(e.target.value)}
              placeholder="Search by name..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              onKeyDown={e => e.key === 'Enter' && handleFetchResidents()}
            />
            <Button onClick={handleFetchResidents} disabled={resListLoading} variant="primary" size="sm">
              {resListLoading ? 'Loading...' : 'Search'}
            </Button>
          </div>
          {residents.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No residents found. Try searching or add residents first.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">NIK</th>
                    <th className="px-3 py-2">Gender</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {residents.map(r => (
                    <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{r.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{r.nik}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.gender === 'male' ? 'info' : 'warning'}>{r.gender}</Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.phone || '-'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={r.status}
                          onChange={e => handleUpdateStatus(r.id, e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          aria-label={`Status for ${r.name}`}
                        >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteResident(r.id, r.name)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          aria-label={`Delete ${r.name}`}
                        >
                          Delete
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
      <SearchBar placeholder="Search households..." onSearch={handleSearch} />

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load households'} />
      )}

      <DataTable<HouseholdRow>
        columns={householdColumns}
        data={households}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No households found"
      />
    </div>
  );
}
