'use client';

import { useState } from 'react';
import { MapContainer, type MapMarker } from '@components/organisms/MapContainer';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useMapViewModel } from '../viewModel/useMapViewModel';

export function MapScreen() {
  const { markers, isLoading, isError, error, blockFilter, setBlockFilter } = useMapViewModel();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const filteredMarkers = markers.filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return m.headOfHousehold.toLowerCase().includes(q) || m.address.toLowerCase().includes(q);
  });

  // Get unique blocks for filter
  const blocks = [...new Set(markers.map(m => m.block).filter(Boolean))].sort();

  const mapMarkers: MapMarker[] = filteredMarkers.map(m => ({
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    label: m.headOfHousehold,
    popupContent: (
      <div className="min-w-[200px] text-sm">
        <p className="mb-1 font-semibold text-gray-900">{m.headOfHousehold}</p>
        <p className="text-gray-600">{m.address}</p>
        {m.block && <p className="text-gray-500">Blok: {m.block}</p>}
        <p className="text-gray-500">Penghuni: {m.residentCount} orang</p>
        <div className="mt-2 flex gap-2">
          <a
            href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 no-underline hover:bg-blue-100"
          >
            🗺️ Google Maps
          </a>
        </div>
      </div>
    ),
  }));

  const totalResidents = filteredMarkers.reduce((sum, m) => sum + m.residentCount, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Peta Warga
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Lokasi rumah warga di lingkungan RT
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
              <span className="text-lg">🏠</span>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{filteredMarkers.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Rumah</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40">
              <span className="text-lg">👥</span>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{totalResidents}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Warga</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
              <span className="text-lg">🏘️</span>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{blocks.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Blok</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <span className="text-lg">📍</span>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {filteredMarkers.length > 0 ? Math.round(totalResidents / filteredMarkers.length * 10) / 10 : 0}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Rata-rata/rumah</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cari nama kepala keluarga atau alamat..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            aria-label="Search by name or address"
          />
        </div>

        {/* Block filter chips */}
        {blocks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBlockFilter('')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                !blockFilter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              Semua
            </button>
            {blocks.map(block => (
              <button
                key={block}
                type="button"
                onClick={() => setBlockFilter(block)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  blockFilter === block
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                Blok {block}
              </button>
            ))}
          </div>
        )}
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load map data'} />
      )}

      {/* Map */}
      <div className="relative overflow-hidden rounded-xl border border-gray-200 shadow-sm dark:border-gray-700">
        {isLoading ? (
          <div className="flex h-[600px] items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat peta...</p>
            </div>
          </div>
        ) : filteredMarkers.length === 0 ? (
          <div className="flex h-[600px] flex-col items-center justify-center bg-gray-50 dark:bg-gray-800">
            <span className="text-4xl">🗺️</span>
            <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">
              {searchQuery ? 'Tidak ada hasil pencarian' : 'Belum ada data lokasi'}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {searchQuery ? 'Coba kata kunci lain' : 'Tambahkan koordinat rumah warga'}
            </p>
          </div>
        ) : (
          <>
            <MapContainer
              markers={mapMarkers}
              center={mapMarkers.length > 0
                ? [
                    mapMarkers.reduce((sum, m) => sum + m.lat, 0) / mapMarkers.length,
                    mapMarkers.reduce((sum, m) => sum + m.lng, 0) / mapMarkers.length,
                  ]
                : [-6.2, 106.8]
              }
              zoom={mapMarkers.length > 0 ? 16 : 12}
              className="h-[600px]"
            />

            {/* Map overlay stats */}
            <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm dark:bg-gray-800/90">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                📍 {filteredMarkers.length} lokasi ditampilkan
              </p>
            </div>
          </>
        )}
      </div>

      {/* Resident List below map */}
      {!isLoading && filteredMarkers.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Daftar Rumah ({filteredMarkers.length})
            </h2>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {filteredMarkers.map(m => (
              <div
                key={m.id}
                className={`flex items-center gap-3 border-b border-gray-100 px-5 py-3 transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50 ${
                  selectedMarkerId === m.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
                onClick={() => setSelectedMarkerId(m.id === selectedMarkerId ? null : m.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') setSelectedMarkerId(m.id === selectedMarkerId ? null : m.id); }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm dark:bg-blue-900/40">
                  🏠
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {m.headOfHousehold}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {m.address} {m.block ? `• Blok ${m.block}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{m.residentCount}</p>
                  <p className="text-xs text-gray-400">orang</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
