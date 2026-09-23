'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useSecurityMapViewModel } from '../viewModel/useSecurityMapViewModel';
import { LayerTogglePanel } from '../components/LayerTogglePanel';
import type { MapIncident, MapCamera, MapGate, MapPanicAlert, MapGuardPosition } from '../viewModel/useSecurityMapViewModel';

// ---------------------------------------------------------------------------
// Severity color mapping
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#2563eb',
};

// ---------------------------------------------------------------------------
// Map component (Leaflet dynamic import)
// ---------------------------------------------------------------------------

function SecurityMapView({ vm }: { vm: ReturnType<typeof useSecurityMapViewModel> }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<unknown>(null);
  const [popupContent] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    // Dynamic import of Leaflet to avoid SSR issues
    void import('leaflet').then(L => {
      if (!mapRef.current) return;

      // Fix default icon paths
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current).setView([-6.2, 106.8], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      leafletMapRef.current = map;
    });

    return () => {
      if (leafletMapRef.current) {
        (leafletMapRef.current as { remove: () => void }).remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Update markers when data or layers change
  useEffect(() => {
    if (!leafletMapRef.current) return;

    void import('leaflet').then(L => {
      const map = leafletMapRef.current as L.Map;

      // Clear existing layers (except tile layer)
      map.eachLayer(layer => {
        if (!(layer instanceof L.TileLayer)) {
          map.removeLayer(layer);
        }
      });

      // Incidents layer
      if (vm.layers.incidents) {
        vm.incidents.forEach((inc: MapIncident) => {
          const color = SEVERITY_COLORS[inc.severity] ?? '#6b7280';
          L.circleMarker([inc.latitude, inc.longitude], {
            radius: 8,
            fillColor: color,
            color: color,
            weight: 2,
            fillOpacity: 0.7,
          })
            .bindPopup(`<b>${inc.title}</b><br/>Severity: ${inc.severity}<br/>Status: ${inc.status}`)
            .addTo(map);
        });
      }

      // CCTV layer
      if (vm.layers.cctv) {
        vm.cameras.forEach((cam: MapCamera) => {
          L.marker([cam.latitude, cam.longitude])
            .bindPopup(`<b>📹 ${cam.name}</b><br/>Status: ${cam.status}`)
            .addTo(map);
        });
      }

      // Gates layer
      if (vm.layers.gates) {
        vm.gates.forEach((gate: MapGate) => {
          L.marker([gate.latitude, gate.longitude])
            .bindPopup(`<b>🚧 ${gate.name}</b><br/>Status: ${gate.status}`)
            .addTo(map);
        });
      }

      // Panic alerts layer
      if (vm.layers.panicAlerts) {
        vm.panicAlerts.forEach((alert: MapPanicAlert) => {
          L.circleMarker([alert.latitude, alert.longitude], {
            radius: 12,
            fillColor: '#dc2626',
            color: '#991b1b',
            weight: 3,
            fillOpacity: 0.8,
          })
            .bindPopup(`<b>🚨 PANIC</b><br/>${alert.message}<br/>${new Date(alert.timestamp).toLocaleString()}`)
            .addTo(map);
        });
      }

      // Patrol routes layer
      if (vm.layers.patrolRoutes) {
        vm.patrolRoutes.forEach(route => {
          const latlngs = route.waypoints.map(wp => [wp.lat, wp.lng] as [number, number]);
          L.polyline(latlngs, { color: '#3b82f6', weight: 3, dashArray: '5, 10' })
            .bindPopup(`<b>Route: ${route.name}</b>`)
            .addTo(map);
        });
      }

      // Guard positions layer
      if (vm.layers.guardPositions) {
        vm.guardPositions.forEach((guard: MapGuardPosition) => {
          L.circleMarker([guard.latitude, guard.longitude], {
            radius: 6,
            fillColor: '#16a34a',
            color: '#166534',
            weight: 2,
            fillOpacity: 0.9,
          })
            .bindPopup(`<b>👮 ${guard.guardName}</b><br/>Updated: ${new Date(guard.updatedAt).toLocaleTimeString()}`)
            .addTo(map);
        });
      }

      // Alarm zones (geofence polygons)
      if (vm.layers.alarmZones) {
        vm.alarmZones.forEach(zone => {
          const latlngs = zone.polygon.map(p => [p.lat, p.lng] as [number, number]);
          L.polygon(latlngs, {
            color: '#f59e0b',
            fillColor: '#fbbf24',
            fillOpacity: 0.15,
            weight: 2,
          })
            .bindPopup(`<b>Zone: ${zone.name}</b>`)
            .addTo(map);
        });
      }

      // Heatmap (simplified - using circle markers with varying opacity)
      if (vm.layers.heatmap) {
        vm.incidents.forEach((inc: MapIncident) => {
          L.circle([inc.latitude, inc.longitude], {
            radius: 100,
            fillColor: '#dc2626',
            color: 'transparent',
            fillOpacity: 0.15,
          }).addTo(map);
        });
      }
    });
  }, [vm.incidents, vm.cameras, vm.gates, vm.panicAlerts, vm.patrolRoutes, vm.guardPositions, vm.alarmZones, vm.layers]);

  return (
    <div className="relative">
      <div ref={mapRef} className="h-[600px] w-full rounded-lg border border-gray-200 dark:border-gray-700" />
      {popupContent && (
        <div className="absolute bottom-4 left-4 rounded-lg bg-white p-3 shadow-lg dark:bg-gray-800">
          <p className="text-sm text-gray-700 dark:text-gray-300">{popupContent}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function SecurityMapScreen() {
  const vm = useSecurityMapViewModel();

  if (vm.isLoading) {
    return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  }

  if (vm.isError) {
    return <ErrorMessage message={vm.error?.message ?? 'Failed to load security map'} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Security Map</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Layer controls */}
        <div className="lg:col-span-1">
          <LayerTogglePanel layers={vm.layers} onToggle={vm.toggleLayer} />
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <SecurityMapView vm={vm} />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-red-600" /> Critical</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-orange-600" /> High</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-amber-600" /> Medium</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-blue-600" /> Low</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-green-600" /> Guard</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 border-2 border-amber-500 bg-amber-200/30" /> Alarm Zone</span>
      </div>
    </div>
  );
}
