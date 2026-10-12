/**
 * uuidLike — Shared Zod validator for "UUID-shaped" identifiers.
 *
 * Standard Zod `.uuid()` enforces strict RFC-4122: the version nibble (13th hex
 * digit) must be 1–5/8 and the variant nibble (17th) must be 8–b. The project's
 * seed/fixture data uses synthetic, sequential UUID-shaped IDs (e.g.
 * `00000000-0000-0000-0000-00000000a10a`) whose version/variant nibbles are `0`,
 * which `.uuid()` rejects.
 *
 * This validator accepts the canonical 8-4-4-4-12 hex layout without enforcing
 * the version/variant nibbles, so it still rejects malformed input (wrong
 * length, non-hex characters, missing separators) while allowing both real
 * UUIDs and the synthetic seed IDs the database actually stores.
 *
 * Use this in place of `z.string().uuid()` for identifier fields that reference
 * seeded entities (household, tenant, device, user, schedule, etc.).
 *
 * @see 05-security-guideline.md — input validation at the BFF boundary
 */

import { z } from 'zod';

/**
 * Canonical UUID layout (8-4-4-4-12 hex), case-insensitive, without
 * RFC-4122 version/variant enforcement.
 */
export const UUID_SHAPE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build a UUID-shaped string validator with a custom error message.
 *
 * @param message - Validation error message (defaults to a generic one).
 */
export const uuidLike = (message = 'Invalid UUID format') =>
  z.string().regex(UUID_SHAPE_REGEX, message);
