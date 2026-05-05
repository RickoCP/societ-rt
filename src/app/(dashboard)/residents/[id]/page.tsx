'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@components/atoms/Button';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { MapPicker } from '@components/molecules/MapPicker';
import Link from 'next/link';

interface ResidentData {
  id: string;
  name: string;
  nik: string;
  dateOfBirth: string;
  gender: string;
  phone: string | null;
  status: string;
  categories: string[];
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
}

interface HouseholdData {
  id: string;
  householdNumber: string;
  address: string;
  block: string | null;
  latitude: number | null;
  longitude: number | null;
  residents: ResidentData[];
}

const STATUS_OPTIONS = ['tetap', 'kontrak', 'kos', 'pindah'] as const;

export default function HouseholdDetailPage() {
  const params = useParams();
  const householdId = params.id as string;

  const [household, setHousehold] = useState<HouseholdData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit household state
  const [editingHh, setEditingHh] = useState(false);
  const [hhNumber, setHhNumber] = useState('');
  const [hhAddress, setHhAddress] = useState('');
  const [hhBlock, setHhBlock] = useState('');
  const [hhLat, setHhLat] = useState('');
  const [hhLng, setHhLng] = useState('');
  const [hhSaving, setHhSaving] = useState(false);
  const [hhMsg, setHhMsg] = useState<string | null>(null);

  // Edit resident state
  const [editingResidentId, setEditingResidentId] = useState<string | null>(null);
  const [resForm, setResForm] = useState<Partial<ResidentData>>({});
  const [resSaving, setResSaving] = useState(false);
  const [resMsg, setResMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/residents/households/${householdId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? 'Failed to load');
        return;
      }
      setHousehold(json.data);
      setHhNumber(json.data.householdNumber);
      setHhAddress(json.data.address);
      setHhBlock(json.data.block ?? '');
      setHhLat(json.data.latitude?.toString() ?? '');
      setHhLng(json.data.longitude?.toString() ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveHousehold = async () => {
    setHhSaving(true);
    setHhMsg(null);
    try {
      const res = await fetch(`/api/residents/households/${householdId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdNumber: hhNumber,
          address: hhAddress,
          block: hhBlock,
          latitude: hhLat ? parseFloat(hhLat) : null,
          longitude: hhLng ? parseFloat(hhLng) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setHhMsg(json.message ?? json.code ?? 'Failed');
        return;
      }
      setHhMsg('Household updated!');
      setEditingHh(false);
      fetchData();
    } catch (err) {
      setHhMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setHhSaving(false);
    }
  };

  const startEditResident = (r: ResidentData) => {
    setEditingResidentId(r.id);
    setResForm({ ...r });
    setResMsg(null);
  };

  const handleSaveResident = async () => {
    if (!editingResidentId) return;
    setResSaving(true);
    setResMsg(null);
    try {
      const res = await fetch(`/api/residents/${editingResidentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resForm),
      });
      const json = await res.json();
      if (!res.ok) {
        setResMsg(json.message ?? json.code ?? 'Failed');
        return;
      }
      setResMsg('Resident updated!');
      setEditingResidentId(null);
      fetchData();
    } catch (err) {
      setResMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setResSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) return <ErrorMessage message={error} />;
  if (!household) return <ErrorMessage message="Household not found" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Detail Household</h1>
        <Link href="/residents" className="text-sm text-blue-600 hover:underline dark:text-blue-400">← Back</Link>
      </div>

      {/* Household Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Data Household</h2>
          <Button variant={editingHh ? 'secondary' : 'primary'} size="sm" onClick={() => setEditingHh(!editingHh)}>
            {editingHh ? 'Cancel' : 'Edit'}
          </Button>
        </div>

        {editingHh ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">No. KK</label>
                <input type="text" value={hhNumber} onChange={e => setHhNumber(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Alamat</label>
                <input type="text" value={hhAddress} onChange={e => setHhAddress(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Block</label>
                <input type="text" value={hhBlock} onChange={e => setHhBlock(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              </div>
            </div>
            {/* Koordinat Section */}
            <div className="mt-4 rounded-md border border-gray-200 p-4 dark:border-gray-700">
              <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">📍 Koordinat Lokasi</h4>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Latitude</label>
                  <input type="number" step="any" value={hhLat} onChange={e => setHhLat(e.target.value)} placeholder="-6.2088" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Longitude</label>
                  <input type="number" step="any" value={hhLng} onChange={e => setHhLng(e.target.value)} placeholder="106.8456" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                </div>
              </div>
              <MapPicker
                latitude={hhLat ? parseFloat(hhLat) : -6.2}
                longitude={hhLng ? parseFloat(hhLng) : 106.8}
                onLocationChange={(lat, lng) => {
                  setHhLat(lat.toFixed(6));
                  setHhLng(lng.toFixed(6));
                }}
              />
            </div>
            <div>
              <Button onClick={handleSaveHousehold} disabled={hhSaving} variant="primary" size="sm">
                {hhSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            {hhMsg && <p className="text-sm text-green-700 dark:text-green-400">{hhMsg}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div><span className="text-gray-500 dark:text-gray-400">No. KK:</span> <strong>{household.householdNumber}</strong></div>
            <div><span className="text-gray-500 dark:text-gray-400">Alamat:</span> <strong>{household.address}</strong></div>
            <div><span className="text-gray-500 dark:text-gray-400">Block:</span> <strong>{household.block ?? '-'}</strong></div>
            <div><span className="text-gray-500 dark:text-gray-400">Latitude:</span> <strong>{household.latitude ?? '-'}</strong></div>
            <div><span className="text-gray-500 dark:text-gray-400">Longitude:</span> <strong>{household.longitude ?? '-'}</strong></div>
            {household.latitude && household.longitude && (
              <div>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${household.latitude}&mlon=${household.longitude}#map=17/${household.latitude}/${household.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  📍 Lihat di Map
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Residents */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Anggota Keluarga ({household.residents.length})
        </h2>

        {resMsg && <p className="mb-3 text-sm text-green-700 dark:text-green-400">{resMsg}</p>}

        <div className="flex flex-col gap-4">
          {household.residents.map(r => (
            <div key={r.id} className="rounded-md border border-gray-100 p-4 dark:border-gray-700">
              {editingResidentId === r.id ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Nama</label>
                      <input type="text" value={resForm.name ?? ''} onChange={e => setResForm(p => ({ ...p, name: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">NIK</label>
                      <input type="text" value={resForm.nik ?? ''} onChange={e => setResForm(p => ({ ...p, nik: e.target.value }))} maxLength={16} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Tanggal Lahir</label>
                      <input type="date" value={resForm.dateOfBirth ?? ''} onChange={e => setResForm(p => ({ ...p, dateOfBirth: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Gender</label>
                      <select value={resForm.gender ?? 'male'} onChange={e => setResForm(p => ({ ...p, gender: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                        <option value="male">Laki-laki</option>
                        <option value="female">Perempuan</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Phone</label>
                      <input type="text" value={resForm.phone ?? ''} onChange={e => setResForm(p => ({ ...p, phone: e.target.value || null }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Status</label>
                      <select value={resForm.status ?? 'tetap'} onChange={e => setResForm(p => ({ ...p, status: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveResident} disabled={resSaving} variant="primary" size="sm">
                      {resSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button onClick={() => setEditingResidentId(null)} variant="secondary" size="sm">Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{r.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">NIK: {r.nik} | {r.gender === 'male' ? 'L' : 'P'} | {r.dateOfBirth}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Phone: {r.phone ?? '-'}</p>
                    <div className="mt-1 flex gap-1">
                      <Badge variant={r.status === 'tetap' ? 'success' : r.status === 'pindah' ? 'danger' : 'warning'}>{r.status}</Badge>
                      {r.categories.map(c => <Badge key={c} variant="info">{c}</Badge>)}
                    </div>
                  </div>
                  <Button onClick={() => startEditResident(r)} variant="ghost" size="sm">Edit</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
