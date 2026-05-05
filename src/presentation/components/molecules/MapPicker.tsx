'use client';

import { useEffect, useRef, useState } from 'react';

interface MapPickerProps {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
}

/**
 * MapPicker — Interactive map with draggable marker and address search.
 * Uses Leaflet via CDN (no npm package needed).
 */
export function MapPicker({ latitude, longitude, onLocationChange }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Load Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    const loadLeaflet = () => {
      return new Promise<void>((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).L) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    };

    loadLeaflet().then(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;

      const map = L.map(mapRef.current).setView([latitude || -6.2, longitude || 106.8], 15);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const marker = L.marker([latitude || -6.2, longitude || 106.8], { draggable: true }).addTo(map);
      markerRef.current = marker;

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onLocationChange(pos.lat, pos.lng);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        onLocationChange(e.latlng.lat, e.latlng.lng);
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapInstanceRef.current as any).remove();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker position when props change externally
  useEffect(() => {
    if (markerRef.current && latitude && longitude) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (markerRef.current as any).setLatLng([latitude, longitude]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapInstanceRef.current as any)?.setView([latitude, longitude], 15);
    }
  }, [latitude, longitude]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
      );
      const results = await res.json();
      if (results.length > 0) {
        const { lat, lon } = results[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);
        onLocationChange(newLat, newLng);
        if (markerRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (markerRef.current as any).setLatLng([newLat, newLng]);
        }
        if (mapInstanceRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (mapInstanceRef.current as any).setView([newLat, newLng], 17);
        }
      }
    } catch { /* ignore search errors */ }
    finally { setSearching(false); }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
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
      </div>
      {/* Map container */}
      <div
        ref={mapRef}
        className="h-80 w-full rounded-md border border-gray-300 dark:border-gray-600"
        style={{ minHeight: '320px' }}
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Klik pada peta atau geser marker untuk memilih lokasi. Gunakan pencarian untuk menemukan alamat.
      </p>
    </div>
  );
}
