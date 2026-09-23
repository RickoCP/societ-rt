# FASE 1.2c — M1 Promotion to Primary Development DB (RUNBOOK)

Status: **DESIGN / RUNBOOK ONLY — NOT EXECUTED.** No DDL has been run against the primary
development database. This document is a reviewable procedure; execution requires separate,
explicit approval.

Scope: promote the **already-validated M1** additive schema (OrgUnit + Membership) to the primary
development database. **Additive schema foundation only** — no data creation, no backfill, no
cutover.

Frozen source of truth:
- Commit `3c01e1f41175383359531cf48c004ab6454dc1b0` on branch `feature`.
- Annotated tag **`phase-1-m1-validated`** (points exactly at that commit).
- Migration artifact: `prisma/migration-add-orgunit-membership.sql` **as frozen by that tag** —
  do **not** edit it during promotion.
- Validation evidence: `PHASE_1_2B_M1_VALIDATION_REPORT.md` (final verdict **PASS**,
  `overall_pass = true` on fresh clone `ep-morning-boat-aophuh8j`).

> **What M1 creates (recap):** enums `OrgUnitType`, `MembershipRole`, `MembershipStatus`; tables
> `org_units`, `memberships`; candidate unique index `org_units_id_tenant_id_key (id, tenant_id)`;
> same-tenant composite FKs; two partial unique indexes; GIN index on `org_units.path`; CHECK
> `depth >= 0`; supporting btree indexes. It writes **zero** rows.

---

## ⚠️ PREREQUISITE 0 — Rotate the compromised Neon credential (do FIRST)

The Neon database credential was exposed in terminal/chat output earlier in this project. It must
be treated as **compromised**.

- **Before any primary-dev-DB operation**, rotate the Neon password / reset the role credential in
  the Neon Console, and update the local `.env` `DATABASE_URL` with the new secret.
- Do **not** paste the old or new credential into any file, report, commit message, or command
  output that is stored in the repository.
- Confirm the rotated credential is only in `.env` (which is gitignored via `.env*`) and never in
  tracked content.

This runbook assumes a rotated, valid `DATABASE_URL` is in place before Section A runs.

---

## A. Preflight (READ-ONLY — must all pass before any DDL)

All checks are SELECT-only and run under `SET default_transaction_read_only = on`.

**A1. Identify the primary dev DB explicitly.**
- Confirm `current_database()`, `current_user`, and the host implied by `DATABASE_URL`.
- Record the dev pooler host for the audit trail: expected `ep-dry-cake-aoi3l143-pooler…`
  (the primary dev DB identified in Phase 1.2a/1.2b). Host is not a secret; the credential is.

**A2. Prove the target is NOT a validation clone.**
- The connection MUST be the primary dev DB, not any Neon validation branch used in 1.2b
  (`ep-winter-river-…`, `ep-red-dawn-…`, `ep-morning-boat-…`, or any `phase-1-m1-validation-*`).
- Assert `DATABASE_URL` host ∉ {known clone hosts}. If the host matches a clone or is unrecognized
  → **STOP**.

**A3. Confirm expected dev legacy counts.**
- `tenants = 3`, `users = 21`, `residents = 54`, `households = 19`.
- Any deviation → **STOP** (the dev DB is not in the expected baseline state).

**A4. Confirm `org_units` absent.** `to_regclass('public.org_units') IS NULL` → true, else **STOP**.

**A5. Confirm `memberships` absent.** `to_regclass('public.memberships') IS NULL` → true, else **STOP**.

**A6. Confirm expected schema baseline.**
- The core legacy tables exist (`tenants`, `users`, `residents`, `households`, …).
- Known drift (`gates`, `cctv_cameras`, `homes` present in `schema.prisma` but absent in dev — B4)
  is **acknowledged and out of scope**; the runbook does **not** reconcile it. Its presence/absence
  must not block M1 (M1 does not touch those tables).

**A7. Confirm M1 has not partially executed.**
- None of these exist yet: types `OrgUnitType` / `MembershipRole` / `MembershipStatus`; tables
  `org_units` / `memberships`; index `org_units_id_tenant_id_key`.
- If any M1 object already exists → **STOP** and investigate (do not assume idempotency will paper
  over a partial prior run).

**Preflight tooling (proposed, read-only):** a small script analogous to `scripts/audit-phase1.mjs`
that emits a JSON preflight report (counts + `to_regclass` checks + enum/type existence). It must
enforce `default_transaction_read_only = on` and print no credentials. This script would be added
under a separate, reviewable change — not part of this runbook's frozen migration.

