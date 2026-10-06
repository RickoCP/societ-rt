'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon in Leaflet with webpack/Next.js
// Using inline SVG data URI to avoid CSP issues with external CDN
// Pre-encoded base64 to avoid SSR issues with btoa
const markerIconUrl = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAzNiIgd2lkdGg9IjI0IiBoZWlnaHQ9IjM2Ij4KICA8cGF0aCBmaWxsPSIjM2I4MmY2IiBzdHJva2U9IiMxZDRlZDgiIHN0cm9rZS13aWR0aD0iMSIgZD0iTTEyIDBDNS40IDAgMCA1LjQgMCAxMmMwIDcuMiAxMiAyNCAxMiAyNHMxMi0xNi44IDEyLTI0YzAtNi42LTUuNC0xMi0xMi0xMnoiLz4KICA8Y2lyY2xlIGZpbGw9IiNmZmYiIGN4PSIxMiIgY3k9IjEyIiByPSI1Ii8+Cjwvc3ZnPg==';

const defaultIcon = L.icon({
  iconUrl: markerIconUrl,
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36],
});

L.Marker.prototype.options.icon = defaultIcon;

interface MapPickerInternalProps {
  center: [number, number];
  markerPosition: [number, number];
  onMarkerDrag: (lat: number, lng: number) => void;
  onMapClick: (lat: number, lng: number) => void;
}

// Component to handle map click events
function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Component to recenter map when center prop changes
function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  const prevCenter = useRef(center);

  useEffect(() => {
    if (
      prevCenter.current[0] !== center[0] ||
      prevCenter.current[1] !== center[1]
    ) {
      map.setView(center, map.getZoom());
      prevCenter.current = center;
    }
  }, [center, map]);

  return null;
}

// Draggable marker component
function DraggableMarker({
  position,
  onDrag,
}: {
  position: [number, number];
  onDrag: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const latlng = marker.getLatLng();
          onDrag(latlng.lat, latlng.lng);
        }
      },
    }),
    [onDrag]
  );

  return (
    <Marker
      draggable
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
      icon={defaultIcon}
    />
  );
}

export function MapPickerInternal({
  center,
  markerPosition,
  onMarkerDrag,
  onMapClick,
}: MapPickerInternalProps) {
  return (
    <MapContainer
      center={center}
      zoom={15}
      scrollWheelZoom
      className="h-80 w-full rounded-md border border-gray-300 dark:border-gray-600"
      style={{ minHeight: '320px' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DraggableMarker position={markerPosition} onDrag={onMarkerDrag} />
      <MapClickHandler onMapClick={onMapClick} />
      <MapCenterUpdater center={center} />
    </MapContainer>
  );
}
