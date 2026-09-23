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

const statusVariant: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
  tetap: 'success',
  kontrak: 'info',
  kos: 'warning',
  pindah: 'danger',
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500'];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index] ?? 'bg-blue-500';
}

export default function HouseholdDetailPage() {
  const params = useParams();
  const householdId = params.id as string;

  const [household, setHousehold] = useState<HouseholdData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingHh, setEditingHh] = useState(false);
  const [hhNumber, setHhNumber] = useState('');
  const [hhAddress, setHhAddress] = useState('');
  const [hhBlock, setHhBlock] = useState('');
  const [hhLat, setHhLat] = useState('');
  const [hhLng, setHhLng] = useState('');
  const [hhSaving, setHhSaving] = useState(false);
  const [hhMsg, setHhMsg] = useState<string | null>(null);

  const [editingResidentId, setEditingResidentId] = useState<string | null>(null);
  const [resForm, setResForm] = useState<Partial<ResidentData>>({});
  const [resSaving, setResSaving] = useState(false);
  const [resMsg, setResMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/residents/households/${householdId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.message ?? 'Failed to load'); return; }
      setHousehold(json.data);
      setHhNumber(json.data.householdNumber);
      setHhAddress(json.data.address);
      setHhBlock(json.data.block ?? '');
      setHhLat(json.data.latitude?.toString() ?? '');
      setHhLng(json.data.longitude?.toString() ?? '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Network error'); }
    finally { setLoading(false); }
  }, [householdId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveHousehold = async () => {
    setHhSaving(true); setHhMsg(null);
    try {
      const res = await fetch(`/api/residents/households/${householdId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdNumber: hhNumber, address: hhAddress, block: hhBlock, latitude: hhLat ? parseFloat(hhLat) : null, longitude: hhLng ? parseFloat(hhLng) : null }),
      });
      const json = await res.json();
      if (!res.ok) { setHhMsg(json.message ?? 'Failed'); return; }
      setHhMsg('Berhasil disimpan!'); setEditingHh(false); fetchData();
    } catch (err) { setHhMsg(err instanceof Error ? err.message : 'Error'); }
    finally { setHhSaving(false); }
  };

  const startEditResident = (r: ResidentData) => {
    setEditingResidentId(r.id); setResForm({ ...r }); setResMsg(null);
  };

  const handleSaveResident = async () => {
    if (!editingResidentId) return;
    setResSaving(true); setResMsg(null);
    try {
      const res = await fetch(`/api/residents/${editingResidentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resForm),
      });
      const json = await res.json();
      if (!res.ok) { setResMsg(json.message ?? 'Failed'); return; }
      setResMsg('Berhasil disimpan!'); setEditingResidentId(null); fetchData();
    } catch (err) { setResMsg(err instanceof Error ? err.message : 'Error'); }
    finally { setResSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Memuat data...</p>
      </div>
    );
  }

  if (error) return <ErrorMessage message={error} />;
  if (!household) return <ErrorMessage message="Data tidak ditemukan" />;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link href="/residents" className="mb-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
          ← Kembali ke Daftar
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Detail Rumah Tangga</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No. KK: {household.householdNumber}</p>
      </div>

      {/* Household Info Card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">🏠 Informasi Rumah Tangga</h2>
          <Button variant={editingHh ? 'secondary' : 'primary'} size="sm" onClick={() => setEditingHh(!editingHh)}>
            {editingHh ? 'Batal' : '✏️ Edit'}
          </Button>
        </div>
        <div className="p-5">
          {editingHh ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">No. KK</label>
                  <input type="text" value={hhNumber} onChange={e => setHhNumber(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Alamat</label>
                  <input type="text" value={hhAddress} onChange={e => setHhAddress(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Blok</label>
                  <input type="text" value={hhBlock} onChange={e => setHhBlock(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">📍 Koordinat Lokasi</h4>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Latitude</label>
                    <input type="number" step="any" value={hhLat} onChange={e => setHhLat(e.target.value)} placeholder="-6.2088" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Longitude</label>
                    <input type="number" step="any" value={hhLng} onChange={e => setHhLng(e.target.value)} placeholder="106.8456" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                  </div>
                </div>
                <MapPicker latitude={hhLat ? parseFloat(hhLat) : -6.2} longitude={hhLng ? parseFloat(hhLng) : 106.8} onLocationChange={(lat, lng) => { setHhLat(lat.toFixed(6)); setHhLng(lng.toFixed(6)); }} />
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSaveHousehold} disabled={hhSaving} variant="primary" size="sm">{hhSaving ? 'Menyimpan...' : 'Simpan'}</Button>
                {hhMsg && <p className="text-sm text-green-700 dark:text-green-400">✓ {hhMsg}</p>}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">No. KK</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{household.householdNumber}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Alamat</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{household.address}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Blok</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{household.block ?? '-'}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Koordinat</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {household.latitude && household.longitude ? `${household.latitude}, ${household.longitude}` : 'Belum diatur'}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Jumlah Anggota</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{household.residents.length} orang</p>
              </div>
              {household.latitude && household.longitude && (
                <div className="flex items-center rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                  <a href={`https://www.google.com/maps?q=${household.latitude},${household.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                    🗺️ Buka di Google Maps
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Residents */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">👥 Anggota Keluarga ({household.residents.length})</h2>
        </div>
        {resMsg && <div className="px-5 pt-3"><p className="text-sm text-green-700 dark:text-green-400">✓ {resMsg}</p></div>}
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {household.residents.map(r => (
            <div key={r.id} className="p-5">
              {editingResidentId === r.id ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Nama</label>
                      <input type="text" value={resForm.name ?? ''} onChange={e => setResForm(p => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">NIK</label>
                      <input type="text" value={resForm.nik ?? ''} onChange={e => setResForm(p => ({ ...p, nik: e.target.value }))} maxLength={16} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tanggal Lahir</label>
                      <input type="date" value={resForm.dateOfBirth ?? ''} onChange={e => setResForm(p => ({ ...p, dateOfBirth: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Jenis Kelamin</label>
                      <select value={resForm.gender ?? 'male'} onChange={e => setResForm(p => ({ ...p, gender: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                        <option value="male">Laki-laki</option>
                        <option value="female">Perempuan</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Telepon</label>
                      <input type="text" value={resForm.phone ?? ''} onChange={e => setResForm(p => ({ ...p, phone: e.target.value || null }))} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                      <select value={resForm.status ?? 'tetap'} onChange={e => setResForm(p => ({ ...p, status: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveResident} disabled={resSaving} variant="primary" size="sm">{resSaving ? 'Menyimpan...' : 'Simpan'}</Button>
                    <Button onClick={() => setEditingResidentId(null)} variant="secondary" size="sm">Batal</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${getAvatarColor(r.name)}`}>
                    {getInitials(r.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{r.name}</p>
                      <Badge variant={statusVariant[r.status] ?? 'default'}>{r.status}</Badge>
                      {r.gender === 'male'
                        ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">♂ L</span>
                        : <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">♀ P</span>
                      }
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>NIK: {r.nik}</span>
                      <span>•</span>
                      <span>Lahir: {r.dateOfBirth ? new Date(r.dateOfBirth).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</span>
                      {r.phone && <><span>•</span><span>📞 {r.phone}</span></>}
                    </div>
                    {r.categories.length > 0 && (
                      <div className="mt-1.5 flex gap-1">
                        {r.categories.map(c => <Badge key={c} variant="info">{c}</Badge>)}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => startEditResident(r)} className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400" aria-label={`Edit ${r.name}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
          {household.residents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="text-3xl">👤</span>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Belum ada anggota keluarga</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
