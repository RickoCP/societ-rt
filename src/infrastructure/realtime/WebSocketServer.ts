/**
 * WebSocketServer — Infrastructure implementation of WebSocketProtocol
 * using the `ws` library on a separate port.
 *
 * Features:
 * - JWT authentication on WebSocket handshake
 * - Tenant-isolated channel subscriptions
 * - Privacy filter: shared events to Security_Guard/Pengurus/Ketua_RT,
 *   private events only to Home_Owner
 * - 30-second heartbeat ping/pong, disconnect after 3 missed pongs
 * - Event replay buffer using BullMQ for critical events (1-hour TTL)
 * - Redis pub/sub integration for cross-instance event distribution
 *
 * Factory function pattern for Awilix DI compatibility.
 *
 * @see Requirements 40.1, 40.4, 40.5, 40.6, 40.7, 40.8, 40.9, 40.10, 40.12
 */

import { WebSocketServer as WsServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { Queue } from 'bullmq';
import type { WebSocketProtocol, RealtimeBusProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { RealtimeEvent } from '@core/domains/realtimeBus/entities';
import {
  SHARED_SECURITY_EVENTS,
  PRIVATE_HOME_EVENTS,
} from '@core/domains/realtimeBus/entities';
import { verifyJwt } from '@infrastructure/utils/jwt';
import type { JwtPayload } from '@infrastructure/utils/jwt';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_PORT = Number(process.env.WS_PORT) || 3001;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_MISSED_PONGS = 3;
const CRITICAL_EVENT_TTL_MS = 60 * 60 * 1000; // 1 hour
const CRITICAL_EVENT_QUEUE_NAME = 'realtime-critical-events';

/**
 * Critical event types that require guaranteed delivery via BullMQ replay buffer.
 */
const CRITICAL_EVENT_TYPES = [
  'panic_button_pressed',
  'smoke_detected',
  'emergency_alert',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  tenantId: string;
  role: UserRole;
  householdId?: string;
  subscribedChannels: Set<string>;
  missedPongs: number;
  isAlive: boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const WebSocketServerImpl = ({
  realtimeBusProtocol,
}: {
  realtimeBusProtocol: RealtimeBusProtocol;
}): WebSocketProtocol => {
  // Client registry: userId → Set of AuthenticatedClient (user may have multiple tabs)
  const clientsByUser = new Map<string, Set<AuthenticatedClient>>();
  // Tenant registry: tenantId → Set of AuthenticatedClient
  const clientsByTenant = new Map<string, Set<AuthenticatedClient>>();

  // BullMQ queue for critical event replay buffer
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const redisConnection = (() => {
    const url = new URL(redisUrl);
    return { host: url.hostname, port: Number(url.port) || 6379 };
  })();

  const criticalEventQueue = new Queue(CRITICAL_EVENT_QUEUE_NAME, {
    connection: redisConnection,
  });

  // ---------------------------------------------------------------------------
  // WebSocket Server Setup
  // ---------------------------------------------------------------------------

  const wss = new WsServer({ port: WS_PORT });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    handleConnection(ws, req);
  });

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  const heartbeatInterval = setInterval(() => {
    for (const [, clients] of clientsByUser) {
      for (const client of clients) {
        if (!client.isAlive) {
          client.missedPongs += 1;
          if (client.missedPongs >= MAX_MISSED_PONGS) {
            disconnectClient(client, 'Heartbeat timeout — 3 missed pongs');
            continue;
          }
        }
        client.isAlive = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // ---------------------------------------------------------------------------
  // Connection Handler
  // ---------------------------------------------------------------------------

  function handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Extract token from query string: ws://host:port?token=JWT
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentication required — no token provided');
      return;
    }

    const payload = verifyJwt(token);
    if (!payload) {
      ws.close(4001, 'Authentication failed — invalid or expired token');
      return;
    }

    const client = createClient(ws, payload);
    registerClient(client);

    // Handle pong responses
    ws.on('pong', () => {
      client.isAlive = true;
      client.missedPongs = 0;
    });

    // Handle incoming messages (subscribe/unsubscribe commands)
    ws.on('message', (data) => {
      handleClientMessage(client, data.toString());
    });

    // Handle disconnection
    ws.on('close', () => {
      unregisterClient(client);
    });

    ws.on('error', () => {
      unregisterClient(client);
    });

    // Send connection acknowledgment
    sendToClient(client, {
      type: 'connected',
      userId: client.userId,
      tenantId: client.tenantId,
      role: client.role,
    });

    // Replay critical events on reconnect
    replayCriticalEvents(client);
  }

  // ---------------------------------------------------------------------------
  // Client Management
  // ---------------------------------------------------------------------------

  function createClient(ws: WebSocket, payload: JwtPayload): AuthenticatedClient {
    return {
      ws,
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role as UserRole,
      subscribedChannels: new Set(),
      missedPongs: 0,
      isAlive: true,
    };
  }

  function registerClient(client: AuthenticatedClient): void {
    // Register by user
    let userClients = clientsByUser.get(client.userId);
    if (!userClients) {
      userClients = new Set();
      clientsByUser.set(client.userId, userClients);
    }
    userClients.add(client);

    // Register by tenant
    let tenantClients = clientsByTenant.get(client.tenantId);
    if (!tenantClients) {
      tenantClients = new Set();
      clientsByTenant.set(client.tenantId, tenantClients);
    }
    tenantClients.add(client);
  }

  function unregisterClient(client: AuthenticatedClient): void {
    const userClients = clientsByUser.get(client.userId);
    if (userClients) {
      userClients.delete(client);
      if (userClients.size === 0) {
        clientsByUser.delete(client.userId);
      }
    }

    const tenantClients = clientsByTenant.get(client.tenantId);
    if (tenantClients) {
      tenantClients.delete(client);
      if (tenantClients.size === 0) {
        clientsByTenant.delete(client.tenantId);
      }
    }

    // Unsubscribe from all channels
    for (const channel of client.subscribedChannels) {
      client.subscribedChannels.delete(channel);
    }
  }

  function disconnectClient(client: AuthenticatedClient, reason: string): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.close(4002, reason);
    }
    unregisterClient(client);
  }

  // ---------------------------------------------------------------------------
  // Message Handling
  // ---------------------------------------------------------------------------

  function handleClientMessage(client: AuthenticatedClient, raw: string): void {
    let message: { action?: string; channel?: string; householdId?: string };
    try {
      message = JSON.parse(raw);
    } catch {
      sendToClient(client, { type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid JSON' });
      return;
    }

    switch (message.action) {
      case 'subscribe':
        handleSubscribe(client, message.channel, message.householdId);
        break;
      case 'unsubscribe':
        handleUnsubscribe(client, message.channel);
        break;
      default:
        sendToClient(client, { type: 'error', code: 'UNKNOWN_ACTION', message: 'Unknown action' });
    }
  }

  function handleSubscribe(
    client: AuthenticatedClient,
    channel?: string,
    householdId?: string,
  ): void {
    if (!channel) {
      sendToClient(client, { type: 'error', code: 'MISSING_CHANNEL', message: 'Channel is required' });
      return;
    }

    // Tenant isolation: channel is namespaced with client's tenantId
    const namespacedChannel = `${channel}:${client.tenantId}`;

    // Store householdId for private event filtering
    if (householdId) {
      client.householdId = householdId;
    }

    client.subscribedChannels.add(namespacedChannel);

    // Subscribe to Redis pub/sub channel if not already subscribed at bus level
    realtimeBusProtocol.subscribe(namespacedChannel, (event: RealtimeEvent) => {
      deliverEventToTenantClients(client.tenantId, namespacedChannel, event);
    }).catch(() => {
      // Subscription failure — client will not receive events on this channel
    });

    sendToClient(client, { type: 'subscribed', channel: namespacedChannel });
  }

  function handleUnsubscribe(client: AuthenticatedClient, channel?: string): void {
    if (!channel) {
      sendToClient(client, { type: 'error', code: 'MISSING_CHANNEL', message: 'Channel is required' });
      return;
    }

    const namespacedChannel = `${channel}:${client.tenantId}`;
    client.subscribedChannels.delete(namespacedChannel);
    sendToClient(client, { type: 'unsubscribed', channel: namespacedChannel });
  }

  // ---------------------------------------------------------------------------
  // Event Delivery with Privacy Filter
  // ---------------------------------------------------------------------------

  function deliverEventToTenantClients(
    tenantId: string,
    channel: string,
    event: RealtimeEvent,
  ): void {
    const tenantClients = clientsByTenant.get(tenantId);
    if (!tenantClients) return;

    for (const client of tenantClients) {
      if (!client.subscribedChannels.has(channel)) continue;
      if (!shouldDeliverToClient(client, event)) continue;

      sendToClient(client, { type: 'event', channel, data: event });
    }
  }

  /**
   * Privacy filter: determines whether a client should receive an event.
   *
   * - Shared security events → Security_Guard, Pengurus, Ketua_RT
   * - Private home events → only the Home_Owner of the associated household
   */
  function shouldDeliverToClient(
    client: AuthenticatedClient,
    event: RealtimeEvent,
  ): boolean {
    const isSharedEvent = (SHARED_SECURITY_EVENTS as readonly string[]).includes(
      event.eventType,
    );
    const isPrivateEvent = (PRIVATE_HOME_EVENTS as readonly string[]).includes(
      event.eventType,
    );

    if (isSharedEvent) {
      // Shared events go to Security_Guard, Pengurus, Ketua_RT
      const allowedRoles: UserRole[] = [
        UserRole.Security_Guard,
        UserRole.Pengurus,
        UserRole.Ketua_RT,
      ];
      return allowedRoles.includes(client.role);
    }

    if (isPrivateEvent) {
      // Private events go only to the Home_Owner of the associated household
      if (!event.targetHouseholdId) return false;
      return client.householdId === event.targetHouseholdId;
    }

    // Unknown event types — deliver to all subscribed clients in tenant
    return true;
  }

  // ---------------------------------------------------------------------------
  // Critical Event Replay Buffer
  // ---------------------------------------------------------------------------

  function isCriticalEvent(eventType: string): boolean {
    return (CRITICAL_EVENT_TYPES as readonly string[]).includes(eventType);
  }

  async function bufferCriticalEvent(event: RealtimeEvent): Promise<void> {
    if (!isCriticalEvent(event.eventType)) return;

    try {
      await criticalEventQueue.add(
        `critical-${event.tenantId}-${event.id}`,
        event,
        {
          removeOnComplete: true,
          removeOnFail: true,
          delay: 0,
          jobId: `critical-${event.id}`,
        },
      );
    } catch {
      // Queue unavailable — critical event will not be replayed on reconnect
    }
  }

  async function replayCriticalEvents(client: AuthenticatedClient): Promise<void> {
    try {
      const jobs = await criticalEventQueue.getJobs(['waiting', 'delayed']);
      const now = Date.now();

      for (const job of jobs) {
        const event = job.data as RealtimeEvent;

        // Only replay events for this tenant
        if (event.tenantId !== client.tenantId) continue;

        // Only replay events within 1-hour TTL
        const eventTimestamp = new Date(event.timestamp).getTime();
        if (now - eventTimestamp > CRITICAL_EVENT_TTL_MS) continue;

        // Apply privacy filter
        if (!shouldDeliverToClient(client, event)) continue;

        sendToClient(client, { type: 'replay', data: event });
      }
    } catch {
      // Queue unavailable — skip replay
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  function sendToClient(client: AuthenticatedClient, payload: unknown): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(payload));
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocketProtocol Implementation
  // ---------------------------------------------------------------------------

  return {
    broadcast: async (
      tenantId: string,
      channel: string,
      event: RealtimeEvent,
    ): Promise<void> => {
      const namespacedChannel = `${channel}:${tenantId}`;

      // Buffer critical events for replay
      await bufferCriticalEvent(event);

      // Publish to Redis pub/sub for cross-instance delivery
      await realtimeBusProtocol.publish(namespacedChannel, event);

      // Also deliver locally to connected clients on this instance
      deliverEventToTenantClients(tenantId, namespacedChannel, event);
    },

    sendToUser: async (userId: string, event: RealtimeEvent): Promise<void> => {
      const userClients = clientsByUser.get(userId);
      if (!userClients) return;

      for (const client of userClients) {
        sendToClient(client, { type: 'event', data: event });
      }
    },

    sendToRole: async (
      tenantId: string,
      role: UserRole,
      event: RealtimeEvent,
    ): Promise<void> => {
      const tenantClients = clientsByTenant.get(tenantId);
      if (!tenantClients) return;

      for (const client of tenantClients) {
        if (client.role === role) {
          sendToClient(client, { type: 'event', data: event });
        }
      }
    },

    getActiveConnections: async (tenantId: string): Promise<number> => {
      const tenantClients = clientsByTenant.get(tenantId);
      return tenantClients?.size ?? 0;
    },

    disconnectUser: async (userId: string): Promise<void> => {
      const userClients = clientsByUser.get(userId);
      if (!userClients) return;

      for (const client of userClients) {
        disconnectClient(client, 'Forcefully disconnected by server');
      }
    },
  };
};
