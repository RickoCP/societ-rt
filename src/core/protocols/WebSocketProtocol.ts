/**
 * WebSocketProtocol — Core abstraction for WebSocket connection management
 * and message delivery.
 *
 * Infrastructure layer provides the concrete implementation (e.g. ws library
 * with Redis pub/sub for cross-instance distribution).
 *
 * @see Requirements 40.1, 40.4, 40.5, 40.6, 40.9
 */

import type { UserRole } from './AuthContext';
import type { RealtimeEvent } from '@core/domains/realtimeBus/entities';

export interface WebSocketProtocol {
  /** Broadcast an event to all connected clients in a tenant on a given channel. */
  broadcast(
    tenantId: string,
    channel: string,
    event: RealtimeEvent,
  ): Promise<void>;

  /** Send an event directly to a specific user's WebSocket connection(s). */
  sendToUser(userId: string, event: RealtimeEvent): Promise<void>;

  /** Send an event to all connected users with a specific role within a tenant. */
  sendToRole(
    tenantId: string,
    role: UserRole,
    event: RealtimeEvent,
  ): Promise<void>;

  /** Get the number of active WebSocket connections for a tenant. */
  getActiveConnections(tenantId: string): Promise<number>;

  /** Forcefully disconnect a user's WebSocket connection(s). */
  disconnectUser(userId: string): Promise<void>;
}
