'use client';

import { useState } from 'react';
import { MapContainer, type MapMarker } from '@components/organisms/MapContainer';
import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useMapViewModel } from '../viewModel/useMapViewModel';

export function MapScreen() {
  const { markers, isLoading, isError, error } = useMapViewModel();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMarkers = markers.filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return m.headOfHousehold.toLowerCase().includes(q) || m.address.toLowerCase().includes(q);
  });

  const mapMarkers: MapMarker[] = filteredMarkers.map(m => ({
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    label: m.headOfHousehold,
    popupContent: (
      <div className="text-sm">
        <p className="font-semibold">{m.headOfHousehold}</p>
        <p>{m.address}</p>
        <p>Penghuni: {m.residentCount}</p>
        <a
          href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200 no-underline"
        >
          � Buka di Google Maps
        </a>
      </div>
    ),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Resident Map
      </h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Cari nama kepala keluarga atau alamat..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          aria-label="Search by name or address"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {filteredMarkers.length} / {markers.length} titik
        </span>
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load map data'} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
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
          className="h-[500px]"
        />
      )}
    </div>
  );
}
