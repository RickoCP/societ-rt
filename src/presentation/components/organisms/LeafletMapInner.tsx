'use client';

import { useEffect } from 'react';
import {
  MapContainer as LeafletMapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet';
import type { MapMarker, MapMarkerColor } from './MapContainer';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Hex fill per marker color — self-contained (no external image assets).
const COLOR_HEX: Record<MapMarkerColor, string> = {
  blue: '#2563eb',
  red: '#dc2626',
  orange: '#ea580c',
  green: '#16a34a',
  grey: '#6b7280',
};

/**
 * Build a CSS-only teardrop pin marker using L.divIcon. No network requests,
 * so markers render even when external CDNs are blocked. The 32x42 box has its
 * tip at the bottom-center (iconAnchor [16, 42]).
 */
function makeIcon(color: MapMarkerColor): L.DivIcon {
  const fill = COLOR_HEX[color];
  const html = `
    <span class="societ-pin" style="
      position:relative; display:block; width:26px; height:26px;
      background:${fill};
      border:2px solid #ffffff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 4px rgba(0,0,0,0.4);
    ">
      <span style="
        position:absolute; top:50%; left:50%;
        width:8px; height:8px; background:#ffffff; border-radius:50%;
        transform:translate(-50%,-50%);
      "></span>
    </span>`;
  return L.divIcon({
    html,
    className: 'societ-pin-wrapper',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -40],
  });
}

const ICONS: Record<MapMarkerColor, L.DivIcon> = {
  blue: makeIcon('blue'),
  red: makeIcon('red'),
  orange: makeIcon('orange'),
  green: makeIcon('green'),
  grey: makeIcon('grey'),
};

// Default marker icon (blue) for markers that don't specify a color.
L.Marker.prototype.options.icon = ICONS.blue;

interface LeafletMapInnerProps {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
}

/**
 * Fits the map view to all valid markers so every household point is visible
 * on first render (and whenever the marker set changes). Falls back to the
 * provided center/zoom when there are no markers, and to a sensible zoom when
 * there is exactly one.
 */
function FitBounds({
  points,
  fallbackCenter,
  fallbackZoom,
}: {
  points: [number, number][];
  fallbackCenter: [number, number];
  fallbackZoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      map.setView(fallbackCenter, fallbackZoom);
      return;
    }
    const only = points[0];
    if (points.length === 1 && only) {
      map.setView(only, Math.max(fallbackZoom, 16));
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    // Re-run when the actual set of coordinates changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);

  return null;
}

export function LeafletMapInner({ center, zoom, markers }: LeafletMapInnerProps) {
  const validMarkers = markers.filter(
    m => m.lat != null && m.lng != null && !isNaN(m.lat) && !isNaN(m.lng),
  );
  const points: [number, number][] = validMarkers.map(m => [m.lat, m.lng]);

  return (
    <LeafletMapContainer
      center={center}
      zoom={zoom}
      className="h-full w-full"
      scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} fallbackCenter={center} fallbackZoom={zoom} />
      {validMarkers.map((marker, index) => (
        <Marker
          key={marker.id || `marker-${index}`}
          position={[marker.lat, marker.lng]}
          icon={ICONS[marker.color ?? 'blue']}>
          {(marker.label ?? marker.popupContent) && (
            <Popup>
              {/* {marker.label && <strong>{marker.label}</strong>} */}
              {marker.popupContent}
            </Popup>
          )}
        </Marker>
      ))}
    </LeafletMapContainer>
  );
}
