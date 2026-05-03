'use client';

import { MapContainer as LeafletMapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import type { MapMarker } from './MapContainer';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icon issue with bundlers
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

interface LeafletMapInnerProps {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
}

export function LeafletMapInner({ center, zoom, markers }: LeafletMapInnerProps) {
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
      {markers.map(marker => (
        <Marker key={marker.id} position={[marker.lat, marker.lng]}>
          {(marker.label ?? marker.popupContent) && (
            <Popup>
              {marker.label && <strong>{marker.label}</strong>}
              {marker.popupContent}
            </Popup>
          )}
        </Marker>
      ))}
    </LeafletMapContainer>
  );
}
