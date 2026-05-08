'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SecurityChannel =
  | 'security_events'
  | 'incident_updates'
  | 'gate_events'
  | 'patrol_events'
  | 'alarm_events';

export interface SecurityWebSocketEvent {
  readonly channel: SecurityChannel;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
}

interface UseSecurityWebSocketOptions {
  /** Channels to subscribe to */
  channels: SecurityChannel[];
  /** Callback when a message is received */
  onMessage?: (event: SecurityWebSocketEvent) => void;
  /** Whether the connection should be active */
  enabled?: boolean;
}

interface UseSecurityWebSocketReturn {
  /** Whether the WebSocket is currently connected */
  isConnected: boolean;
  /** Last received event */
  lastEvent: SecurityWebSocketEvent | null;
  /** Reconnect manually */
  reconnect: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_RECONNECT_DELAY_MS = 3000;
const WS_MAX_RECONNECT_ATTEMPTS = 10;

function getWebSocketUrl(): string {
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
  return `${protocol}://${host}/api/ws/security`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSecurityWebSocket({
  channels,
  onMessage,
  enabled = true,
}: UseSecurityWebSocketOptions): UseSecurityWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SecurityWebSocketEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep callback ref up to date
  onMessageRef.current = onMessage;

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;

    cleanup();

    const url = getWebSocketUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;

      // Subscribe to channels
      const subscribeMessage = JSON.stringify({
        type: 'subscribe',
        channels,
      });
      ws.send(subscribeMessage);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as SecurityWebSocketEvent;
        setLastEvent(data);
        onMessageRef.current?.(data);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setIsConnected(false);

      // Auto-reconnect with backoff
      if (enabled && reconnectAttemptsRef.current < WS_MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, WS_RECONNECT_DELAY_MS * reconnectAttemptsRef.current);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }, [enabled, channels, cleanup]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  return { isConnected, lastEvent, reconnect };
}
