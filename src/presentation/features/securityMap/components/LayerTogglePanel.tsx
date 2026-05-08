'use client';

import type { MapLayers } from '../viewModel/useSecurityMapViewModel';

interface Props {
  layers: MapLayers;
  onToggle: (layer: keyof MapLayers) => void;
}

const LAYER_LABELS: Record<keyof MapLayers, string> = {
  incidents: '🔴 Incidents',
  cctv: '📹 CCTV',
  gates: '🚧 Gates',
  panicAlerts: '🚨 Panic Alerts',
  patrolRoutes: '🗺️ Patrol Routes',
  guardPositions: '👮 Guards',
  alarmZones: '🔶 Alarm Zones',
  heatmap: '🌡️ Heatmap',
};

export function LayerTogglePanel({ layers, onToggle }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Map Layers</h3>
      <div className="flex flex-col gap-2">
        {(Object.keys(LAYER_LABELS) as (keyof MapLayers)[]).map(key => (
          <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={() => onToggle(key)}
              className="h-4 w-4 rounded border-gray-300"
            />
            {LAYER_LABELS[key]}
          </label>
        ))}
      </div>
    </div>
  );
}