---

## B. Recovery point (establish BEFORE any DDL)

Additive DDL is low-risk but **not** zero-risk; do not skip a recovery point.

**B1. Establish a restore point appropriate for Neon dev:**
- Preferred: create a **Neon branch** of the dev database immediately before promotion (a cheap,
  instant copy-on-write snapshot), e.g. `pre-m1-dev-restore-YYYYMMDD`. This is the fastest rollback
  path (repoint / restore from branch).
- Alternatively / additionally: rely on Neon's point-in-time restore (PITR) and **record the exact
  UTC timestamp** just before DDL so PITR can target it.

**B2. Record non-secret recovery metadata** (store in the promotion log, never the credential):
- recovery Neon branch name (if used),
- pre-DDL UTC timestamp (for PITR),
- dev pooler host identifier,
- pre-DDL legacy counts (3/21/54/19) and target-absent confirmation,
- the migration artifact commit/tag (`phase-1-m1-validated` / `3c01e1f`).

**B3. Rollback / recovery procedure:**
- **Preferred (clean):** since M1 is additive and writes no data, drop the M1 objects:
  ```sql
  DROP TABLE IF EXISTS "memberships";
  DROP TABLE IF EXISTS "org_units";
  DROP TYPE  IF EXISTS "MembershipStatus";
  DROP TYPE  IF EXISTS "MembershipRole";
  DROP TYPE  IF EXISTS "OrgUnitType";
  ```
  (Dropping the two tables removes their FKs, checks, and indexes automatically.) This is only
  appropriate while the tables hold no data you need — which is the case immediately post-M1.
- **Fallback (heavier):** restore the dev DB from the B1 Neon branch, or PITR to the B2 timestamp.
- Decide the trigger for rollback: any failed post-M1 verification (Section D) or any unexpected
  change to legacy tables.

---

## C. Migration (M1 only)

**C0. Preconditions:** Section A all-pass **and** Section B recovery point established. Otherwise
STOP.

**C1. Apply exactly M1, from the frozen artifact:**
- File: `prisma/migration-add-orgunit-membership.sql` at tag `phase-1-m1-validated`.
- Runner: `scripts/run-migration.mjs` (the same idempotent runner used elsewhere), against the
  rotated `DATABASE_URL`.
- Do **not** run `prisma migrate dev` or `prisma db push` (they would attempt to reconcile the
  known B4 drift). Do **not** edit the migration during promotion.

**C2. No M2 / M3.** No root OrgUnit creation, no membership backfill, no `users.role` mapping — those
are later phases and are explicitly **out of scope**.

**C3. Idempotency note:** the migration is idempotent (proven on clone: run #1 = run #2, identical
schema snapshot). A single application is expected; a re-run must be a no-op if ever needed.

---

## D. Post-M1 verification (READ-ONLY)

Verify structure only. This mirrors the clone's object-inspection stage (which already passed) —
we re-confirm the objects materialized correctly on dev.

Verify present and correct:
- **Tables:** `org_units`, `memberships` exist.
- **Columns/types/nullability:** match the frozen schema (e.g. `org_units.path` = `ARRAY` /
  `udt_name=_text`; `org_units.depth` `integer` default `0`; `memberships.org_unit_id`,
  `memberships.revoked_at` nullable; `memberships.status` default `ACTIVE`).
- **Enums + exact ordered labels:**
  - `OrgUnitType` = ORGANIZATION, CLUSTER, RW, RT
  - `MembershipRole` = PLATFORM_ADMIN, TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT
  - `MembershipStatus` = INVITED, ACTIVE, SUSPENDED, REVOKED
- **Candidate unique index:** `org_units_id_tenant_id_key` UNIQUE `(id, tenant_id)`.
- **GIN path index:** `org_units_path_gin_idx` `USING gin (path)`.
- **Partial uniques:** `memberships_user_tenant_orgunit_uq` (`WHERE org_unit_id IS NOT NULL`) and
  `memberships_user_tenant_null_orgunit_uq` (`WHERE org_unit_id IS NULL`).
- **Same-tenant composite FKs:** `org_units_parent_same_tenant_fkey` and
  `memberships_org_unit_same_tenant_fkey` both `REFERENCES org_units(id, tenant_id)`; plus tenant/
  user FKs.
- **CHECK:** `org_units_depth_nonneg_check` = `((depth >= 0))`.
- **Target row counts = 0:** `org_units = 0`, `memberships = 0` (M1 is DDL-only).
- **Legacy counts unchanged:** `tenants=3, users=21, residents=54, households=19`.

