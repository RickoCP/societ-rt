'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MapIncident {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  latitude: number;
  longitude: number;
  category: string;
  createdAt: string;
}

export interface MapCamera {
  id: string;
  name: string;
  status: string;
  latitude: number;
  longitude: number;
}

export interface MapGate {
  id: string;
  name: string;
  status: string;
  latitude: number;
  longitude: number;
}

export interface MapPanicAlert {
  id: string;
  message: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface MapPatrolRoute {
  id: string;
  name: string;
  waypoints: { lat: number; lng: number }[];
}

export interface MapGuardPosition {
  id: string;
  guardName: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export interface MapAlarmZone {
  id: string;
  name: string;
  polygon: { lat: number; lng: number }[];
}

export interface MapLayers {
  incidents: boolean;
  cctv: boolean;
  gates: boolean;
  panicAlerts: boolean;
  patrolRoutes: boolean;
  guardPositions: boolean;
  alarmZones: boolean;
  heatmap: boolean;
}

interface SecurityMapData {
  incidents: MapIncident[];
  cameras: MapCamera[];
  gates: MapGate[];
  panicAlerts: MapPanicAlert[];
  patrolRoutes: MapPatrolRoute[];
  guardPositions: MapGuardPosition[];
  alarmZones: MapAlarmZone[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchSecurityMapData(): Promise<SecurityMapData> {
  const res = await fetch('/api/security/map/layers');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch map data');
  }
  const json = (await res.json()) as { data: SecurityMapData };
  return json.data;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_LAYERS: MapLayers = {
  incidents: true,
  cctv: true,
  gates: true,
  panicAlerts: true,
  patrolRoutes: true,
  guardPositions: true,
  alarmZones: true,
  heatmap: false,
};

export function useSecurityMapViewModel() {
  const queryClient = useQueryClient();
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  const [guardPositions, setGuardPositions] = useState<MapGuardPosition[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const mapQuery = useQuery({
    queryKey: ['security-map-data'],
    queryFn: fetchSecurityMapData,
    refetchInterval: 30000,
  });

  // WebSocket for realtime guard position updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?channel=patrol_events`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { type: string; payload: MapGuardPosition };
          if (data.type === 'guard_position_update' && data.payload) {
            setGuardPositions(prev => {
              const filtered = prev.filter(g => g.id !== data.payload.id);
              return [...filtered, data.payload];
            });
          }
        } catch {
          // Ignore malformed messages
        }
      };

      return () => {
        ws.close();
      };
    } catch {
      return undefined;
    }
  }, []);

  const toggleLayer = useCallback((layer: keyof MapLayers) => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['security-map-data'] });
  }, [queryClient]);

  // Merge API guard positions with realtime updates
  const mergedGuardPositions = (() => {
    const apiPositions = mapQuery.data?.guardPositions ?? [];
    const merged = [...apiPositions];
    for (const rt of guardPositions) {
      const idx = merged.findIndex(g => g.id === rt.id);
      if (idx >= 0) {
        merged[idx] = rt;
      } else {
        merged.push(rt);
      }
    }
    return merged;
  })();

  return {
    incidents: mapQuery.data?.incidents ?? [],
    cameras: mapQuery.data?.cameras ?? [],
    gates: mapQuery.data?.gates ?? [],
    panicAlerts: mapQuery.data?.panicAlerts ?? [],
    patrolRoutes: mapQuery.data?.patrolRoutes ?? [],
    guardPositions: mergedGuardPositions,
    alarmZones: mapQuery.data?.alarmZones ?? [],
    layers,
    toggleLayer,
    isLoading: mapQuery.isLoading,
    isError: mapQuery.isError,
    error: mapQuery.error,
    refresh,
  };
}
