'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

interface MapPickerProps {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
}

// Dynamically import the map component to avoid SSR issues with Leaflet
const MapPickerInternal = dynamic(
  () => import('./MapPickerInternal').then((mod) => mod.MapPickerInternal),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 w-full items-center justify-center rounded-md border border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat peta...</p>
        </div>
      </div>
    ),
  }
);

/**
 * MapPicker — Interactive map with draggable marker and address search.
 * Uses react-leaflet for better integration with React.
 */
export function MapPicker({ latitude, longitude, onLocationChange }: MapPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  
  // Use props directly for controlled behavior, with fallback defaults
  const effectiveLat = latitude || -6.2;
  const effectiveLng = longitude || 106.8;
  
  // Internal state only for GPS/search updates that need to trigger re-center
  const [overrideCenter, setOverrideCenter] = useState<[number, number] | null>(null);
  
  // Computed values
  const markerPosition: [number, number] = [effectiveLat, effectiveLng];
  const mapCenter: [number, number] = overrideCenter ?? [effectiveLat, effectiveLng];

  const handleMarkerDrag = useCallback(
    (lat: number, lng: number) => {
      onLocationChange(lat, lng);
    },
    [onLocationChange]
  );

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      onLocationChange(lat, lng);
    },
    [onLocationChange]
  );

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setGpsError('GPS tidak didukung di browser ini');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setOverrideCenter([lat, lng]);
        onLocationChange(lat, lng);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(
          err.message === 'User denied Geolocation'
            ? 'Akses lokasi ditolak'
            : 'Gagal mendapatkan lokasi GPS'
        );
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1`
      );
      const results = await res.json();
      if (results.length > 0) {
        const { lat, lon } = results[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);
        setOverrideCenter([newLat, newLng]);
        onLocationChange(newLat, newLng);
      }
    } catch {
      /* ignore search errors */
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Search bar + GPS button */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Cari alamat..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {searching ? '...' : '🔍'}
        </button>
        <button
          type="button"
          onClick={handleUseGps}
          disabled={gpsLoading}
          className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          title="Gunakan lokasi GPS saat ini"
        >
          {gpsLoading ? '...' : '📡 GPS'}
        </button>
      </div>
      {gpsError && <p className="text-xs text-red-600">{gpsError}</p>}
      {/* Map container */}
      <MapPickerInternal
        center={mapCenter}
        markerPosition={markerPosition}
        onMarkerDrag={handleMarkerDrag}
        onMapClick={handleMapClick}
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Klik pada peta atau geser marker untuk memilih lokasi. Gunakan pencarian
        untuk menemukan alamat.
      </p>
    </div>
  );
}
