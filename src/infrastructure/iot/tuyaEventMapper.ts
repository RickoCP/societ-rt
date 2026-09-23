/**
 * Tuya event mapper — normalizes raw Tuya webhook payloads into the canonical
 * DeviceEventType strings the domain understands.
 *
 * This lives at the infrastructure/BFF boundary because raw Tuya payload shapes
 * are an external integration detail. The core domain only ever sees canonical
 * event types (e.g. 'door_opened'), never vendor DP codes.
 *
 * Tuya door/contact sensors (category `mcs`) report a boolean data point
 * `doorcontact_state`: true = open, false = closed. Depending on how the
 * webhook is wired (Tuya Cloud "status" array, a rule action, or a flattened
 * body), that value can arrive in several shapes, so this mapper is tolerant.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The subset of a Tuya webhook we care about for normalization. */
export interface RawTuyaEvent {
  /** Event type as received (may already be canonical, or a Tuya bizCode/DP). */
  readonly eventType: string;
  /** Arbitrary event data — may contain a `status` array or flat DP values. */
  readonly eventData: Record<string, unknown>;
}

/** A single Tuya status data point: { code, value }. */
interface TuyaStatusPoint {
  code?: unknown;
  value?: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tuya data-point code for door/contact sensors (category `mcs`). */
export const TUYA_DOOR_DP_CODE = 'doorcontact_state';

/** Canonical event types this mapper can emit for door sensors. */
export const CANONICAL_DOOR_OPENED = 'door_opened';
export const CANONICAL_DOOR_CLOSED = 'door_closed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coerce a Tuya value into a boolean "is open" (true) / closed (false). */
function coerceOpenState(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'open', 'opened', 'on'].includes(v)) return true;
    if (['false', '0', 'close', 'closed', 'off'].includes(v)) return false;
  }
  return null;
}

/**
 * Extract the door-contact open/closed state from a raw Tuya event, checking
 * the common payload shapes. Returns null when the payload does not carry a
 * recognizable door-contact data point.
 */
function extractDoorState(event: RawTuyaEvent): boolean | null {
  const data = event.eventData ?? {};

  // Shape A: flat DP value on eventData, e.g. { doorcontact_state: true }
  if (TUYA_DOOR_DP_CODE in data) {
    const state = coerceOpenState(data[TUYA_DOOR_DP_CODE]);
    if (state !== null) return state;
  }

  // Shape B: Tuya Cloud status array, e.g.
  //   { status: [{ code: 'doorcontact_state', value: true }] }
  const status = data.status;
  if (Array.isArray(status)) {
    for (const raw of status as TuyaStatusPoint[]) {
      if (raw && raw.code === TUYA_DOOR_DP_CODE) {
        const state = coerceOpenState(raw.value);
        if (state !== null) return state;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a raw Tuya webhook event's `eventType`.
 *
 * Rules:
 *  - If the incoming eventType is already a canonical door event
 *    ('door_opened' / 'door_closed'), it is returned unchanged.
 *  - If the payload carries a `doorcontact_state` DP (or the eventType hints at
 *    it), the eventType is derived from that boolean.
 *  - Otherwise the original eventType is returned untouched, so non-door events
 *    (motion, smoke, gate, etc.) pass through unaffected.
 */
export function normalizeTuyaEventType(event: RawTuyaEvent): string {
  // Already canonical — nothing to do.
  if (
    event.eventType === CANONICAL_DOOR_OPENED ||
    event.eventType === CANONICAL_DOOR_CLOSED
  ) {
    return event.eventType;
  }

  // Consider mapping only when the event plausibly concerns a door contact:
  // either the DP code appears anywhere, or the eventType references it.
  const mentionsDoorDp =
    event.eventType === TUYA_DOOR_DP_CODE ||
    TUYA_DOOR_DP_CODE in (event.eventData ?? {}) ||
    Array.isArray(event.eventData?.status);

  if (!mentionsDoorDp) {
    return event.eventType;
  }

  const isOpen = extractDoorState(event);
  if (isOpen === null) {
    return event.eventType;
  }

  return isOpen ? CANONICAL_DOOR_OPENED : CANONICAL_DOOR_CLOSED;
}
