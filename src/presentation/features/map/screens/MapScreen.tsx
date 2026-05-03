'use client';

import { MapContainer, type MapMarker } from '@components/organisms/MapContainer';
import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useMapViewModel } from '../viewModel/useMapViewModel';

export function MapScreen() {
  const {
    markers,
    isLoading,
    isError,
    error,
    blockFilter,
    setBlockFilter,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
  } = useMapViewModel();

  const mapMarkers: MapMarker[] = markers.map(m => ({
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    label: m.householdNumber,
    popupContent: (
      <div className="text-sm">
        <p className="font-semibold">{m.householdNumber}</p>
        <p>{m.address}</p>
        <p>Head: {m.headOfHousehold}</p>
        <p>Residents: {m.residentCount}</p>
      </div>
    ),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Resident Map
      </h1>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filter by block"
          value={blockFilter}
          onChange={e => setBlockFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          aria-label="Filter by block"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          aria-label="Filter by category">
          <option value="">All categories</option>
          <option value="lansia">Lansia</option>
          <option value="balita">Balita</option>
        </select>
      </div>

      {isError && (
        <ErrorMessage
          message={error?.message ?? 'Failed to load map data'}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <MapContainer
          markers={mapMarkers}
          className="h-[500px]"
        />
      )}
    </div>
  );
}
