# PHASE 1.2b — M1 (OrgUnit + Membership) Validation Report

# FASE 1.2b M1 CLONE VALIDATION: PASS

Scope: M1 only (additive OrgUnit + Membership foundation). No M2/M3. No cutover. No drops.
Baseline: git tag `pre-phase-1-clean-baseline`, commit `9747d47c079363a34bad6eda2e9555c417634594`, branch `feature`.

Final verdict: **PASS** — the authoritative artifact reports `result.overall_pass = true` with every
gate green (preflight, run #1, idempotent run #2 with identical schema snapshot, structural
inspection, exact ordered enums, composite same-tenant FK proof, candidate unique index, both
partial uniques, GIN path index, NT1–NT8, clean rollback residue, legacy counts unchanged).

Validation history (honest audit trail — no attempt rewritten or removed):

| attempt | environment                          | verdict                                                        |
| ------- | ------------------------------------ | -------------------------------------------------------------- |
| #1      | clone `ep-winter-river-aol4em67`     | **FAIL** — M1 migration idempotency defect (`42P07`)           |
| #2      | fresh clone `ep-red-dawn-aorpo22p`   | **FAIL** — validator enum parsing/assertion defect; M1 evidence otherwise green |
| #3 (final) | fresh clone `ep-morning-boat-aophuh8j` | **PASS** — corrected migration + corrected validator; `overall_pass = true` |

Audit trail: `migration defect → fix (Option A) → validator defect → fix (enum assertion) →
clean end-to-end validation (Attempt #3, pending)`. Each fix narrowed the failure surface; the
sequence increases confidence in the migration rather than hiding rework.

