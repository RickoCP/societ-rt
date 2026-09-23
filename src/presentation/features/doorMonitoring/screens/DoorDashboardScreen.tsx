'use client';

import { useState } from 'react';
import {
  MapContainer,
  type MapMarker,
  type MapMarkerColor,
} from '@components/organisms/MapContainer';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import {
  useDoorDashboardViewModel,
  type DoorStateMarkerView,
} from '../viewModel/useDoorDashboardViewModel';

function stateLabel(state: DoorStateMarkerView['currentState']): string {
  if (state === 'open') return 'Terbuka';
  if (state === 'closed') return 'Tertutup';
  return 'Tidak diketahui';
}

function stateEmoji(marker: DoorStateMarkerView): string {
  if (marker.alerting) return '🚨';
  if (marker.currentState === 'open') return '🚪';
  if (marker.currentState === 'closed') return '🔒';
  return '❔';
}

/**
 * Pin color by condition:
 *  - red    = alerting (pintu terbuka di jam monitoring — perlu dicek)
 *  - orange = pintu terbuka (di luar jam monitoring)
 *  - green  = pintu tertutup
 *  - grey   = tidak diketahui / monitoring nonaktif
 */
function markerColor(m: DoorStateMarkerView): MapMarkerColor {
  if (m.alerting) return 'red';
  if (m.currentState === 'open') return 'orange';
  if (m.currentState === 'closed') return 'green';
  return 'grey';
}

export function DoorDashboardScreen() {
  const {
    markers,
    alertingCount,
    openCount,
    monitoredCount,
    total,
    isLoading,
    isError,
    error,
    refetch,
  } = useDoorDashboardViewModel();
  const [search, setSearch] = useState('');

  const filtered = markers.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.address.toLowerCase().includes(q) ||
      m.householdNumber.toLowerCase().includes(q) ||
      (m.block ?? '').toLowerCase().includes(q)
    );
  });

  const mapMarkers: MapMarker[] = filtered
    .filter(m => m.latitude != null && m.longitude != null)
    .map(m => ({
      id: m.householdId,
      lat: m.latitude as number,
      lng: m.longitude as number,
      label: m.householdNumber,
      color: markerColor(m),
      popupContent: (
        <div className="min-w-[200px] text-sm">
          <p className="mb-1 font-semibold text-gray-900">
            {stateEmoji(m)} Rumah {m.householdNumber}
          </p>
          <p className="text-gray-600">{m.address}</p>
          {m.block && <p className="text-gray-500">Blok: {m.block}</p>}
          <p className="mt-1 text-gray-700">
            Status pintu: <strong>{stateLabel(m.currentState)}</strong>
          </p>
          <p className="text-gray-500">
            Monitoring: {m.monitoringEnabled ? `${m.monitorStart}–${m.monitorEnd}` : 'nonaktif'}
          </p>
          {m.alerting && (
            <p className="mt-1 font-semibold text-red-600">
              Pintu terbuka di jam monitoring!
            </p>
          )}
        </div>
      ),
    }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Dasbor Pintu Warga
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Kondisi pintu rumah warga yang terpantau sensor
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          Muat ulang
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard color="red" emoji="🚨" value={alertingCount} label="Perlu dicek" />
        <StatCard color="amber" emoji="🚪" value={openCount} label="Pintu terbuka" />
        <StatCard color="green" emoji="🛡️" value={monitoredCount} label="Dipantau" />
        <StatCard color="blue" emoji="🏠" value={total} label="Total sensor" />
      </div>

      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Cari nomor rumah, alamat, atau blok…"
        aria-label="Cari rumah"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
      />

      {isError && (
        <ErrorMessage message={error?.message ?? 'Terjadi kesalahan'} />
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Memuat…</p>
      ) : (
        <MapContainer markers={mapMarkers} />
      )}

      {/* List */}
      <div className="flex flex-col gap-2">
        {filtered.map(m => (
          <div
            key={m.householdId}
            className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
              m.alerting
                ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
            }`}
          >
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {stateEmoji(m)} Rumah {m.householdNumber}
              </p>
              <p className="text-gray-500">{m.address}</p>
            </div>
            <div className="text-right">
              <p className="font-medium text-gray-700 dark:text-gray-200">
                {stateLabel(m.currentState)}
              </p>
              <p className="text-xs text-gray-500">
                {m.monitoringEnabled
                  ? `${m.monitorStart}–${m.monitorEnd}`
                  : 'monitoring nonaktif'}
              </p>
            </div>
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-gray-500">Belum ada sensor pintu terpasang.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  color,
  emoji,
  value,
  label,
}: {
  color: 'red' | 'amber' | 'green' | 'blue';
  emoji: string;
  value: number;
  label: string;
}) {
  const bg: Record<typeof color, string> = {
    red: 'bg-red-100 dark:bg-red-900/40',
    amber: 'bg-amber-100 dark:bg-amber-900/40',
    green: 'bg-green-100 dark:bg-green-900/40',
    blue: 'bg-blue-100 dark:bg-blue-900/40',
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg[color]}`}
        >
          <span className="text-lg">{emoji}</span>
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {value}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  );
}
