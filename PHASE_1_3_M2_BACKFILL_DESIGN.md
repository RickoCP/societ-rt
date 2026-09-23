# FASE 1.3 — M2 Bootstrap & Membership Backfill (DESIGN ONLY)

Status: **DESIGN ONLY — NOT IMPLEMENTED, NOT EXECUTED.** No M2 SQL exists yet, no database was
mutated, no schema/app code changed. This document proposes the M2 design and surfaces the
decisions that must be locked before any M2 SQL is authored.

Preconditions in place:
- M1 (OrgUnit + Membership additive foundation) is live on the primary dev DB, empty
  (`org_units = 0`, `memberships = 0`), structurally verified — tag `phase-1-m1-dev-promoted`
  (`b6ee1f5`), M1 source `phase-1-m1-validated` (`3c01e1f`).
- Read-only inspection for this design (SELECT-only, `default_transaction_read_only = on`) captured
  the current legacy data snapshot (Section 2). No PII was read (counts only).

---

## B1. Objective

M2 will eventually:

1. bootstrap the required `OrgUnit` hierarchy from existing `Tenant` data;
2. create `Membership` rows from existing `User` data;
3. preserve all legacy rows (no update/delete of `tenants`/`users`/`residents`/`households`);
4. perform **no auth cutover** (app keeps using `User.tenantId` + legacy `UserRole`);
5. remain safely rerunnable / idempotent;
6. be validated on a **fresh clone** before any primary-dev execution.

M2 is **data preparation only**. Membership does not become an authorization authority in M2.

---

## B2. Re-read of the actual legacy data model (evidence)

Sources inspected (read-only): `prisma/schema.prisma`, `prisma/migration-add-orgunit-membership.sql`
(M1), `PHASE_1_2A_ANOMALY_AUDIT.md`, `PHASE_1_DATABASE_MIGRATION_PLAN.md`, and the auth model
(`src/core/protocols/AuthContext.ts` + API route usage).

**Auth model (unchanged by M2):** `AuthContext = { userId, tenantId, role: UserRole, … }`. The app
resolves `authContext` from the JWT and reads `authContext.tenantId` / `authContext.userId` /
`authContext.role` pervasively. **No code path reads `memberships`.** So backfilling `memberships`
has zero effect on current authorization — confirming B12/B13.

