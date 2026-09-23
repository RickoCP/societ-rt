'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '../atoms/Spinner';

/** Marker pin color. Maps to a colored Leaflet icon in LeafletMapInner. */
export type MapMarkerColor =
  | 'blue'
  | 'red'
  | 'orange'
  | 'green'
  | 'grey';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  /** Pin color; defaults to blue when omitted. */
  color?: MapMarkerColor;
  popupContent?: React.ReactNode;
}

export interface MapContainerProps {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  className?: string;
  style?: React.CSSProperties;
}

const LeafletMap = dynamic(
  () => import('./LeafletMapInner').then(mod => ({ default: mod.LeafletMapInner })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    ),
  },
);

export function MapContainer({
  center = [-6.2088, 106.8456],
  zoom = 13,
  markers = [],
  className = '',
  style,
}: MapContainerProps) {
  return (
    <div className={`h-96 w-full rounded-lg overflow-hidden ${className}`} style={style}>
      <LeafletMap center={center} zoom={zoom} markers={markers} />
    </div>
  );
}