**D1. Do NOT re-run destructive constraint tests (NT1–NT8) on the primary dev DB** merely to repeat
the clone proof. The clone already provided the authoritative destructive constraint proof
(SQLSTATE `23503`/`23505`, all PASS). If — and only if — a targeted re-check is deemed necessary,
it must run inside a single transaction that is **rolled back** (never committed), and there must
be a compelling reason recorded. Default: **skip on dev**, cite the clone artifact.

**Verification tooling (proposed, read-only):** a script emitting a dev post-M1 inspection JSON
(reusing the same `pg_constraint` / `pg_indexes` / `information_schema.columns` / enum queries as
`scripts/validate-m1-clone.mjs`, minus the run/NT stages). Added under a separate reviewable change.

---

## E. Application regression (after dev apply)

Run the standard gates against the working tree (schema.prisma already contains M1; the dev DB now
matches it):
- `prisma validate` → PASS
- `tsc --noEmit` → PASS (exit 0)
- `vitest run` → 70/70 PASS
- `next build --webpack` → PASS (122/122 static pages; in-build TS check passes)
- `eslint` → error identity ceiling = D1–D5 only (5 errors), warnings at baseline (11); no new
  error identity.

Any regression beyond the accepted D1–D5 ceiling → **STOP** (investigate before proceeding).

---

## F. Promotion gate — `M1_DEV_PROMOTION_PASS`

Declare `M1_DEV_PROMOTION_PASS` **only if ALL** of the following are true:
1. **Preflight correct** — A1–A7 all pass (correct dev target, not a clone, legacy 3/21/54/19,
   `org_units`/`memberships` absent, schema baseline OK, M1 not partially executed).
2. **Recovery point established** — B1 done, B2 metadata recorded, B3 rollback procedure ready.
3. **Migration successful** — C1 applied M1 from the frozen artifact with no error.
4. **Structural verification PASS** — Section D all objects present and correct.
5. **Legacy unchanged** — pre == post counts (3/21/54/19); no legacy table/data modified.
6. **Application regression PASS** — Section E all green, D1–D5 ceiling only.

If **any** condition fails → **STOP**, execute the Section B rollback if DDL had begun, and report
root cause. **No M2.**

Record the outcome (`M1_DEV_PROMOTION_PASS` = true/false) with the commit/tag reference and the
recovery metadata in a promotion log (e.g. append a results section to this runbook or a companion
report at execution time).

---

## Architecture boundary (unchanged — enforced during promotion)

M1 promotion is **additive schema foundation only**. Do **NOT** (these are later, separately
approved phases):
- create root OrgUnits;
- backfill Membership;
- change auth reads;
- dual-write;
- remove `User.tenantId`;
- change JWT;
- implement RLS;
- implement NIK encryption/migration;
- implement refresh tokens;
- reconcile unrelated schema drift (`gates`/`cctv_cameras`/`homes` — B4);
- redesign IoT ownership.

---

## Exact promotion command (FOR REVIEW ONLY — DO NOT RUN)

The single DDL-applying step of this runbook (Section C1) would be:

```powershell
# Prereqs: credential rotated (Prerequisite 0); Section A preflight PASS;
#          Section B recovery point established. DATABASE_URL points at the PRIMARY DEV DB.
node scripts/run-migration.mjs prisma/migration-add-orgunit-membership.sql
```

This command is shown for review and is **not executed**. It applies the frozen, idempotent M1 DDL
to whatever `DATABASE_URL` resolves to — hence the mandatory preflight (A2) proving the target is
the intended primary dev DB and not a clone.

Read-only preflight/verification commands (Sections A and D) would be separate SELECT-only scripts
(to be added under a separate reviewable change), e.g.:

```powershell
# Read-only — safe; emits JSON, no DDL, no writes, no credentials in output.
node scripts/preflight-m1-dev.mjs   > _m1_dev_preflight.json    # (proposed; not yet created)
node scripts/verify-m1-dev.mjs      > _m1_dev_postverify.json   # (proposed; not yet created)
```

(Artifact names prefixed `_` are already gitignored.)

---

## Execution status

**NOT EXECUTED.** Awaiting explicit approval to run FASE 1.2c. Until then, the primary dev DB is
untouched, and M1 lives only as: the frozen migration artifact (tag `phase-1-m1-validated`), the
additive `schema.prisma` models, and the clone-validated PASS evidence.