**Legacy identity facts (from FASE 1.2a + this design's probe):**
- `users.tenant_id` → `tenants.id` (every user belongs to exactly one tenant; 0 orphans).
- `users.role` ∈ legacy `UserRole` {Super_Admin, Ketua_RT, Pengurus, Warga, Security_Guard}; no
  values outside the enum; 0 soft-deleted users (`deleted_at IS NOT NULL` = 0).
- Resident ≠ User (no FK); **M2 backfills memberships from `users` only**, not residents.
- `tenants` has no column indicating RT vs RW vs ORGANIZATION level — the only differentiator
  available is `subdomain` (`platform` vs `rt01`/`rt02`). There is **no legacy data proving any
  RW/Cluster/Organization hierarchy.**

**Current tenant/role matrix (dev snapshot, counts only, 2026-09-23):**

| tenant (`id`)                          | subdomain  | Super_Admin | Ketua_RT | Pengurus | Warga | Security_Guard | total |
| -------------------------------------- | ---------- | ----------- | -------- | -------- | ----- | -------------- | ----- |
| `00000000-0000-0000-0000-000000000010` | `platform` | 3           | 1        | 1        | 2     | 1              | 8     |
| `00000000-0000-0000-0000-000000000011` | `rt01`     | 0           | 1        | 2        | 2     | 2              | 7     |
| `00000000-0000-0000-0000-000000000012` | `rt02`     | 0           | 1        | 2        | 2     | 1              | 6     |
| **total**                              |            | **3**       | **3**    | **5**    | **6** | **4**          | **21**|

> **⚠ Design-critical finding (new vs prior discussion):** the **platform tenant is NOT
> Super_Admin-only.** It also contains 1 Ketua_RT, 1 Pengurus, 2 Warga, 1 Security_Guard (5
> non-admin users). Prior discussion assumed platform admins were purely tenant-level with
> `orgUnitId = NULL`; but those 5 non-admin users in the platform tenant would, under the
> org-scoped rule, require an OrgUnit **inside the platform tenant** to attach to. This directly
> affects the platform-tenant OrgUnit decision (Open Decision D1) and the cardinalities (B5). It
> must be resolved before M2 SQL is written — do not assume.

---

## B3. Tenant → OrgUnit bootstrap design

Legacy `Tenant` historically represents an RT. For each **ordinary RT tenant** (`rt01`, `rt02`):

```text
Tenant (rt01 / rt02)
   ↓  bootstrap
OrgUnit(type = RT, parent_id = NULL, depth = 0, path = {<orgUnitId>})
```

- One root `OrgUnit` of `type = RT` per ordinary RT tenant.
- **No RW / CLUSTER / ORGANIZATION** units are created — legacy data cannot prove such hierarchy,
  and B13 forbids fabricating it.

**Platform tenant (`…010`) — special case, NOT auto-RT.** Do **not** create a fake `RT` OrgUnit
for the platform tenant merely because all tenants share one table. Two candidate treatments
(evidence + recommendation in Open Decision **D1**):

- **Option D1-A — platform tenant gets NO OrgUnit.** Justified *only if* every platform-tenant user
  can be represented tenant-level (`orgUnitId = NULL`). **Problem:** the 5 non-admin platform users
  (Ketua_RT/Pengurus/Warga/Security_Guard) are role-typed for org-scoped membership; leaving them
  tenant-level would be inconsistent with how the same roles are scoped in rt01/rt02.
- **Option D1-B — platform tenant gets a root `ORGANIZATION` OrgUnit.** `type = ORGANIZATION`,
  `parent_id = NULL`. Platform admins remain tenant-level (`orgUnitId = NULL`, per the locked
  Super_Admin rule), while the 5 non-admin platform users attach to the ORGANIZATION OrgUnit. This
  is internally consistent and uses a real (non-RT) type.
- **Option D1-C — treat the 5 non-admin platform users as data to clarify first.** Their presence
  in the platform tenant may itself be a seed/data artifact; confirm whether they *should* exist
  there before deciding the OrgUnit shape.

**Recommendation:** **D1-B** (platform → root `ORGANIZATION` OrgUnit) as the internally-consistent
default, *pending* your confirmation of D1-C (whether those 5 users legitimately belong to the
platform tenant). No fabricated hierarchy either way.

---

## B4. Membership mapping

Locked role mapping (initial migration mapping only):

```text
Super_Admin     → PLATFORM_ADMIN
Pengurus        → ORG_ADMIN
Ketua_RT        → RT_ADMIN
Security_Guard  → SECURITY
Warga           → RESIDENT
```

Locked special case (Super_Admin):

```text
Super_Admin
  → tenantId  = platform tenant (…010)
  → orgUnitId = NULL           (tenant-level)
  → role      = PLATFORM_ADMIN
  → status    = ACTIVE
```

**Membership scope for the other roles** (per tenant):

- For **ordinary RT tenants** (`rt01`, `rt02`): `Ketua_RT`, `Pengurus`, `Security_Guard`, `Warga`
  → **org-scoped** membership on that tenant's **RT root OrgUnit**
  (`orgUnitId = <tenant RT root>`, `tenantId = <that tenant>`, `status = ACTIVE`).
  Rationale: these are community roles operating within the RT; the RT root is the only org unit
  that exists for the tenant, and the M1 partial-unique + same-tenant FK expect org-scoped rows.
- For **platform-tenant non-admin users** (the 5): scope depends on **D1**:
  - under **D1-B**: org-scoped on the platform's `ORGANIZATION` root OrgUnit;
  - under **D1-A**: tenant-level (`orgUnitId = NULL`) — but see the consistency caveat in B2/B3.

Do not assume all non-admin roles share identical scope without the D1 decision; the scope is
identical *within* a tenant (all attach to that tenant's single root unit) but the *platform*
tenant's root type/existence is unresolved.

---

## B5. Expected cardinality

**OrgUnits** — depends on D1:

| scenario                     | RT roots (rt01, rt02) | platform OrgUnit | total OrgUnits |
| ---------------------------- | --------------------- | ---------------- | -------------- |
| D1-A (platform: no OrgUnit)  | 2                     | 0                | **2**          |
| D1-B (platform: ORGANIZATION)| 2                     | 1                | **3**          |

**Memberships** — one per non-deleted user (21 users, 0 soft-deleted), split by scope:

Tenant-level memberships (`orgUnitId = NULL`): the 3 Super_Admin (platform, PLATFORM_ADMIN).

| scenario | tenant-level memberships | org-scoped memberships | total memberships |
| -------- | ------------------------ | ---------------------- | ----------------- |
| D1-A     | 3 (Super_Admin) **+ 5** (platform non-admin, tenant-level) = **8** | 13 (rt01: 7 + rt02: 6) | **21** |
| D1-B     | 3 (Super_Admin)          | 18 (rt01: 7 + rt02: 6 + platform non-admin: 5) | **21** |

Total memberships = **21** in both scenarios (one per user). The split between tenant-level and
org-scoped differs by D1. **Recommended (D1-B): 3 OrgUnits, 21 memberships (3 tenant-level + 18
org-scoped).**

Per-tenant org-scoped membership detail (D1-B):
- rt01 root RT: 7 (1 RT_ADMIN + 2 ORG_ADMIN + 2 RESIDENT + 2 SECURITY)
- rt02 root RT: 6 (1 RT_ADMIN + 2 ORG_ADMIN + 2 RESIDENT + 1 SECURITY)
- platform ORGANIZATION: 5 (1 RT_ADMIN + 1 ORG_ADMIN + 2 RESIDENT + 1 SECURITY)

> Note: under D1-B, the platform ORGANIZATION unit holds users mapped to `RT_ADMIN`/`ORG_ADMIN`/
> `SECURITY`/`RESIDENT`. That is a faithful mapping of their legacy roles; it does not assert they
> are RT-level. If that is undesirable, D1-C (clarify those users) is the lever — not fabricating
> role changes in M2.

---

## B6. Idempotency semantics (explicit — not blind ON CONFLICT DO NOTHING)

For **each** intended OrgUnit and Membership, M2 must classify the current DB state and act:

**Case 1 — ABSENT:** the intended row does not exist → **create it.**

**Case 2 — EXISTS and EXACTLY MATCHES expected state:** treat as **idempotent success** (no-op).
"Exactly matches" means every expected column equals the intended value:
- OrgUnit: same `id` (per stable identity, B7), `tenant_id`, `type`, `parent_id` (NULL for roots),
  `depth = 0`, `path` = `{id}`, `name` as specified.
- Membership: same `user_id`, `tenant_id`, `org_unit_id` (NULL or the tenant's root), `role`,
  `status = ACTIVE`.

**Case 3 — EXISTS but CONFLICTS with expected state:** **STOP / fail the migration (ROLLBACK).**
Do not silently skip or overwrite. Conflict examples:
- expected RT OrgUnit exists but `type` ≠ RT (or wrong `tenant_id`, wrong `parent_id`/`path`/`depth`);
- membership exists with a different `role` than the expected mapping;
- membership exists with a different scope (org-scoped where tenant-level expected, or vice versa);
- an unexpected duplicate candidate (e.g. two RT roots for one tenant);
- a membership row exists for a user M2 did not expect to touch.

`INSERT … ON CONFLICT DO NOTHING` alone is **rejected** because it collapses Case 2 and Case 3 into
"silently skip," hiding drift. M2 must instead: look up the intended row by stable identity (B7);
if found, assert exact-match (Case 2) or fail (Case 3); if not found, insert (Case 1). This can be
implemented as explicit `SELECT … then INSERT`/assert within the transaction, or as
`INSERT … ON CONFLICT DO NOTHING` **followed by** a post-insert verification query that re-reads
every intended row and fails on any mismatch. Design preference: **explicit per-row upsert-with-
assert**, plus a whole-set postcondition verification (B9).

---

## B7. Stable identity / rerun strategy

Reruns must deterministically rediscover the same bootstrap OrgUnit and memberships; relying on a
random `gen_random_uuid()` for the OrgUnit id would make a rerun unable to find the row it created.

Options evaluated:

- **(a) Deterministic OrgUnit id derived from legacy identity** — e.g. a stable, reproducible id
  computed from `tenant_id` (+ a fixed namespace/label like `:root`). A rerun recomputes the same
  id and finds the existing row. Pros: no schema change; deterministic; simple lookup. Cons: must
  pick a derivation that fits the `id TEXT` (uuid-as-text) convention and is collision-free; if
  using a UUIDv5-style derivation, document the namespace + name inputs precisely.
- **(b) Lookup by a proven unique legacy-derived invariant** — since each RT tenant has exactly one
  root OrgUnit, treat `(tenant_id, parent_id IS NULL, type)` as the natural key for the bootstrap
  root and locate it by query rather than by id. Pros: no id engineering. Cons: not enforced by a
  DB unique constraint in M1 (there is no "one root per tenant" unique index), so M2 must guard
  against pre-existing duplicates (Case 3) itself.
- **(c) Explicit bootstrap mapping metadata** (a small mapping table or a well-known `name`/label on
  the OrgUnit recording "bootstrap root for tenant X"). Pros: auditable. Cons: adds an artifact;
  B13 discourages new schema purely for convenience.

Memberships have a natural rerun key already, enforced by M1's partial unique indexes:
`(user_id, tenant_id, org_unit_id) WHERE org_unit_id IS NOT NULL` and `(user_id, tenant_id) WHERE
org_unit_id IS NULL`. So a membership rerun can locate the intended row via `(user_id, tenant_id,
org_unit_id)` and apply the Case 1/2/3 logic.

**Recommendation:** **(a) deterministic OrgUnit id** (documented derivation from `tenant_id`),
combined with the natural-key guard from **(b)** as a defense-in-depth conflict check. Do **not**
add a new schema table (avoids B13 violation). Trade-offs to confirm in Open Decision **D2**.

---

## B8. OrgUnit path / depth for bootstrap roots

Invariant reminder: `parent_id` is canonical; `path` / `depth` are derived optimization fields;
`path` is `TEXT[]`. For every bootstrap **root** unit (RT roots and, under D1-B, the platform
ORGANIZATION root):

```text
parent_id = NULL
depth     = 0
path      = { <this OrgUnit id> }     -- single-element array containing its own id
```

This keeps `parent_id`/`path`/`depth` mutually consistent (a root's path is just itself, depth 0).
M2 creates only roots — no multi-level hierarchy — so there is no risk of inconsistent
parent/path/depth chains in this phase. (Whether `path` should store the id or an empty array for a
root is a small convention point — Open Decision **D3**; recommendation: `path = {id}` so ancestor-
containment queries include self.)

---

## B9. Transaction boundary

M2 executes atomically:

```text
BEGIN
  preconditions            (source guards, B10)
  validate source
  bootstrap OrgUnits       (Case 1/2/3 per unit)
  validate created/existing OrgUnits
  backfill Memberships     (Case 1/2/3 per membership)
  verify postconditions    (expected counts + exact-match set)
COMMIT
```

Any invariant violation at any stage → **ROLLBACK**. No partially-completed backfill is ever
committed. (Note: the M1 idempotency lesson — a single `client.query(sql)` runs as one implicit
transaction; M2 should wrap its logic in an explicit `BEGIN … COMMIT`/`ROLLBACK` and abort on the
first failed assertion.)

---

## B10. Source-data guards (snapshot guards vs domain invariants)

M2 must guard explicitly, and **distinguish** two kinds of guard:

**Snapshot guards (this controlled migration only — not permanent business rules):**
- expected tenant count (currently 3) — abort if different;
- expected user count (currently 21) — abort if different;
- expected role×tenant matrix (Section B2) — abort if the live matrix differs from the approved
  snapshot at execution time (protects against legacy data changing between validation and
  execution).

**Domain invariants (must always hold, regardless of snapshot):**
- unknown legacy role (any `users.role` outside the 5 enum values) → abort;
- NULL tenant ownership (`users.tenant_id IS NULL`) → abort;
- orphan tenant reference (`users.tenant_id` not in `tenants`) → abort;
- platform admin (Super_Admin) found **outside** the platform tenant → abort (violates the locked
  special case);
- unexpected duplicate identity candidate (e.g. >1 root OrgUnit for a tenant, or a pre-existing
  membership conflicting with the mapping) → abort (Case 3).

Counts (3/21 and the matrix) are used as **migration snapshot guards** for this run — they are
recorded as guard constants for the controlled migration, explicitly **not** encoded as permanent
domain rules. The design must comment them as such so a future tenant/user does not "break" a rule
that was only ever a one-time snapshot assertion.

---

## B11. M2 clone validation plan (before any dev promotion)

Same discipline as M1. On a **fresh** clone that already has M1 installed and empty:

```text
PRE-M2 preflight
  M1 installed (org_units + memberships tables present)
  org_units = 0, memberships = 0
  legacy counts/integrity = approved snapshot (3/21/54/19; matrix per B2)
        ↓
M2 run #1
        ↓
postconditions (expected OrgUnits + memberships exactly as B5 for chosen D1)
        ↓
M2 run #2
        ↓
prove idempotency (run #2 creates ZERO additional rows; row set identical)
        ↓
negative / conflict tests (each in a rolled-back transaction)
        ↓
legacy preservation (tenants/users/residents/households unchanged)
```

Tests to design (execute later, on clone only):
- **correct OrgUnit bootstrap** — expected roots exist with correct type/parent/path/depth;
- **correct role mapping** — every membership's role matches the locked mapping for its user;
- **correct membership scope** — Super_Admin tenant-level on platform; RT-tenant users org-scoped
  on the RT root; platform non-admin per D1;
- **idempotency** — second M2 run adds 0 rows and leaves an identical row set;
- **conflicting OrgUnit** — a pre-seeded RT root with wrong `type` causes M2 to FAIL (Case 3);
- **conflicting Membership** — a pre-seeded membership with wrong role/scope causes FAIL (Case 3);
- **unknown legacy role** — a synthetic user with an out-of-enum role causes FAIL (domain guard);
- **cross-tenant mismatch** — attempt to attach a membership to an org unit of another tenant is
  rejected by M1's same-tenant composite FK (already proven in 1.2b; re-assert at M2 level);
- **transaction rollback** — an induced mid-migration failure leaves **no** partial rows.

Not executed in this phase.

---

## B12. No auth cutover

M2 is data preparation only. After M2:
- the app continues to authorize using `AuthContext.tenantId` + legacy `UserRole`
  (`src/core/protocols/AuthContext.ts`), exactly as today;
- `memberships` is **not** consulted by any code path;
- no JWT / session / middleware change.

Membership becomes an authorization authority only in a later, separately-approved cutover phase.

---

## B13. Explicit non-goals

M2 must **NOT**:
- remove `User.tenantId`;
- remove legacy roles / the `UserRole` enum;
- switch auth reads to memberships;
- dual-write application traffic;
- introduce RLS;
- implement NIK encryption;
- implement refresh tokens;
- reconcile B4 schema drift (`gates` / `cctv_cameras` / `homes`);
- redesign IoT ownership;
- create unsupported RW / CLUSTER hierarchy.

---

## B14. Open decisions (must be locked before M2 SQL)

| # | decision | evidence | recommended option | alternatives | risk | blocking? |
|---|----------|----------|--------------------|--------------|------|-----------|
| **D1** | Platform-tenant OrgUnit shape | Platform tenant has 3 Super_Admin **+ 5 non-admin** users (B2 matrix). Prior assumption "platform = admins only" is **false**. | **D1-B**: platform gets a root `ORGANIZATION` OrgUnit; Super_Admin stay tenant-level (NULL), 5 non-admins org-scoped on it — pending D1-C confirmation | D1-A: no platform OrgUnit (5 non-admins become tenant-level, inconsistent with RT scoping); D1-C: first clarify whether the 5 non-admins should exist in the platform tenant | Wrong choice creates inconsistent scope semantics or misrepresents platform users | **BLOCKING** |
| **D2** | OrgUnit stable identity / rerun key | Random uuid breaks rerun rediscovery (B7) | **(a)** deterministic id derived from `tenant_id` + natural-key guard `(tenant_id, type, parent_id IS NULL)` | (b) natural-key lookup only; (c) bootstrap mapping metadata/label | Non-deterministic id → non-idempotent rerun (duplicate roots) | **BLOCKING** |
| **D3** | Root `path` convention | `path TEXT[]`, derived field (B8) | `path = {id}` (self-inclusive) | `path = {}` (empty for roots) | Minor; affects ancestor-containment query semantics | non-blocking (pick before SQL) |
| **D4** | Snapshot-guard strictness | Data may change between validation and dev execution (B10) | Abort if live tenant/user counts or role×tenant matrix differ from approved snapshot | Softer guard (counts only, not full matrix) | Too strict → false aborts on benign change; too loose → backfills unexpected data | non-blocking (recommend strict for controlled run) |
| **D5** | Membership `status` for backfilled rows | M1 default `status = ACTIVE` | All backfilled memberships `ACTIVE` (mirror current active users; 0 locked/inactive in snapshot) | Derive from `users.status` if non-active users appear later | Low now (all 21 users active) | non-blocking |
| **D6** | Platform non-admin users legitimacy (feeds D1) | 1 Ketua_RT/1 Pengurus/2 Warga/1 Security_Guard sit in platform tenant | Confirm whether these are real or seed artifacts before finalizing D1 | Treat as real (D1-B) or relocate/clean first (out of M2 scope) | Backfilling memberships for artifact users would encode a data mistake | **BLOCKING for D1** |

No uncertain migration semantics are silently chosen. D1/D2 (and D6, which feeds D1) must be locked
before M2 SQL is authored.

---

## Execution boundary (this phase)

**DESIGN ONLY.** This phase did not: create M2 SQL, mutate the database, run M2, create
OrgUnits/Memberships, modify `prisma/schema.prisma`, or change application code. Read-only data
inspection was used (SELECT-only, `default_transaction_read_only = on`, counts only, no PII, no
credential printed) solely to ground the mapping and cardinalities.

**STOP.** Awaiting your decisions on D1/D2/D6 (and D3–D5) before any M2 SQL is written or validated.


---

# ADDENDUM (FASE 1.3 — D6 provenance audit + D1 re-evaluation; locked D2–D5)

Status: **READ-ONLY / DESIGN-ONLY.** No M2 SQL, no OrgUnit/Membership, no user/tenant/schema/auth
change, no DDL/DML, no commit. DB inspection was SELECT-only under
`SET default_transaction_read_only = on` (counts + structural booleans; no PII). Two throwaway
read-only probe scripts were created and then deleted.

## LOCKED DECISIONS (this round)

- **D2 (concept LOCKED; exact algorithm proposed in §G, not yet locked):** bootstrap OrgUnit id is
  **deterministic, derived from `tenant_id`**, with explicit conflict detection; **no random UUID**;
  **no new schema** for migration bookkeeping.
- **D3 (LOCKED):** bootstrap roots use `parent_id = NULL`, `depth = 0`, `path = ARRAY[id]::text[]`.
- **D4 (LOCKED):** strict **migration snapshot guards** for this controlled run; current counts are
  **snapshot expectations, not permanent domain invariants**; any unexpected source-data change
  between design/validation/execution must trigger review, not silent continuation.
- **D5 (LOCKED):** backfilled memberships for legacy active users use `status = ACTIVE`.

D1 and D6 remain **OPEN** pending your decision, informed by the audit below.

## §A. Classification of the five platform non-admin users (anonymized; no PII)

Structural metadata only (no names/emails/NIK/phones). "Resident link" is **structurally
impossible** — `residents` has no `user_id` column (confirmed); so no user maps to a resident by FK.

| alias  | legacy_role     | status | deleted | id shape                     | domain participation (counts) | classification | confidence |
| ------ | --------------- | ------ | ------- | ---------------------------- | ----------------------------- | -------------- | ---------- |
| PNA-01 | Ketua_RT        | active | no      | sequential `…000021`         | incidents.reported_by = **2** | **ambiguous — has domain activity but wrong tenant** | medium |
| PNA-02 | Pengurus        | active | no      | sequential `…000022`         | none (all 0)                  | **likely seed/demo artifact (inactive)** | medium |
| PNA-03 | Warga           | active | no      | sequential `…000023`         | ballots 2, letter_requests 1, announcements_created 1, votes_created 1 | **ambiguous — real domain activity but wrong tenant** | medium-high |
| PNA-04 | Security_Guard  | active | no      | sequential `…000024`         | none (all 0)                  | **likely seed/demo artifact (inactive)** | medium |
| PNA-05 | Warga           | active | no      | **random uuid** `…609028`    | none (all 0)                  | **ambiguous — app-registration-style id, unused** | low-medium |

Observations:
- **PNA-01..04 have sequential ids `…0021`–`…0024`**, immediately following the committed default
  Super_Admin `…0020` (created by `prisma/seed.ts`). This strongly implies they were created by an
  **ad-hoc manual sequence** that continued from `…0020` — but **no committed artifact creates
  them** (see §B). PNA-05 has a random uuid, implying a different (later/manual/app) creation path.
- Three of five (PNA-02/04/05) have **zero** domain participation → consistent with unused
  seed/demo logins. Two (PNA-01, PNA-03) **do** have domain activity, so they are not obviously
  disposable — but that activity lives under the **platform tenant**, which is semantically wrong
  for RT-community roles.

## §B. Seed / fixture provenance

Inspected: `prisma/seed.ts`, `prisma/run-seed-tenants.ts`, `prisma/seed-dummy-tenants.sql`, all
`prisma/seed-dummy-*.sql`, and git history (`git log --all`, `git grep` across all revisions).

| creator (committed)             | platform users it creates                                    |
| ------------------------------- | ------------------------------------------------------------ |
| `prisma/seed.ts`                | 1 Super_Admin only (`…0020`, `admin@societ-rt.com`)          |
| `prisma/run-seed-tenants.ts`    | 3 Super_Admin (by email upsert); rt01 (7), rt02 (6)          |
| `prisma/seed-dummy-tenants.sql` | rt01 users `…101–104`, rt02 users `…201–204` — **none in platform** |
| other `seed-dummy-*.sql`        | announcements/finance/etc. that *reference* platform Super_Admin `…0020` as `created_by`; **create no users** |

**Conclusion — provenance of the 5 platform non-admin users: `UNKNOWN` (not reproducible from the
repo).** No committed seed/migration/script creates a Ketua_RT / Pengurus / Warga / Security_Guard
in the platform tenant. Classification of the unusual platform distribution
(1 Ketua_RT / 1 Pengurus / 1 Security_Guard / 2 Warga):

```text
PROVEN SEED     : NO  (no committed artifact produces them)
LIKELY SEED     : PARTIAL — the sequential ids …0021–0024 look manually seeded in one sitting
REAL/OPERATIONAL: UNLIKELY (this is a dev DB; roles are mis-tenanted; 3 of 5 have no activity)
UNKNOWN         : YES (authoritative classification — created out-of-band, e.g. manual SQL / app
                  registration directly against the dev DB; not in version control)
```

I do **not** assert `PROVEN SEED` — the evidence supports "manually created out-of-band, provenance
not in repo," which is `UNKNOWN` with a lean toward ad-hoc manual seeding.

## §C. Structural relationship evidence (counts only)

Aggregated domain participation of the 5 platform non-admin users:
- PNA-01 (Ketua_RT): 2 incident reports.
- PNA-03 (Warga): 2 ballots, 1 letter request, 1 announcement created, 1 vote created.
- PNA-02, PNA-04, PNA-05: **zero** across all probed relations (ballots, emergency alerts, letter
  requests, notifications, push subs, patrol attendance/sessions, announcements/votes/events/
  finance created_by, incidents reported_by, audit actor, visitor/package logged_by).

Interpretation: an account with real RT-domain relationships (PNA-01, PNA-03) is materially
different from an unused login (PNA-02/04/05). If M2 blindly backfilled memberships for all five,
it would encode **mis-tenanted** data (RT-community roles under the platform tenant) into the new
membership model — carrying a probable data mistake forward.

## §D. Re-evaluation of D1 alternatives (with audit evidence)

- **D1-A — platform gets NO OrgUnit.** The 5 non-admin platform users would have to become
  tenant-level (`orgUnitId = NULL`) memberships, which is inconsistent with how identical roles are
  org-scoped in rt01/rt02, and would bake mis-tenanted RT roles into the model as "platform-level."
  **Rejected** as a default — it forces `memberships = users` at the cost of semantic correctness.
- **D1-B — platform gets a root `ORGANIZATION` OrgUnit.** Internally consistent for scoping, but the
  audit shows the 5 users are **not** genuine platform-organization staff — they are mis-tenanted RT
  roles (or unused artifacts). Choosing ORGANIZATION *just* to solve scoping would assert a semantic
  ("these are the platform organization's members") that the evidence does **not** support.
  **Not recommended** on current evidence.
- **D1-C — exclude/quarantine the 5 anomalous platform non-admin users from M2** pending
  cleanup/reclassification. M2 backfills only the **3 Super_Admin** (tenant-level PLATFORM_ADMIN on
  the platform tenant) and the **13 RT-tenant users** (org-scoped on their RT roots). The 5 platform
  non-admins are left **unmigrated** and flagged for data cleanup. Safest given `UNKNOWN`
  provenance + mixed/zero activity. **RECOMMENDED.**
- **D1-D — correct legacy tenant ownership before M2** (move the 5 users to a real RT tenant). Only
  justified if evidence proved they belong to a specific existing RT — it does **not** (their ids
  don't match any RT seed range; their activity is under the platform tenant). **Not proposed**; and
  in any case M2 must not mutate legacy `users` (B13). Any such correction is a separate, explicitly
  approved data-cleanup step — **not performed here.**

**Recommended D1 = D1-C** (exclude the 5 from M2), with the platform tenant getting **no OrgUnit**
in M2 (only the 3 Super_Admin, tenant-level). This keeps M2 additive, semantically honest, and
avoids encoding an unresolved data anomaly. The platform-organization OrgUnit question can be
revisited later if/when those users are reclassified.

## §E. Revised cardinalities (per option; not forcing memberships = users)

Legacy users = 21 (0 soft-deleted). RT-tenant users = 13 (rt01 7 + rt02 6). Platform users = 8
(3 Super_Admin + 5 non-admin).

| option | OrgUnits | tenant-level memberships | org-scoped memberships | excluded/unresolved users | total memberships |
| ------ | -------- | ------------------------ | ---------------------- | ------------------------- | ----------------- |
| D1-A   | 2 (rt01, rt02 RT roots) | 8 (3 Super_Admin + 5 platform non-admin) | 13 (RT-tenant users) | 0 | 21 |
| D1-B   | 3 (rt01, rt02 RT roots + platform ORGANIZATION) | 3 (Super_Admin) | 18 (13 RT + 5 platform non-admin) | 0 | 21 |
| **D1-C (recommended)** | **2 (rt01, rt02 RT roots)** | **3 (Super_Admin, platform, NULL)** | **13 (RT-tenant users on their RT root)** | **5 (platform non-admin — deliberately excluded)** | **16** |

Under **D1-C**: `memberships (16) < users (21)` by design — the 5 unresolved platform non-admin
users are intentionally **not** migrated. This must be an explicit, documented outcome (with a
migration guard asserting exactly 5 excluded, so an unexpected count triggers review, per D4).

## §F. Authorization semantic findings (read code only — no auth change)

Current app authorization is **ad-hoc per API route** (no central guard). Observed role semantics:

| legacy role     | what current code actually allows (representative) |
| --------------- | -------------------------------------------------- |
| `Super_Admin`   | Platform-level, **cross-tenant**: list/create/suspend/reactivate tenants, platform dashboard, tenant health, impersonate, siren import/export. Gated by `role === Super_Admin` only (not tenant-scoped). |
| `Ketua_RT`      | Top RT authority: everything Pengurus can do **plus** Ketua-only actions — delete announcements/votes (`EDIT_DELETE_ROLES=[Super_Admin,Ketua_RT]`), PATCH tenant, set tenant siren. |
| `Pengurus`      | RT staff/manager: grouped with Ketua_RT in `ADMIN_ROLES=[Super_Admin,Ketua_RT,Pengurus]` (voting manage/tally), `KAS_MANAGER_ROLES=[Ketua_RT,Pengurus,Super_Admin]` (finance), can create invitations, emergency tier-3 recipient — **but excluded** from Ketua-only delete/tenant-admin actions. |
| `Security_Guard`| Security domain: patrol/incident/timeline (`security/timeline` restricted to Ketua_RT/Pengurus/Security_Guard). |
| `Warga`         | Resident/view + participate (vote, RSVP, letter requests); no management. |

**`Pengurus → ORG_ADMIN` broadening risk (flagged):** legacy `Pengurus` is deliberately **less**
privileged than `Ketua_RT` (excluded from delete/tenant-admin). A future cutover that treats
`ORG_ADMIN` as "the org administrator" could **silently grant Pengurus the Ketua-only powers**
(delete content, tenant settings) they do not have today. **Constraint to carry into the auth
cutover phase (not now):** `ORG_ADMIN` derived from a legacy `Pengurus` must remain **strictly ≤
legacy Pengurus** authority; the Ketua-only action set must map to `RT_ADMIN` (Ketua_RT), not to
`ORG_ADMIN`. This is a **future authorization constraint to document**, not a mapping change now —
the locked M2 role mapping (`Pengurus → ORG_ADMIN`) stays for data backfill, since M2 does not
change auth reads (B12).

## §G. Deterministic bootstrap OrgUnit id — 3 concrete alternatives (fictional examples)

Requirements: deterministic, reproducible in PostgreSQL and/or migration tooling, independent of
OS/EOL/runtime randomness, collision-resistant, compatible with the physical `TEXT` id
(uuid-as-text) convention, preferably UUID-formatted.

**Alt-1 — UUIDv5 over a fixed namespace + `"orgunit-root:" || tenant_id`.**
- Exact input: `name = 'orgunit-root:' || <tenant_id>`; `namespace` = a fixed, documented UUID
  constant (e.g. a project-specific namespace UUID recorded in the migration).
- Algorithm: RFC-4122 UUIDv5 (SHA-1 of namespace+name), formatted as canonical UUID text.
- Example (fictional): `uuidv5(NS, 'orgunit-root:00000000-0000-0000-0000-000000000011') → 'b3f1c2a4-...-v5'`.
- PG/tooling: PostgreSQL has no core uuidv5; either compute in migration tooling (Node) or use
  `pgcrypto`/`uuid-ossp` (`uuid_generate_v5`) if the extension is available on Neon. Must confirm
  extension availability, else compute in tooling and pass the literal.
- Collision: cryptographically negligible. Rerun: recompute → same id → rediscover row. Portability:
  high (RFC standard). Pros: canonical UUID, standard, stable. Cons: needs uuidv5 impl / extension;
  requires a documented namespace constant.

**Alt-2 — Deterministic derived UUID text via `encode(digest(...))` shaped into UUID form
(`pgcrypto`).**
- Exact input: `'orgunit-root:' || tenant_id`.
- Algorithm: `sha256` (pgcrypto `digest`), take first 32 hex chars, insert dashes to form a
  UUID-shaped string (optionally set version/variant nibbles).
- Example (fictional): `4f9a1b2c-3d4e-4f60-8a1b-2c3d4e5f6071`.
- PG/tooling: requires `pgcrypto` (commonly available on Neon). Rerun: deterministic. Collision:
  negligible (256-bit input space, truncated to 122 usable bits). Portability: medium (depends on
  pgcrypto). Pros: pure-SQL, no tooling round-trip. Cons: not a true RFC uuidv5; "UUID-shaped"
  rather than a formally versioned UUID unless nibbles are set.

**Alt-3 — Structured non-random deterministic literal derived from the tenant's own id.**
- Exact input: `tenant_id` (which is already a UUID-as-text like `00000000-0000-0000-0000-0000000000
  11`).
- Algorithm: map the tenant id into a reserved OrgUnit id block by a fixed, documented
  transformation (e.g. replace a reserved prefix segment to mark "org-unit-root of this tenant"),
  producing a stable, human-traceable id such as `0000000a-0000-0000-0000-000000000011` (fictional;
  `0000000a` = reserved "orgunit root" marker, tail = source tenant tail).
- PG/tooling: pure string transform; no extension. Rerun: deterministic. Collision: none within the
  reserved block as long as tenant ids are unique. Portability: high. Pros: no extension, no tooling
  hashing, visually traceable back to the source tenant, trivially idempotent. Cons: bespoke scheme
  (must be precisely documented); relies on the reserved-prefix convention not colliding with real
  uuids (safe here since ids are controlled `00000000-…` seeds, but must be asserted).

**Recommendation:** **Alt-1 (UUIDv5)** if `uuid-ossp`/pgcrypto v5 or a tooling computation is
acceptable — it is the standard, portable, collision-resistant choice and yields a canonical UUID.
If we want a pure-SQL migration with **no extension dependency and maximum traceability**, **Alt-3**
is the pragmatic pick given the fully-controlled seed id space. Decide in **D2** (algorithm lock)
before authoring M2. Not implemented.

## §H. Proposed final D1 / D6 resolution (for your decision)

- **D6 (provenance):** the 5 platform non-admin users are **UNKNOWN provenance / not repo-
  reproducible**, a mix of unused artifacts (PNA-02/04/05) and mis-tenanted accounts with real RT
  activity (PNA-01, PNA-03). Treat as a **data anomaly to resolve separately**, not as legitimate
  platform-organization staff.
- **D1 (recommended = D1-C):** platform tenant gets **no OrgUnit** in M2; M2 migrates **16**
  memberships (3 Super_Admin tenant-level + 13 RT-tenant org-scoped) and **excludes the 5** platform
  non-admin users, with a strict guard asserting exactly 5 excluded. Revisit those 5 (and any
  platform-organization OrgUnit) only after they are reclassified/cleaned up in a separate,
  explicitly-approved step. This deliberately makes `memberships (16) ≠ users (21)`.

These are **recommendations pending your lock** — not implemented. No M2 SQL authored.

---

# FINAL DECISIONS (locked by user; validated in FASE 1.4)

These supersede the "recommended/pending" language above. All were locked by the user and validated
on the isolated pre-M2 clone (`M2_CLONE_VALIDATION_PASS = true`; see
`PHASE_1_4_M2_CLONE_VALIDATION_REPORT.md`).

| decision | FINAL |
| -------- | ----- |
| **D1** | **D1-C** — platform tenant gets **NO OrgUnit**; migrate 16 memberships (3 Super_Admin tenant-level PLATFORM_ADMIN + 13 RT org-scoped); **exclude the 5** platform anomalies via an explicit manifest. `memberships (16) ≠ users (21)` by design. |
| **D2** | **UUIDv5**, namespace `f0e1d2c3-b4a5-5968-8776-655443322110`, name `societ-rt:orgunit:legacy-tenant-root:<tenant_id>`, UTF-8, canonical lowercase output, **no PG extension** (computed in tooling, pinned as SQL literals, independently reproduced by the validator). Derived: rt01 `2459b0bb-115e-52ce-88cd-c176a9aa1e39`, rt02 `50197f3e-5ebc-5547-91ba-e54b604e0edb`. |
| **D3** | Bootstrap roots: `parent_id = NULL`, `depth = 0`, `path = ARRAY[id]::text[]`. |
| **D4** | Strict migration snapshot guards (counts are snapshot expectations for the controlled run; any mismatch → FAIL/ROLLBACK). |
| **D5** | Backfilled memberships `status = ACTIVE`. |
| **D6** | Provenance of the 5 platform non-admin users = **UNKNOWN / legacy data anomaly**. Excluded from M2. Do **not** move/delete/re-role/infer target RT/create memberships — remediation is a separate future data-cleanup activity. |

Expected M2 cardinality (locked & validated): **2 OrgUnits; 16 memberships (3 platform-level + 13 RT
org-scoped); 5 excluded**.

M2 artifact: `prisma/migration-m2-bootstrap-orgunits-memberships.sql`. Validated on clone
`ep-winter-river-aol4em67` (verified clean isolated pre-M2 clone). **Not yet applied to primary dev.**