> **Attempt #1 (FAIL — migration):** run #2 aborted with `42P07 — relation
> "org_units_id_tenant_id_key" already exists`. The candidate key used `ALTER TABLE ... ADD
> CONSTRAINT ... UNIQUE`, whose backing index raises `42P07 duplicate_table` on re-run, not caught
> by `EXCEPTION WHEN duplicate_object` (`42710`). Details: Sections 8a–16.
> **Fix (APPROVED — Option A, migration file only):** candidate key is now
> `CREATE UNIQUE INDEX IF NOT EXISTS "org_units_id_tenant_id_key" ON "org_units" ("id","tenant_id")`,
> natively idempotent. No `schema.prisma` change (`@@unique([id, tenantId])` maps to a unique index).
>
> **Attempt #2 (FAIL — validator, not migration):** on a fresh clone, `overall_pass = false`
> blocked solely by the validator's `enums_present` check, which used `Array.isArray()` on a
> PostgreSQL `text[]` that the `pg` driver returned as the array-literal string `"{...}"`. Every
> real DB gate passed (idempotency, composite-FK proof, NT1–NT8 with correct SQLSTATEs, residue,
> legacy). Details: Sections 21–24.
> **Fix (validator only):** normalize enum labels + exact ordered per-enum checks; M1 SQL
> unchanged; `prisma validate` still passes.
>
> **Attempt #3 (PASS — final):** the corrected validator ran on a brand-new PRE-M1 clone
> (`ep-morning-boat-aophuh8j`) and produced `overall_pass = true` end-to-end. Every gate is green,
> including exact ordered enum validation (the check that was buggy in #2). See Sections 25–30.
> Nothing has been applied to the primary dev DB in any attempt.

---

## 1. Final M1 Schema (conceptual)

Two additive tables plus three enums. Nothing existing is altered or dropped.

**`org_units`** — a node in a tenant's org hierarchy (`ORGANIZATION > CLUSTER > RW > RT`).

| column      | type            | notes                                             |
| ----------- | --------------- | ------------------------------------------------- |
| id          | TEXT PK         | `gen_random_uuid()::text` (uuid-as-text)          |
| tenant_id   | TEXT NOT NULL   | FK → `tenants(id)`                                |
| parent_id   | TEXT NULL       | self FK; NULL = root                              |
| type        | OrgUnitType     | enum                                              |
| name        | TEXT NOT NULL   |                                                   |
| path        | TEXT[] NOT NULL | default `{}` (logical uuid ids in TEXT storage)   |
| depth       | INTEGER NOT NULL| default `0`, CHECK `depth >= 0`                   |
| created_at  | TIMESTAMP(3)    | default `now()`                                   |
| updated_at  | TIMESTAMP(3)    | default `now()`                                   |

**`memberships`** — links a `User` to a `Tenant` with a role, optionally scoped to an `OrgUnit`.

| column       | type              | notes                                      |
| ------------ | ----------------- | ------------------------------------------ |
| id           | TEXT PK           | `gen_random_uuid()::text`                  |
| user_id      | TEXT NOT NULL     | FK → `users(id)`                           |
| tenant_id    | TEXT NOT NULL     | FK → `tenants(id)`                         |
| org_unit_id  | TEXT NULL         | NULL = tenant-level; else same-tenant FK   |
| role         | MembershipRole    | enum                                       |
| status       | MembershipStatus  | default `ACTIVE`                           |
| created_at   | TIMESTAMP(3)      | default `now()`                            |
| updated_at   | TIMESTAMP(3)      | default `now()`                            |
| revoked_at   | TIMESTAMP(3) NULL |                                            |

Hierarchy semantics (parent → child): `ORGANIZATION → CLUSTER → RW → RT`. A tenant models a
commercial org; RT/RW are org units **inside** a tenant (consistent with the "Tenant ≠ RT"
target design).

---

## 2. Prisma Model Changes (`prisma/schema.prisma`)

All changes are additive. No existing model column was modified.

- Added enums `OrgUnitType`, `MembershipRole`, `MembershipStatus`.
- Added models `OrgUnit`, `Membership` (with `@@map("org_units")` / `@@map("memberships")`).
- Added **back-relations only** on existing models (relation fields do not create DB columns):
  - `User.memberships  Membership[]`
  - `Tenant.orgUnits    OrgUnit[]`
  - `Tenant.memberships Membership[]`
- Same-tenant composite relations expressed via Prisma composite keys:
  - `OrgUnit.parent` self-relation `@relation("OrgUnitHierarchy", fields: [parentId, tenantId], references: [id, tenantId])` + `OrgUnit.children`
  - `Membership.orgUnit` `@relation(fields: [orgUnitId, tenantId], references: [id, tenantId])`
  - backed by candidate key `@@unique([id, tenantId], map: "org_units_id_tenant_id_key")` on `OrgUnit`
- `path String[] @default([])`, `depth Int @default(0)`.

`prisma validate` → **valid**. `prisma generate` → **success** (see Section 14).

---

## 3. SQL Migration (`prisma/migration-add-orgunit-membership.sql`)

Authoritative DDL applied to the database via `node scripts/run-migration.mjs <file>`.
Properties:

- **Additive only** — `CREATE TYPE` / `CREATE TABLE IF NOT EXISTS` / `ADD CONSTRAINT` /
  `CREATE INDEX IF NOT EXISTS`. No `ALTER`/`DROP` of existing objects.
- **DDL only** — no data backfill (backfill = M3, out of scope here).
- **Idempotent** — enums guarded by `EXCEPTION WHEN duplicate_object THEN NULL`; tables/indexes
  use `IF NOT EXISTS`; each `ADD CONSTRAINT` is wrapped in a `DO $$ ... EXCEPTION WHEN
  duplicate_object THEN NULL; END $$;` block. Re-running the file is a no-op.
- **Convention-matched** — TEXT ids, snake_case columns, plural table names, `TIMESTAMP(3)`,
  matching the existing migration files in `prisma/`.
- Ends with a read-only structural `SELECT` (`to_regclass(...)`) that is safe to re-run.

---

## 4. Enums

| enum               | labels (ordered)                                                                 |
| ------------------ | -------------------------------------------------------------------------------- |
| `OrgUnitType`      | `ORGANIZATION`, `CLUSTER`, `RW`, `RT`                                             |
| `MembershipRole`   | `PLATFORM_ADMIN`, `TENANT_OWNER`, `ORG_ADMIN`, `RT_ADMIN`, `SECURITY`, `RESIDENT`|
| `MembershipStatus` | `INVITED`, `ACTIVE`, `SUSPENDED`, `REVOKED`                                       |

`MembershipRole` is a **new** enum. The legacy `UserRole` enum (`Super_Admin`, `Ketua_RT`,
`Pengurus`, `Warga`, `Security_Guard`) is **not** modified, reused, or dropped. Role mapping
from `UserRole` → `MembershipRole` is an **M3 backfill** concern (out of scope for M1); the
locked mapping for that later step is recorded in Section 17.

---

## 5. Constraints + DB-level Invariants

Invariants enforced by the M1 migration:

| id  | invariant                                                        | mechanism                                             |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| I1  | org unit belongs to a valid tenant                               | FK `org_units_tenant_id_fkey`                         |
| I2  | parent (if set) exists                                           | composite FK `org_units_parent_same_tenant_fkey`      |
| I3  | parent is in the **same** tenant                                 | composite FK `(parent_id, tenant_id) → (id, tenant_id)` |
| I4  | depth ≥ 0                                                        | CHECK `org_units_depth_nonneg_check`                  |
| I5  | root allowed (parent_id NULL not checked, MATCH SIMPLE)          | FK NULL semantics                                     |
| I6  | membership belongs to a valid user                               | FK `memberships_user_id_fkey`                         |
| I7  | membership belongs to a valid tenant                             | FK `memberships_tenant_id_fkey`                       |
| I8  | scoped membership's org unit is in the **same** tenant           | composite FK `memberships_org_unit_same_tenant_fkey`  |
| I9  | ≤ 1 org-scoped membership per `(user, tenant, org_unit)`         | partial unique `memberships_user_tenant_orgunit_uq`   |
| I10 | ≤ 1 tenant-level membership per `(user, tenant)`                 | partial unique `memberships_user_tenant_null_orgunit_uq` |

Candidate key `org_units_id_tenant_id_key UNIQUE(id, tenant_id)` exists so the composite
same-tenant FKs (I3, I8) can reference `(id, tenant_id)`.

**Deferred invariants (NOT enforced by M1, by design):**

- `path` / `depth` correctness, cycle prevention, subtree moves → hierarchy service (post-M1).
- `memberships.org_unit_id NOT NULL` → only after M3 backfill decides scope semantics.
- Authorization semantics (e.g. "PLATFORM_ADMIN bypasses tenant isolation") → auth cutover
  phase. Per B1, **no** such bypass rule is introduced in Phase 1.

---

## 6. Indexes

| table       | index                                        | purpose                                   |
| ----------- | -------------------------------------------- | ----------------------------------------- |
| org_units   | `org_units_id_tenant_id_key` (unique)        | candidate key for composite FKs           |
| org_units   | `org_units_tenant_id_idx`                    | tenant-scoped lookups                     |
| org_units   | `org_units_parent_id_idx`                    | child lookups / tree walks                |
| org_units   | `org_units_path_gin_idx` (GIN on `path`)     | subtree/ancestor containment queries      |
| memberships | `memberships_user_id_idx`                    | "my memberships"                          |
| memberships | `memberships_tenant_id_idx`                  | tenant member lists                       |
| memberships | `memberships_org_unit_id_idx`                | org-unit member lists                     |
| memberships | `memberships_user_tenant_orgunit_uq` (partial unique) | I9                               |
| memberships | `memberships_user_tenant_null_orgunit_uq` (partial unique) | I10                         |

---

## 7. Schema Drift Explicitly Excluded (B4)

The following models exist in `prisma/schema.prisma` but the corresponding tables were found
**absent** from the primary dev DB during the Phase 1.2a audit: `gates`, `cctv_cameras`,
`homes`. Per locked decision **B4**, this is **separate, known technical debt** and is **out
of scope** for M1. Consequences applied here:

- M1 was authored as hand-written **additive SQL** run via `scripts/run-migration.mjs`, **not**
  via `prisma migrate dev` / `prisma db push`. This deliberately avoids Prisma's full-schema
  diff, which would otherwise try to reconcile the `gates`/`cctv_cameras`/`homes` drift.
- No attempt was made to create, drop, or "fix" those drifted tables in this phase.
- Trade-off accepted: `prisma migrate diff` against this schema will report drift unrelated to
  M1. That is expected and intentional under B4. The SQL migration file remains the source of
  truth for what M1 changes in the database.

---

## 8. Clone Strategy (B5) — and current blocker

**Rule (B5):** M1 must be validated on a Neon **clone/branch** first, never on the primary dev
DB as the initial target.

**Blocker:** no automated clone path is available in this environment:

- `neonctl` / `neon` CLI: **not installed**.
- `NEON_API_KEY` / Neon project id: **not present** in `.env`.
- `DATABASE_URL`: points **directly** at the primary dev DB
  (`neondb` @ `ep-dry-cake-aoi3l143-pooler...`). Reusing it would violate B5.

**What you need to provide:** a connection string for a Neon **branch/clone** of the dev
database, supplied via a **new** env var `CLONE_DATABASE_URL` (kept distinct from
`DATABASE_URL`). Two easy ways to create one:

1. Neon Console → your project → **Branches** → *Create branch* (from the dev branch) → copy
   the branch's connection string.
2. If you install the CLI: `neonctl branches create` then `neonctl connection-string <branch>`.

**Ready-to-run validator:** `scripts/validate-m1-clone.mjs`. Safety design:

- Refuses to run unless `CLONE_DATABASE_URL` is set.
- Refuses to run if `CLONE_DATABASE_URL === DATABASE_URL` (prevents accidentally hitting the
  dev DB).
- Applies M1 twice (idempotency), inspects objects, runs the negative/positive constraint tests
  inside a transaction that is **always rolled back**, then confirms legacy row counts are
  unchanged. It never writes persistent data.

Run (PowerShell):

```powershell
$env:CLONE_DATABASE_URL = "postgresql://<neon-branch-connection-string>"
node scripts/validate-m1-clone.mjs > _m1_clone_out.json
```

Run (PowerShell) that was executed:

```powershell
$env:CLONE_DATABASE_URL = "postgresql://<neon-branch-connection-string>"
node scripts/validate-m1-clone.mjs > _m1_clone_out.json
```

---

---

# ══════════════════════════════════════════════════════════════════════════
# VALIDATION ATTEMPT #1 — FAIL (retained as history; do not delete)
# clone `ep-winter-river-aol4em67`, PostgreSQL 17.11, user `neondb_owner`
# ══════════════════════════════════════════════════════════════════════════

## 8a. Root-Cause Analysis — idempotency FAIL (NOT fixed on DB)

**Observed:** `_m1_clone_out.json` contains `run1.applied = true`, no `run2` key, and a
top-level error:

```json
"error": { "message": "relation \"org_units_id_tenant_id_key\" already exists", "code": "42P07" }
```

**Interpretation:** run #1 applied the entire migration successfully. Run #2 (the same file) then
aborted while trying to re-add the `org_units_id_tenant_id_key` UNIQUE constraint.

**Root cause (single, isolated authoring bug):** the candidate-key constraint is added with

```sql
DO $$ BEGIN
  ALTER TABLE "org_units"
    ADD CONSTRAINT "org_units_id_tenant_id_key" UNIQUE ("id", "tenant_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

In PostgreSQL, `ADD CONSTRAINT ... UNIQUE` implicitly **creates a backing index** — a *relation*.
When that relation already exists, PostgreSQL raises **`42P07` (`duplicate_table`)** with message
`relation "..." already exists`, which maps to the PL/pgSQL condition **`duplicate_table`**, not
`duplicate_object` (`42710`). The `EXCEPTION WHEN duplicate_object` handler therefore does **not**
catch it, the `DO` block re-raises, and the statement aborts the run.

**Why only this one statement failed:** every other guarded statement is genuinely idempotent —
- enums: `CREATE TYPE` raises `42710 duplicate_object` → correctly caught;
- FK constraints (`ADD CONSTRAINT ... FOREIGN KEY`): raise `42710 duplicate_object` → correctly
  caught;
- tables: `CREATE TABLE IF NOT EXISTS` → safe;
- regular / GIN / partial-unique indexes: `CREATE [UNIQUE] INDEX IF NOT EXISTS` → safe;
- CHECK: created inline with the table → only ever created once.

The lone offender is the `ADD CONSTRAINT ... UNIQUE` form, because it is the only guarded
statement whose failure surfaces as a *relation-already-exists* (`42P07`) rather than an
*object-already-exists* (`42710`).

**Classification:** this is a `MIGRATION IDEMPOTENCY DEFECT`, not a false alarm and not an
unrelated SQL/setup error. The migration is correct on a first apply but not safely re-runnable.

**Proposed fix (NOT applied — awaiting approval):** make the candidate key idempotent without
relying on exception-condition matching. Two safe options:

- Option A (preferred, symmetric with the index guards): replace the constraint form with a
  plain unique index, which supports `IF NOT EXISTS`:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS "org_units_id_tenant_id_key"
    ON "org_units" ("id", "tenant_id");
  ```
  A unique **index** on `(id, tenant_id)` is a valid target for the composite foreign keys
  `org_units_parent_same_tenant_fkey` and `memberships_org_unit_same_tenant_fkey`, so I3/I8 are
  preserved. (A referenced-side FK target may be a unique index or a unique constraint; both work.)
- Option B (keep it a named constraint): broaden the guard to also swallow the relation-exists
  condition, e.g. `EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;`, or pre-check
  `pg_constraint` before adding.

Recommendation: **Option A**, because it is consistent with how the other unique indexes in this
migration are already written (`CREATE UNIQUE INDEX IF NOT EXISTS`) and avoids depending on which
SQLSTATE PostgreSQL happens to raise.

**State of the clone after this run:** run #1 fully applied M1 to the clone (objects exist there).
Run #2 aborted before making any change (it only re-issued idempotent statements up to the failing
one). No negative tests ran (the validator exits on the run-#2 error before reaching them), so no
data was inserted; the negative-test transaction was never opened, and nothing needs rolling back.
No action was taken to clean up the clone. **The primary dev DB was not touched.**

---

## 9. M1 Run #1 (apply)

Performed by the validator step `run1`: executes the full migration file against the clone.

- Expected: success; creates 3 enums, 2 tables, candidate key, FKs, checks, indexes, and the
  two partial unique indexes.
- **Actual: PASS.** `_m1_clone_out.json` → `steps.run1.applied = true`. The full migration
  applied cleanly on the first run (this is consistent with all objects being creatable from a
  clean state; the target tables did not exist beforehand — see Section 13,
  `pre_target_exists = { org_units_exists: false, memberships_exists: false }`).

---

## 10. M1 Run #2 (idempotency)

Performed by the validator step `run2`: executes the **same** migration file again.

- Expected: success with no error and no duplicate objects (guarded `CREATE`/`ADD CONSTRAINT`).
- **Actual: FAIL.** The second run aborted with:

  | field    | value                                                        |
  | -------- | ------------------------------------------------------------ |
  | SQLSTATE | `42P07` (`duplicate_table`)                                  |
  | message  | `relation "org_units_id_tenant_id_key" already exists`       |
  | offending statement | `ALTER TABLE "org_units" ADD CONSTRAINT "org_units_id_tenant_id_key" UNIQUE ("id","tenant_id")` |
  | reason   | guarded by `EXCEPTION WHEN duplicate_object` (`42710`) but PostgreSQL raised `42P07` |

  Because run #2 threw, the migration is **not idempotent**. See Section 8a for root cause and the
  proposed (unapplied) fix. The `_m1_clone_out.json` has no `run2` key and no negative-test/
  verification sections, because the validator exits on the first error.

---

## 11. Negative Constraint Tests (rolled-back transaction)

Executed by the validator inside a single `BEGIN … ROLLBACK` block; each individual test uses a
savepoint so a failure does not poison the transaction. **Nothing persists.**

**Actual: NOT EXECUTED.** The validator aborts on the run-#2 idempotency error (Section 10)
before it reaches the negative-test block, so none of NT1–NT7 ran. The negative-test transaction
was never opened; no rows were inserted; there is nothing to roll back.

Per the requested reporting format `Test | Expected | Actual | Constraint/SQLSTATE | PASS/FAIL`:

| Test | Expected                        | Actual        | Constraint / SQLSTATE | PASS/FAIL |
| ---- | ------------------------------- | ------------- | --------------------- | --------- |
| NT1  | EXPECTED CONSTRAINT REJECTION (I3)  | NOT EXECUTED | —                  | BLOCKED   |
| NT2  | EXPECTED CONSTRAINT REJECTION (I8)  | NOT EXECUTED | —                  | BLOCKED   |
| NT3  | EXPECTED CONSTRAINT REJECTION (I9)  | NOT EXECUTED | —                  | BLOCKED   |
| NT4  | EXPECTED CONSTRAINT REJECTION (I10) | NOT EXECUTED | —                  | BLOCKED   |
| NT5  | EXPECTED CONSTRAINT REJECTION (I6)  | NOT EXECUTED | —                  | BLOCKED   |
| NT6  | EXPECTED CONSTRAINT REJECTION (I7)  | NOT EXECUTED | —                  | BLOCKED   |
| NT7  | EXPECTED SUCCESS (I10 boundary)     | NOT EXECUTED | —                  | BLOCKED   |

These will be re-run after the idempotency fix (Section 8a) is approved and applied to the
migration file, on a **fresh** clone. Fixtures require ≥2 tenants and ≥1 user; the clone snapshot
has 3 tenants and 21 users (Section 13), so fixtures will be available.

---

## 12. Verification Queries

The validator captures, after both runs:

- table existence: `org_units`, `memberships` present.
- enum labels for `OrgUnitType`, `MembershipRole`, `MembershipStatus`.
- FK / CHECK / UNIQUE constraint definitions on both tables (via `pg_get_constraintdef`).
- partial unique index definitions on `memberships` (the two `WHERE` indexes).
- row counts: `org_units_rows`, `memberships_rows` (expected `0` post-DDL, since M1 is DDL-only).

**Actual: NOT CAPTURED.** The object-inspection and verification steps run *after* run #2 in the
validator, so they did not execute once run #2 threw. Consequently this report cannot yet confirm
from live queries that the expected enums / tables / indexes / FKs / CHECK / GIN index / partial
uniques exist and are active — those confirmations remain **PENDING (fresh clone re-run after
fix)**. (Run #1 did create these objects on the current clone, but they were not read back and
verified, so they are not asserted here.)

---

## 13. Pre / Post Counts (legacy tables)

The validator snapshots `tenants`, `users`, `residents`, `households` row counts **before** run
#1 and **after** all steps, and asserts they are byte-for-byte identical (`legacy_unchanged`).

Only the **pre** snapshot was captured (`_m1_clone_out.json` → `steps.pre_counts`); the **post**
snapshot and the `legacy_unchanged` assertion run after run #2, which aborted, so they were not
captured.

| table      | pre (captured) | post          | unchanged     |
| ---------- | -------------- | ------------- | ------------- |
| tenants    | **3**          | NOT CAPTURED  | NOT ASSERTED  |
| users      | **21**         | NOT CAPTURED  | NOT ASSERTED  |
| residents  | **54**         | NOT CAPTURED  | NOT ASSERTED  |
| households | **19**         | NOT CAPTURED  | NOT ASSERTED  |

The pre-counts exactly match the Phase 1.2a dev-DB audit (3 tenants, 21 users, 54 residents, 19
households), confirming the clone is a faithful copy of the dev DB at clone time. Also captured:
`steps.pre_target_exists = { org_units_exists: false, memberships_exists: false }` — the target
tables did not exist before run #1, as expected for a first apply.

**Legacy-preservation note:** M1 is DDL-only and touches no legacy table, and run #1 inserted no
data, so there is no reason to believe any legacy row changed. However, because the post snapshot
was not taken, this report does **not** assert `legacy_unchanged = true` from evidence. It will be
confirmed on the fresh-clone re-run after the fix.

---

## 14. App Regression (executed now, no DB writes)

Run against the current working tree with the M1 schema changes applied and the Prisma client
regenerated. All results match the accepted baseline ceiling.

| check                     | command                    | result                                                       |
| ------------------------- | -------------------------- | ------------------------------------------------------------ |
| Prisma schema validation  | `prisma validate`          | **PASS** (`schema is valid`)                                 |
| Prisma client generate    | `prisma generate`          | **PASS** — generated to `src/generated/prisma` (~357 ms)     |
| TypeScript typecheck       | `tsc --noEmit`             | **PASS** (exit 0)                                            |
| Lint                      | `eslint`                   | **5 errors, 11 warnings** — 5 errors are the exact D1–D5 identity set; **no new errors** |
| Unit tests                | `vitest run`               | **70 passed (70)**, 8 test files                             |
| Production build          | `next build --webpack`     | **PASS** (exit 0); in-build TS check passed; 122/122 static pages |

**Correction to a prior assumption:** `prisma generate` **now succeeds on Windows**. The
generator uses provider `prisma-client` (not `prisma-client-js`), which does not require the
native query-engine binary that previously failed with `spawn UNKNOWN`. No manual/CI-only
regenerate step is required for M1.

D1–D5 lint identity (unchanged, accepted debt — `react-hooks/set-state-in-effect`):

- `src/app/(dashboard)/finance/report/page.tsx:54`
- `src/app/(dashboard)/residents/[id]/page.tsx:92`
- `src/app/(dashboard)/security/incidents/page.tsx:77`
- `src/app/(dashboard)/voting/[id]/page.tsx:87`
- `src/presentation/features/securityCenter/hooks/useSecurityWebSocket.ts:151`

Build SWC warnings ("Application Control policy has blocked … `@next/swc-win32-x64-msvc`") are
the known Windows environment issue handled by WASM bindings; the build completes successfully.

### 14.1 Addendum — regression re-confirmed after validator fixes (pre-Attempt #3)

Between Attempt #2 and #3, the only repository changes were to `scripts/validate-m1-clone.mjs`
(validator), `.gitignore`, and this report — **no `src/` file, no M1 SQL, no `schema.prisma`**.
Regression was re-run to confirm no drift:

| check                    | result                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `prisma validate`        | **PASS**                                                               |
| `tsc --noEmit`           | **PASS** (exit 0)                                                       |
| `vitest run`             | **70 passed (70)**, 8 files                                            |
| `next build --webpack`   | **PASS** (exit 0); in-build TS check 4.5s; 122/122 static pages        |
| `eslint`                 | **5 errors = D1–D5 identity** (unchanged); warnings back to baseline 11 after removing one unused-var warning introduced in the validator script |

No new lint error identity outside D1–D5. The validator's temporary artifacts
(`_m1_clone_out*.json`, `_*.txt`) are gitignored and never committed.

---

## 15. Rollback

M1 has **not** been applied to the primary dev DB. It **was** applied (run #1) to the disposable
Neon **clone/branch** (`ep-winter-river-aol4em67-pooler...`); the simplest rollback there is to
discard the branch (no cleanup was performed). For any future controlled apply, rollback is
straightforward because M1 is purely additive:

```sql
-- Rollback M1 (only safe while these tables hold no data you need):
DROP TABLE IF EXISTS "memberships";
DROP TABLE IF EXISTS "org_units";
DROP TYPE  IF EXISTS "MembershipStatus";
DROP TYPE  IF EXISTS "MembershipRole";
DROP TYPE  IF EXISTS "OrgUnitType";
```

Dropping the two tables removes their FKs, checks, and indexes automatically. Because M1 adds
nothing to existing tables and writes no data, the rollback restores the pre-M1 state exactly.
On a clone, the simplest rollback is to discard the branch.

---

## 16. Residual Risks

- **BLOCKING: migration not idempotent (Section 8a).** Re-running M1 aborts on the
  `org_units_id_tenant_id_key` UNIQUE constraint (`42P07`). This must be fixed and re-validated on
  a fresh clone before the phase can pass. Until then, the DB-level invariants (I1–I10),
  same-tenant composite FKs, GIN index, and partial uniques are **not empirically confirmed** —
  run #1 created them but the verification step never read them back (Section 12).
- **Deferred hierarchy invariants.** `path`/`depth` correctness, cycle prevention, and subtree
  moves are not enforced by M1. Until the hierarchy service exists, application code must
  maintain `path`/`depth` carefully, and a malformed write could create an inconsistent (but not
  same-tenant-violating) tree.
- **`org_unit_id` nullability.** M1 keeps `org_unit_id` nullable to allow tenant-level
  memberships and to enable a gradual M3 backfill. Tightening to NOT NULL (if ever desired) is a
  later, separate decision.
- **Schema drift (B4).** `gates`/`cctv_cameras`/`homes` drift remains. `prisma migrate diff`
  will continue to report it; this is unrelated to M1 and intentionally untouched.
- **Neon `MATCH SIMPLE` semantics.** Same-tenant composite FKs are not checked when the
  referencing column set contains a NULL (root org units; tenant-level memberships). This is the
  intended behavior for I5/I8 and is exactly what NT7 confirms should PASS.
- **No authorization change.** Per B1, no "PLATFORM_ADMIN bypasses tenant isolation" rule is
  introduced. Any assumption that memberships already gate access is premature until the auth
  cutover phase.

---

## 17. Proposed M2 Plan (for review — not executed)

M2 = **backfill** the additive structures created by M1, still without cutover. Proposed steps:

1. **Create one root `OrgUnit` per existing tenant** (idempotent, keyed on tenant), typed to
   match the tenant's real level (default `RT` for current single-RT tenants), `parent_id` NULL,
   `depth = 0`, `path = '{}'`.
2. **Backfill `memberships` from `users`** using the locked role mapping:
   - `Super_Admin`   → `PLATFORM_ADMIN`, `org_unit_id = NULL`, on the **platform tenant**
     (`00000000-0000-0000-0000-000000000010`) — per B1 (no fake RT org unit for platform admins).
   - `Ketua_RT`      → `RT_ADMIN`, scoped to the tenant's root org unit.
   - `Pengurus`      → `ORG_ADMIN`, scoped to the tenant's root org unit (keeps it distinct from
     `Ketua_RT`).
   - `Security_Guard`→ `SECURITY`, scoped to the tenant's root org unit.
   - `Warga`         → `RESIDENT`, scoped to the tenant's root org unit.
   - `status = ACTIVE`; skip soft-deleted users (`deleted_at IS NOT NULL`).
3. **Idempotent + safe:** use `INSERT … ON CONFLICT DO NOTHING` against the two partial unique
   indexes so re-runs don't duplicate. No `UPDATE`/`DELETE` of legacy rows; `users.role` and
   `User.tenantId` remain the source of truth during M2 (no cutover).
4. **Validate on a fresh clone first** (same B5 discipline): pre/post counts, mapping-correctness
   assertions (every non-deleted user gets exactly one expected membership, platform admins land
   tenant-level on the platform tenant), re-run idempotency, legacy unchanged.
5. **Deliverable:** `PHASE_1_2C_M2_BACKFILL_VALIDATION_REPORT.md`. **STOP** for approval before
   any cutover (M-cutover) or drop (M-last).

Open questions to confirm before M2 authoring:
- Root org-unit `type` per tenant: is default `RT` correct for all three current tenants, or
  should the platform tenant get a different type (or **no** org unit at all, since its admins
  are tenant-level)?
- Should M2 also create memberships for `residents` (people) or strictly for `users` (accounts)?
  Current proposal: **users only** (Resident ≠ User; residents have no login).

---

## Appendix — Files in this phase

- `prisma/migration-add-orgunit-membership.sql` — M1 DDL (authoritative, additive; **idempotency
  defect present**, see Section 8a — not yet fixed).
- `prisma/schema.prisma` — additive M1 models/enums + back-relations (mirrors the SQL).
- `scripts/validate-m1-clone.mjs` — clone validator (requires `CLONE_DATABASE_URL`).
- `scripts/run-migration.mjs` — existing runner (used for the controlled apply once approved).
- `_m1_clone_out.json` — raw output of the clone validation run (run #1 OK, run #2 error `42P07`).

---

## Verification Gate — Attempt #1 (historical; superseded by Attempt #3)

> This gate reflects **Attempt #1 only**. The `42P07` idempotency defect was fixed (Option A).
> The authoritative final gate is Section 28–29 (Attempt #3), pending the fresh-clone run.

| gate item                                                    | result                       |
| ------------------------------------------------------------ | ---------------------------- |
| M1 run #1 succeeds                                           | ✅ PASS                       |
| M1 run #2 idempotent                                        | ❌ **FAIL** (`42P07`)         |
| enums / tables / indexes / FKs / CHECK created & verified   | ⚠️ NOT VERIFIED (step skipped)|
| same-tenant composite FK active                             | ⚠️ NOT VERIFIED               |
| GIN index `path` created                                    | ⚠️ NOT VERIFIED               |
| partial unique org-scoped active                            | ⚠️ NOT VERIFIED               |
| partial unique tenant-level active                          | ⚠️ NOT VERIFIED               |
| NT1–NT6 rejected by expected constraint (not setup error)   | ⚠️ NOT EXECUTED               |
| NT7 succeeds                                                | ⚠️ NOT EXECUTED               |
| negative-test transaction rolled back                       | n/a (never opened)            |
| pre/post legacy counts unchanged                            | ⚠️ post NOT CAPTURED          |
| no legacy table/data modified                               | ⚠️ NOT ASSERTED from evidence |
| no unexpected object/schema change                          | ⚠️ NOT VERIFIED               |

### VERDICT (Attempt #1)

**FASE 1.2b M1 CLONE VALIDATION (Attempt #1): FAIL**

Reason: the M1 migration was not idempotent (run #2 aborted on the UNIQUE candidate-key
constraint, SQLSTATE `42P07`). This was a genuine `MIGRATION IDEMPOTENCY DEFECT`, not a false
alarm and not an unrelated SQL/setup error. Because the validator exits on that error, the
constraint/negative tests and post-verification did not run in Attempt #1, so those checks are
`NOT VERIFIED` for #1. **This defect was subsequently fixed (Option A); see Attempts #2 and #3.**

Per phase instructions, the defect was **not** fixed on the database, **no** re-run was attempted,
and the primary dev DB was **not** touched. A minimal, additive-preserving fix is proposed in
Section 8a (Option A: `CREATE UNIQUE INDEX IF NOT EXISTS "org_units_id_tenant_id_key"`).

### Next step (awaiting your approval)

1. Apply the Section 8a fix to `prisma/migration-add-orgunit-membership.sql` (and, if you want the
   Prisma layer to mirror it exactly, keep `@@unique([id, tenantId])` — a unique index is a valid
   composite-FK target, so no schema.prisma change is required).
2. Re-run `scripts/validate-m1-clone.mjs` against a **fresh** clone (a clone that has *not* already
   had run #1 applied, so run #1/#2 both start from a clean state).
3. Fill in Sections 9–13 and this gate with the fresh results.

**STOP** — no fix applied, no dev-DB apply, no M2/M3, no reconciliation, no drift fix.

> **Update:** the "Next step" above was **approved** and Option A was applied to the migration
> file. This closes Validation Attempt #1. Revalidation is tracked below under Validation
> Attempt #2.

# ══════════════════════════════════════════════════════════════════════════
# END OF VALIDATION ATTEMPT #1 HISTORY
# ══════════════════════════════════════════════════════════════════════════

---

# ══════════════════════════════════════════════════════════════════════════
# VALIDATION ATTEMPT #2 — FRESH CLONE (corrective fix applied)
# ══════════════════════════════════════════════════════════════════════════

## 18. Corrective Action Applied (migration file only)

The approved **Option A** fix has been applied to
`prisma/migration-add-orgunit-membership.sql`. The candidate key is no longer an
`ALTER TABLE ... ADD CONSTRAINT ... UNIQUE`; it is now a natively-idempotent unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "org_units_id_tenant_id_key"
  ON "org_units" ("id", "tenant_id");
```

- The index **name is unchanged** (`org_units_id_tenant_id_key`), so the composite FKs
  `org_units_parent_same_tenant_fkey` and `memberships_org_unit_same_tenant_fkey` still reference
  the same `(id, tenant_id)` key.
- **No `schema.prisma` change** — `@@unique([id, tenantId])` maps to a physical unique index, so
  the Prisma model already matches. `prisma validate` re-run: **PASS**.
- Option B (broadening the exception handler to swallow `duplicate_table`) was **rejected** in
  favour of a statement that is idempotent by construction.

**Important:** the preservation invariant (that PostgreSQL accepts this unique *index* as a valid
composite-FK referenced key, and that the same-tenant FKs actually work) is **not assumed from
theory** — the fresh-clone validator proves it in Section 21 (composite-FK proof) and Section 22
(NT1/NT2).

## 19. Fresh Clone Requirement

Attempt #1's clone is already at state `M1 run #1 applied`, so it can no longer prove a clean
`PRE-M1 → run #1 → run #2` sequence. Attempt #2 **must** use a brand-new branch/clone from the
same source, e.g. `phase-1-m1-validation-v2`.

The validator now enforces this with a **PREFLIGHT** stage that STOPs (exit code 3) unless:

- `org_units` **absent** and `memberships` **absent**, and
- legacy counts are exactly **tenants=3, users=21, residents=54, households=19**.

If the initial state differs, the run aborts before applying anything.

## 20. Revalidation Sequence (no stage skipped)

`Preflight → M1 Run #1 → M1 Run #2 → Object Inspection → Composite-FK Proof →
Constraint Tests (NT1–NT8) → Post-Verification (residue) → Legacy Preservation`

The hardened validator (`scripts/validate-m1-clone.mjs`) runs all stages; it does not skip later
stages just because run #1/#2 succeed.

## 21. Attempt #2 Results — clone `ep-red-dawn-aorpo22p` (v2)

Attempt #2 **ran** on a fresh clone (`_m1_clone_out_v2.json`). Every DB-level gate passed, but
`overall_pass = false` because a **validator assertion defect** (not an M1 defect) scored the
enum check as false.

| stage                                                              | result (v2)              |
| ------------------------------------------------------------------ | ------------------------ |
| Preflight (targets absent + legacy 3/21/54/19)                     | **PASS** (`passed: true`)|
| M1 run #1 (creates expected objects)                               | **PASS**                 |
| M1 run #2 (no error **and** schema snapshot identical to run #1)   | **PASS** (`idempotent: true`) |
| Object inspection — every check EXCEPT enums                       | **PASS** (all true)      |
| Object inspection — `enums_present`                                | **FALSE** (validator bug — see below) |
| Composite-FK proof (both FKs reference `org_units(id, tenant_id)`) | **PASS** (`proven: true`)|
| Constraint tests NT1–NT8                                           | **PASS** (`negative_tests_all_ok: true`) |
| Post-rollback residue (`org_units=0`, `memberships=0`)             | **PASS** (`residue_clean: true`) |
| Legacy preservation (pre == post counts)                           | **PASS**                 |
| **`overall_pass`**                                                 | **false** (blocked solely by `enums_present`) |

### 21.1 Attempt #2 root cause — VALIDATOR DEFECT (not M1)

The migration is correct. The failure came from the validator's enum assertion:

- The enum query used `array_agg(...) AS labels`, and the `pg` driver returned that `text[]` as
  the **array-literal string** `"{PLATFORM_ADMIN,...}"`, not a JS array. Confirmed in
  `_m1_clone_out_v2.json` → `inspection.enums[*].labels` are strings.
- The old assertion `snap2.enums.every(e => Array.isArray(e.labels) && ...)` therefore evaluated
  `Array.isArray("{...}") === false` → `enums_present = false` → `inspection_all_ok = false` →
  `overall_pass = false`.
- The enum DDL itself was correct in the raw output: `OrgUnitType {ORGANIZATION,CLUSTER,RW,RT}`,
  `MembershipRole {PLATFORM_ADMIN,TENANT_OWNER,ORG_ADMIN,RT_ADMIN,SECURITY,RESIDENT}`,
  `MembershipStatus {INVITED,ACTIVE,SUSPENDED,REVOKED}`.

**Corrective action (validator only):** added `normalizeEnumLabels()` (accepts a JS array or the
`{A,B,C}` literal), `EXPECTED_ENUMS` with exact ordered labels, `arraysEqualOrdered()`, and
per-enum checks `org_unit_type_enum_exact` / `membership_role_enum_exact` /
`membership_status_enum_exact` plus aggregate `enums_exact` (which now feeds `enums_present`). The
fix was proven against the exact `{...}` strings (all three → true; a wrong-order input → false).
M1 SQL was **NOT** changed for the enum issue — only the validator.

### 21.2 Attempt #2 composite-FK proof (from `_m1_clone_out_v2.json`)

- `org_units_parent_same_tenant_fkey` → `FOREIGN KEY (parent_id, tenant_id) REFERENCES org_units(id, tenant_id)` — **PROVEN**
- `memberships_org_unit_same_tenant_fkey` → `FOREIGN KEY (org_unit_id, tenant_id) REFERENCES org_units(id, tenant_id)` — **PROVEN**

This already answers the key question from the Option A fix: PostgreSQL **accepts the unique
index `org_units_id_tenant_id_key` as a valid composite-FK referenced key**, and both same-tenant
FKs exist and were exercised by NT1/NT2.

### 21.3 Attempt #2 constraint tests (from `_m1_clone_out_v2.json`)

All eight passed with the correct SQLSTATE/constraint identity:

| Test | Expected                          | Actual                  | SQLSTATE | Constraint Name                             | PASS/FAIL |
| ---- | --------------------------------- | ----------------------- | -------- | ------------------------------------------- | --------- |
| NT1 cross-tenant parent            | CONSTRAINT REJECTION (I3) | REJECTED BY CONSTRAINT | `23503` | `org_units_parent_same_tenant_fkey`         | **PASS** |
| NT2 cross-tenant org-unit membership | CONSTRAINT REJECTION (I8)| REJECTED BY CONSTRAINT | `23503` | `memberships_org_unit_same_tenant_fkey`     | **PASS** |
| NT3 duplicate org-scoped membership | CONSTRAINT REJECTION (I9) | REJECTED BY CONSTRAINT | `23505` | `memberships_user_tenant_orgunit_uq`        | **PASS** |
| NT4 duplicate tenant-level membership | CONSTRAINT REJECTION (I10)| REJECTED BY CONSTRAINT | `23505` | `memberships_user_tenant_null_orgunit_uq`   | **PASS** |
| NT5 invalid User FK                | CONSTRAINT REJECTION (I6) | REJECTED BY CONSTRAINT | `23503` | `memberships_user_id_fkey`                  | **PASS** |
| NT6 invalid Tenant FK              | CONSTRAINT REJECTION (I7) | REJECTED BY CONSTRAINT | `23503` | `memberships_tenant_id_fkey`                | **PASS** |
| NT7 valid tenant-level membership (orgUnitId NULL) | SUCCESS (I10 boundary) | SUCCEEDED | — | — | **PASS** |
| NT8 second org-scoped membership, distinct org unit | SUCCESS (I9 boundary) | SUCCEEDED | — | — | **PASS** |

### 21.4 Attempt #2 verdict

`FASE 1.2b M1 CLONE VALIDATION (Attempt #2): FAIL` — `overall_pass = false`, blocked solely by
the validator's `enums_present` assertion bug (root cause above). No manual override was applied.
The migration evidence was otherwise entirely green, including idempotency, composite-FK proof,
NT1–NT8, residue, and legacy preservation.

---

# ══════════════════════════════════════════════════════════════════════════
# VALIDATION ATTEMPT #3 — FRESH CLONE (corrected validator)
# ══════════════════════════════════════════════════════════════════════════

## 25. Why Attempt #3 (and what changed since #2)

Attempt #2's clone is already at `M1 run #1/#2 applied`, so it cannot re-prove a clean
`PRE-M1 → run #1 → run #2` sequence. Per the decision, we do **not** add an inspection-only mode;
we run one authoritative end-to-end validation on a brand-new clone with the corrected validator.

Changed since Attempt #2 (validator only — **no** M1 SQL / schema.prisma change):

- Fixed enum assertion (Section 21.1): normalize labels + exact ordered per-enum checks
  (`org_unit_type_enum_exact`, `membership_role_enum_exact`, `membership_status_enum_exact`,
  aggregate `enums_exact`) with a wrong-order negative self-test.
- Removed an unused variable (`ntTxCommittedResidue`) flagged as a lint warning in the validator.

`prisma validate` re-confirmed **PASS**; app regression re-confirmed (Section 14 addendum below).

## 26. Fresh Clone Requirement (Attempt #3)

Use a brand-new Neon branch from the same source, e.g. `phase-1-m1-validation-v3`, in PRE-M1
state. The validator PREFLIGHT STOPs (exit 3) unless:

- `org_units` **absent** and `memberships` **absent**, and
- legacy counts exactly **tenants=3, users=21, residents=54, households=19**.

## 27. Revalidation Sequence (Attempt #3, no stage skipped)

`Preflight → M1 Run #1 → schema snapshot #1 → M1 Run #2 → schema snapshot #2 →
idempotency comparison → Object Inspection → Exact Enum Validation → Composite-FK Proof →
NT1–NT8 → rollback → residue verification → legacy preservation → overall verdict`

## 28. Attempt #3 Results — clone `ep-morning-boat-aophuh8j` — PASS

Source: authoritative artifact (validated_at `2026-09-23T07:40:04Z`, PostgreSQL 17.11, user
`neondb_owner`). Note: the artifact's cosmetic `meta.attempt` field is hardcoded to `2` in the
validator; this run is the **final Attempt #3** on a distinct fresh clone
(`ep-morning-boat-aophuh8j`, different from #1 `ep-winter-river` and #2 `ep-red-dawn`). The
verdict is driven by `result.overall_pass`, not by the label.

| gate                                          | required | actual (final)      |
| --------------------------------------------- | -------- | ------------------- |
| `preflight_pass` (targets absent + legacy 3/21/54/19) | true | **true — PASS** |
| `run1_ok`                                     | true     | **true — PASS**     |
| `run2_idempotent` (+ `schema_identical_to_run1`) | true  | **true — PASS**     |
| `inspection_all_ok` (incl. corrected `enums_present`) | true | **true — PASS** |
| `enums_exact` (+ 3 per-enum exact checks)     | true     | **true — PASS**     |
| `composite_fk_proven`                         | true     | **true — PASS**     |
| `negative_tests_all_ok` (NT1–NT8)             | true     | **true — PASS**     |
| `residue_clean` (`org_units=0`, `memberships=0`) | true  | **true — PASS**     |
| `legacy_unchanged` (3/21/54/19)               | true     | **true — PASS**     |
| **`overall_pass`**                            | **true** | **true — PASS**     |

### 28.1 Object inspection (from the artifact — all `inspection_checks` true)

OrgUnit: table ✓ • columns/types/nullability ✓ • `path` = `ARRAY` / `udt_name=_text` ✓ • `depth`
`integer` default `0` ✓ • CHECK `((depth >= 0))` (`org_units_depth_nonneg_check`) ✓ • FK → tenants
(`org_units_tenant_id_fkey`) ✓ • self parent relation ✓ • same-tenant parent composite FK
(`org_units_parent_same_tenant_fkey`) ✓ • indexes `org_units_tenant_id_idx`,
`org_units_parent_id_idx` ✓ • GIN index `org_units_path_gin_idx` (`USING gin (path)`) ✓ •
candidate unique index `org_units_id_tenant_id_key` (`UNIQUE ... (id, tenant_id)`) ✓.

Membership: table ✓ • columns/types/nullability (`org_unit_id`, `revoked_at` nullable; others NOT
NULL; `status` default `ACTIVE`) ✓ • FK → users (`memberships_user_id_fkey`) ✓ • FK → tenants
(`memberships_tenant_id_fkey`) ✓ • OrgUnit relation ✓ • same-tenant OrgUnit composite FK
(`memberships_org_unit_same_tenant_fkey`) ✓ • org-scoped partial unique
(`memberships_user_tenant_orgunit_uq` … `WHERE (org_unit_id IS NOT NULL)`) ✓ • tenant-level partial
unique (`memberships_user_tenant_null_orgunit_uq` … `WHERE (org_unit_id IS NULL)`) ✓.

Enums (exact ordered — `enums_exact = true`, all three per-enum checks true):
`OrgUnitType` = ORGANIZATION, CLUSTER, RW, RT; `MembershipRole` = PLATFORM_ADMIN, TENANT_OWNER,
ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT; `MembershipStatus` = INVITED, ACTIVE, SUSPENDED, REVOKED.

Composite-FK proof (`composite_fk_proof.proven = true`):
`org_units_parent_same_tenant_fkey` → `FOREIGN KEY (parent_id, tenant_id) REFERENCES org_units(id, tenant_id)`;
`memberships_org_unit_same_tenant_fkey` → `FOREIGN KEY (org_unit_id, tenant_id) REFERENCES org_units(id, tenant_id)`.

### 28.2 Attempt #3 constraint tests (from the artifact — all PASS)

| Test | Expected                          | Actual                  | SQLSTATE | Constraint Name                             | PASS/FAIL |
| ---- | --------------------------------- | ----------------------- | -------- | ------------------------------------------- | --------- |
| NT1 cross-tenant parent            | CONSTRAINT REJECTION (I3) | REJECTED BY CONSTRAINT | `23503` | `org_units_parent_same_tenant_fkey`         | **PASS** |
| NT2 cross-tenant org-unit membership | CONSTRAINT REJECTION (I8)| REJECTED BY CONSTRAINT | `23503` | `memberships_org_unit_same_tenant_fkey`     | **PASS** |
| NT3 duplicate org-scoped membership | CONSTRAINT REJECTION (I9) | REJECTED BY CONSTRAINT | `23505` | `memberships_user_tenant_orgunit_uq`        | **PASS** |
| NT4 duplicate tenant-level membership | CONSTRAINT REJECTION (I10)| REJECTED BY CONSTRAINT | `23505` | `memberships_user_tenant_null_orgunit_uq`   | **PASS** |
| NT5 invalid User FK                | CONSTRAINT REJECTION (I6) | REJECTED BY CONSTRAINT | `23503` | `memberships_user_id_fkey`                  | **PASS** |
| NT6 invalid Tenant FK              | CONSTRAINT REJECTION (I7) | REJECTED BY CONSTRAINT | `23503` | `memberships_tenant_id_fkey`                | **PASS** |
| NT7 valid tenant-level membership (orgUnitId NULL) | SUCCESS (I10 boundary) | SUCCEEDED | — | — | **PASS** |
| NT8 second org-scoped membership, distinct org unit | SUCCESS (I9 boundary) | SUCCEEDED | — | — | **PASS** |

Post-rollback residue: `org_units = 0`, `memberships = 0` (`residue_clean = true`) — the
negative-test transaction rolled back cleanly, nothing persisted. Legacy preservation: pre == post
= tenants 3 / users 21 / residents 54 / households 19 (`legacy_unchanged = true`).

## 29. Attempt #3 Verdict — PASS

`FASE 1.2b M1 CLONE VALIDATION (Attempt #3): PASS.` The authoritative artifact reports
`result.overall_pass = true` with every gate true. No manual override was applied — the verdict
comes directly from the validator's own aggregate result.

## 30. How Attempt #3 was run

```powershell
# Fresh Neon branch (PRE-M1: no org_units / memberships), then:
$env:CLONE_DATABASE_URL = "postgresql://<fresh-branch-connection-string>"
node scripts/validate-m1-clone.mjs > <artifact>.json
```

The artifact (`_m1_clone_FINAL_PASS.json`) is **gitignored** and was not committed. It contains DB
inspection output but no credentials beyond a pooler hostname in `meta.host_hint`.
