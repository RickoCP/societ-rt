/**
 * FASE 1.4 — Deterministic bootstrap OrgUnit ID derivation (D2 LOCKED = UUIDv5).
 *
 * SINGLE SOURCE OF TRUTH for the deterministic OrgUnit root id.
 * No PostgreSQL extension dependency: UUIDv5 is computed here (RFC 4122, SHA-1)
 * and the resulting literal is what the M2 SQL uses/verifies. The clone validator
 * imports THIS module so the value is independently reproducible from one place.
 *
 * D2 canonicalization spec (LOCKED — do not change once M2 is validated):
 *   - Namespace UUID (fixed, recorded once):  M2_ORGUNIT_NAMESPACE_UUID (below).
 *   - Canonical name input:  'societ-rt:orgunit:legacy-tenant-root:' + <tenant_id>
 *   - tenant_id is consumed EXACTLY as stored (canonical lowercase uuid text,
 *     e.g. '00000000-0000-0000-0000-000000000011'); NO trimming/reformatting
 *     beyond the guard below. If a tenant_id is not already lowercase/trimmed the
 *     guard THROWS (fail-closed) rather than silently normalizing.
 *   - Encoding: UTF-8.
 *   - Output: canonical lowercase UUID string (8-4-4-4-12), version nibble = 5,
 *     variant bits = RFC 4122 (10xx).
 *
 * The generated id is stored in the physical TEXT id column (uuid-as-text).
 */

import { createHash } from 'node:crypto';

/**
 * FIXED SocieT-RT namespace UUID for OrgUnit derivation.
 * Generated ONCE for this project and recorded here as an immutable constant.
 * NEVER regenerate or change this value — doing so changes every derived id and
 * breaks idempotent rediscovery of already-migrated OrgUnits.
 */
export const M2_ORGUNIT_NAMESPACE_UUID = 'f0e1d2c3-b4a5-5968-8776-655443322110';

/** Canonical name prefix (LOCKED). */
export const M2_ORGUNIT_NAME_PREFIX = 'societ-rt:orgunit:legacy-tenant-root:';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Parse a canonical UUID string into a 16-byte Buffer. Throws if malformed. */
function uuidToBytes(uuid) {
  if (typeof uuid !== 'string' || !UUID_RE.test(uuid)) {
    throw new Error(`M2_ID_ERROR: not a canonical lowercase UUID: ${JSON.stringify(uuid)}`);
  }
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** Format a 16-byte Buffer as canonical lowercase UUID text. */
function bytesToUuid(buf) {
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * RFC 4122 UUIDv5 (name-based, SHA-1) over a namespace UUID and a name string.
 * name is encoded as UTF-8.
 */
export function uuidv5(name, namespaceUuid) {
  const ns = uuidToBytes(namespaceUuid);
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = createHash('sha1')
    .update(ns)
    .update(nameBytes)
    .digest(); // 20 bytes
  const bytes = hash.subarray(0, 16);
  // Set version (5) in the high nibble of byte 6.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  // Set RFC 4122 variant (10xx) in the high bits of byte 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

/**
 * Guard the tenant_id per the LOCKED canonicalization rule: it must already be a
 * canonical lowercase UUID with no surrounding whitespace. Fail-closed otherwise.
 */
export function assertCanonicalTenantId(tenantId) {
  if (typeof tenantId !== 'string') {
    throw new Error('M2_ID_ERROR: tenant_id must be a string');
  }
  if (tenantId !== tenantId.trim()) {
    throw new Error(`M2_ID_ERROR: tenant_id has surrounding whitespace: ${JSON.stringify(tenantId)}`);
  }
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`M2_ID_ERROR: tenant_id is not canonical lowercase uuid text: ${JSON.stringify(tenantId)}`);
  }
  return tenantId;
}

/** The exact canonical name input for a given tenant. */
export function orgUnitRootName(tenantId) {
  assertCanonicalTenantId(tenantId);
  return M2_ORGUNIT_NAME_PREFIX + tenantId;
}

/**
 * Deterministic bootstrap OrgUnit root id for a tenant (D2 LOCKED).
 * = UUIDv5( 'societ-rt:orgunit:legacy-tenant-root:' + tenant_id , NAMESPACE ).
 */
export function deterministicOrgUnitId(tenantId) {
  return uuidv5(orgUnitRootName(tenantId), M2_ORGUNIT_NAMESPACE_UUID);
}

// Allow running directly to print derived ids for known tenants (evidence/tooling).
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/') ||
    process.argv[1]?.endsWith('m2-orgunit-id.mjs')) {
  const tenants = process.argv.slice(2);
  const list = tenants.length
    ? tenants
    : [
        '00000000-0000-0000-0000-000000000011', // rt01
        '00000000-0000-0000-0000-000000000012', // rt02
      ];
  const out = {
    namespace_uuid: M2_ORGUNIT_NAMESPACE_UUID,
    name_prefix: M2_ORGUNIT_NAME_PREFIX,
    derived: list.map(t => ({
      tenant_id: t,
      canonical_name: orgUnitRootName(t),
      org_unit_id: deterministicOrgUnitId(t),
    })),
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
