# FASE 1.4 — M2 Clone Validation Report

**Status:** `M2_CLONE_VALIDATION_PASS = true`
**Scope:** Authored the M2 migration and validated it on a **verified clean isolated pre-M2 clone**
only. **Primary development database was NOT mutated.** No commit, no push, no primary-dev promotion.

> Validation target classification: **verified clean isolated pre-M2 clone** (`ep-winter-river-aol4em67`).
> This is **not** a newly-created branch — it is the existing isolated Neon branch (previously used for
> M1 clone validation), re-verified read-only to be in the exact expected pre-M2 baseline before any
> write, and approved for this purpose.

---

## 1. Target isolation (sanitized)

| property | clone (validation target) | primary dev (must not touch) |
| -------- | ------------------------- | ---------------------------- |
| host prefix | `ep-winter-river-aol4em67` | `ep-dry-cake-aoi3l143` |
| database | `neondb` | `neondb` |
| engine | PostgreSQL 17.11 | PostgreSQL 17.11 |
| env var | `CLONE_DATABASE_URL` | `DATABASE_URL` |

Isolation proofs (no URL/credentials printed):
- `CLONE_DATABASE_URL` present, `DATABASE_URL` present.
- `clone != primary` (string inequality) = true.
- clone host ≠ primary host = true.
- clone host prefix = `ep-winter-river-aol4em67` = true.
- primary host prefix = `ep-dry-cake-aoi3l143` = true.
- clone host does **not** start with the primary prefix = true.

Both the runner (`scripts/run-migration-clone.mjs`) and the validator (`scripts/validate-m2-clone.mjs`)
**refuse to run** if `CLONE_DATABASE_URL` is missing or equals `DATABASE_URL`.

---

## 2. PRE-M2 fingerprint (read-only preflight) — `M2_CLONE_PREFLIGHT_PASS = true`

| check | expected | actual |
| ----- | -------- | ------ |
| M1 installed (`org_units`,`memberships` exist) | true | true |
| `org_units` rows | 0 | 0 |
| `memberships` rows | 0 | 0 |
| tenants | 3 | 3 |
| users (active) | 21 | 21 |
| residents | 54 | 54 |
| households | 19 | 19 |
| legacy integrity (orphans / null-tenant) | 0 all | 0 all |
| platform tenant present | 1 | 1 |
| platform Super_Admin | 3 | 3 |
| platform anomalies (non-Super_Admin) | 5 | 5 |
| exclusion-manifest exact match (user_id+tenant+role) | 5 | 5 |
| platform non-admin OUTSIDE manifest | 0 | 0 |
| ordinary RT source users (rt01+rt02) | 13 | 13 |

---

## 3. M2 artifact

- File: `prisma/migration-m2-bootstrap-orgunits-memberships.sql`
- Properties: single atomic transaction (`BEGIN`/`COMMIT`); `LOCK` on both target tables; explicit
  preconditions, per-row conflict classification, whole-set postconditions; **no blind
  `ON CONFLICT DO NOTHING`**; no legacy row mutation; no schema/auth change.
- Conflict model per intended row: **ABSENT → INSERT**, **EXACT-MATCH → no-op**, **CONFLICT → RAISE
  (abort + full rollback)**.

---

## 4. UUIDv5 deterministic-ID specification (D2)

- **Namespace UUID (fixed, recorded once):** `f0e1d2c3-b4a5-5968-8776-655443322110`
- **Canonical name input:** `societ-rt:orgunit:legacy-tenant-root:<tenant_id>`
- **tenant_id canonicalization:** consumed exactly as canonical lowercase UUID text; the helper
  fails closed on surrounding whitespace or non-canonical form (no silent normalization).
- **Encoding:** UTF-8. **Output:** canonical lowercase UUID (version nibble = 5, RFC 4122 variant).
- **Algorithm:** RFC 4122 UUIDv5 (SHA-1 over namespace-bytes ‖ name-bytes), computed in tooling
  (`scripts/m2-orgunit-id.mjs`); **no PostgreSQL extension dependency**. The M2 SQL pins the
  resulting literals and the validator independently recomputes + binds them.
- **RFC 4122 test vector:** `uuidv5(DNS, "www.example.com") = 2ed6657d-e927-568b-95e1-2665a8aea6a2` →
  **PASS**.

**Derived deterministic bootstrap OrgUnit IDs:**

| tenant | tenant_id | canonical name | deterministic OrgUnit id |
| ------ | --------- | -------------- | ------------------------ |
| rt01 | `00000000-0000-0000-0000-000000000011` | `societ-rt:orgunit:legacy-tenant-root:00000000-0000-0000-0000-000000000011` | `2459b0bb-115e-52ce-88cd-c176a9aa1e39` |
| rt02 | `00000000-0000-0000-0000-000000000012` | `societ-rt:orgunit:legacy-tenant-root:00000000-0000-0000-0000-000000000012` | `50197f3e-5ebc-5547-91ba-e54b604e0edb` |

Helper output matches the literals pinned in the M2 SQL (independent reproduction confirmed).

---

## 5. Exclusion manifest (explicit five; no broad rule)

The five audited platform anomalies are excluded by an **explicit manifest** (not a
`role != Super_Admin` filter). Runtime guards assert exactly these five exist with expected tenant +
role, and that **no platform non-admin exists outside the manifest**. No PII.

| alias | user_id | expected tenant | expected legacy role | category |
| ----- | ------- | --------------- | -------------------- | -------- |
| PNA-01 | `00000000-0000-0000-0000-000000000021` | platform (`…010`) | Ketua_RT | mis-tenanted-rt-role:has-activity |
| PNA-02 | `00000000-0000-0000-0000-000000000022` | platform (`…010`) | Pengurus | mis-tenanted-rt-role:inactive |
| PNA-03 | `00000000-0000-0000-0000-000000000023` | platform (`…010`) | Warga | mis-tenanted-rt-role:has-activity |
| PNA-04 | `00000000-0000-0000-0000-000000000024` | platform (`…010`) | Security_Guard | mis-tenanted-rt-role:inactive |
| PNA-05 | `42cc1bea-9a68-44b1-aadf-1bb0bb609028` | platform (`…010`) | Warga | app-registration-style-id:inactive |

Manifest verification: matched 5/5, outside-manifest 0, total platform non-admin 5. **PASS.**

---

## 6. M2 run #1 — resulting cardinalities

| metric | expected | actual |
| ------ | -------- | ------ |
| org_units total | 2 | 2 |
| memberships total | 16 | 16 |
| platform tenant-level PLATFORM_ADMIN (org_unit NULL, ACTIVE) | 3 | 3 |
| RT org-scoped memberships | 13 | 13 |
| excluded manifest users with membership | 0 | 0 |

Both OrgUnits verified exactly (`type=RT`, `parent_id=NULL`, `depth=0`, `path=ARRAY[id]::text[]`), IDs
equal to the deterministic values. Membership breakdown (by tenant + role, no PII):

| tenant | role | scope | count |
| ------ | ---- | ----- | ----- |
| platform `…010` | PLATFORM_ADMIN | tenant-level (NULL) | 3 |
| rt01 `…011` | RT_ADMIN | org-scoped | 1 |
| rt01 `…011` | ORG_ADMIN | org-scoped | 2 |
| rt01 `…011` | RESIDENT | org-scoped | 2 |
| rt01 `…011` | SECURITY | org-scoped | 2 |
| rt02 `…012` | RT_ADMIN | org-scoped | 1 |
| rt02 `…012` | ORG_ADMIN | org-scoped | 2 |
| rt02 `…012` | RESIDENT | org-scoped | 2 |
| rt02 `…012` | SECURITY | org-scoped | 1 |

All 16 memberships have `status = ACTIVE`.

---

## 7. M2 run #2 — idempotency (state comparison, not "SQL succeeded")

- Full pre/post state snapshot compared (org_units + memberships).
- `state_identical_to_run1 = true`; `new_org_units = 0`; `new_memberships = 0`.
- **`M2_IDEMPOTENCY_PASS = true`.**

---

## 8. Negative tests (all inside transactions, always rolled back)

| # | test | mechanism | SQLSTATE | verdict |
| - | ---- | --------- | -------- | ------- |
| NT1 | deterministic OrgUnit id occupied by conflicting state (type mismatch) | M2 exact-match guard | P0001 | PASS |
| NT2 | conflicting second root RT for tenant (different id) | M2 conflict guard | P0001 | PASS |
| NT3 | expected membership wrong role | M2 exact-match guard | P0001 | PASS |
| NT4 | expected membership wrong org scope (cross-tenant) | composite same-tenant FK | 23503 | PASS |
| NT5 | exclusion-manifest user role changed | M2 precondition | P0001 | PASS |
| NT6 | extra platform non-admin outside manifest | M2 precondition | P0001 | PASS |
| NT7 | unknown legacy role | M2 precondition (role map) | P0001 | PASS |
| NT8 | cross-tenant inconsistency (membership org_unit of another tenant) | composite same-tenant FK | 23503 | PASS |

Each conflict aborts the migration/transaction. After rollback, state matches the post-M2 baseline
(**org_units = 2, memberships = 16**) — no partial state, no residue.

---

## 9. Rollback / residue

- Post-negative-test state equals post-run#2 state exactly.
- org_units = 2, memberships = 16; no negative-test fixtures left behind (residue = 0).

---

## 10. Legacy preservation

| table | pre | post |
| ----- | --- | ---- |
| tenants | 3 | 3 |
| users | 21 | 21 |
| residents | 54 | 54 |
| households | 19 | 19 |

Legacy counts unchanged; no orphan users; M2 performed **no** UPDATE/DELETE on legacy rows.

---

## 11. Final post-M2 clone-state fingerprint

```text
host                          = ep-winter-river-aol4em67 (clone)
org_units                     = 2
memberships                   = 16
  platform PLATFORM_ADMIN     = 3   (tenant-level, org_unit NULL, ACTIVE)
  RT org-scoped               = 13  (rt01 7 + rt02 6)
  excluded-with-membership    = 0
unexpected memberships        = 0
negative-test residue         = 0
deterministic OrgUnit ids     = rt01 2459b0bb-115e-52ce-88cd-c176a9aa1e39 (RT/NULL/0/path=[id])
                                rt02 50197f3e-5ebc-5547-91ba-e54b604e0edb (RT/NULL/0/path=[id])
legacy                        = 3 tenants / 21 users / 54 residents / 19 households
```

Clone is **retained** (not reset/dropped) as evidence/debugging state, per instruction.

---

## 12. Application regression (clone-compatible codebase)

| check | expected baseline | result |
| ----- | ----------------- | ------ |
| `prisma validate` | valid | PASS |
| TypeScript (`tsc --noEmit`) | 0 errors | 0 errors |
| Vitest | 70/70 | 70/70 PASS (8 files) |
| production build (`next build --webpack`) | PASS / 122 routes | PASS, 122/122 static pages |
| ESLint | 5 errors (D1–D5) + ≤11 warnings, 0 new identities | 5 errors (D1–D5) + 11 warnings, 0 new identities |

The 5 ESLint errors are the pre-existing baseline `react-hooks/set-state-in-effect` items
(finance/report, residents/[id], security/incidents, voting/[id], securityCenter/useSecurityWebSocket).
No baseline lint debt was suppressed or refactored. (An interim unused-var warning introduced by the
new validator script was fixed to keep new lint identities = 0.)

The SWC "Application Control policy has blocked this file" messages during build are pre-existing
environment noise (native SWC blocked → WASM fallback), not new and not a build failure.

---

## 13. Files created / changed

**Created (untracked):**
- `prisma/migration-m2-bootstrap-orgunits-memberships.sql` — M2 migration artifact.
- `scripts/m2-orgunit-id.mjs` — UUIDv5 helper (single source of deterministic-id truth).
- `scripts/validate-m2-clone.mjs` — full clone validator (preflight → run#1 → run#2 → negatives → legacy).
- `scripts/run-migration-clone.mjs` — clone-only migration runner (refuses primary dev).
- `PHASE_1_4_M2_CLONE_VALIDATION_REPORT.md` — this report.

**Updated (untracked):**
- `PHASE_1_3_M2_BACKFILL_DESIGN.md` — D1–D6 marked final.

No files were committed; no push performed.

---

## 14. Verdict

```text
M2_CLONE_PREFLIGHT_PASS      = true
deterministic_id_binding_ok  = true
run1_cardinalities_ok        = true
run1_org_ids_deterministic   = true
M2_IDEMPOTENCY_PASS          = true
negative_tests_all_ok        = true (8/8)
rollback_clean               = true
legacy_preserved             = true
application_regression       = baseline (0 new)

M2_CLONE_VALIDATION_PASS     = true
```

---

## 15. Execution boundary confirmation

- Mutations were applied **only** to the isolated clone `ep-winter-river-aol4em67`.
- Primary development `ep-dry-cake-aoi3l143` was **NOT** mutated (read-only reads only, for manifest
  ID confirmation, under `default_transaction_read_only = on`).
- Did **not**: apply M2 to primary dev; modify PNA anomaly users; change auth; run M3; reconcile B4
  drift; push; reset/drop the clone.
- **STOP.** Awaiting explicit approval before any M2 primary-dev promotion.

---

## Post-Validation Validator Provenance Exception

- The original M2 clone validation (`M2_CLONE_VALIDATION_PASS = true`) was produced **before** a
  subsequent lint refactor of the validator.
- After the pass, `scripts/validate-m2-clone.mjs` received **one behavior-preserving refactor**: the
  four legacy-count comparisons in the preflight were changed from inline literals to references to
  the `EXPECTED_LEGACY` constant, to remove a new ESLint `no-unused-vars` warning.
  - `cmap.tenants === 3`     → `cmap.tenants === EXPECTED_LEGACY.tenants`   (3)
  - `cmap.users === 21`      → `cmap.users === EXPECTED_LEGACY.users`       (21)
  - `cmap.residents === 54`  → `cmap.residents === EXPECTED_LEGACY.residents` (54)
  - `cmap.households === 19` → `cmap.households === EXPECTED_LEGACY.households` (19)
  - where `EXPECTED_LEGACY = { tenants: 3, users: 21, residents: 54, households: 19 }`.
- **Static equivalence proof:** operators unchanged (`===`), conjunction unchanged (`&&`), no SQL/
  query changed, no target-selection changed, no mutation logic added, no preflight gate changed, no
  manifest logic changed, no expected OrgUnit/Membership cardinality changed. The edit is confined to
  the RHS operands of the `legacyOk` expression.
- **Migration SQL, UUIDv5 helper, and clone runner remained unchanged** since validation.
- A re-run of the **current** validator against the retained clone **correctly aborted at preflight**
  (`targets_empty = false`, because the clone is intentionally retained in POST-M2 state:
  `org_units = 2`, `memberships = 16`). This demonstrates fail-closed behavior against a non-PRE-M2
  target; it is **not** a new full M2 validation run and does **not** replace the original
  `M2_CLONE_VALIDATION_PASS` evidence.
- The clone was intentionally **not** reset (per instruction), which is why a legitimate full rerun
  on the exact post-refactor validator is not possible without violating the retention instruction.
- **This provenance exception was explicitly accepted before freeze.**

Provenance flags:

```text
migration_sql_unchanged_since_validation      = true
uuidv5_helper_unchanged_since_validation       = true
clone_runner_unchanged_since_validation        = true
validator_byte_identical_since_validation      = false
validator_semantic_equivalence_reviewed        = true
validator_post_validation_change               = documented lint-only refactor
M2_VALIDATION_PROVENANCE_EXCEPTION_ACCEPTED     = true
executable_artifacts_provenance                = PASS_WITH_DOCUMENTED_VALIDATOR_EXCEPTION
```

---

## Frozen Artifact Manifest (SHA-256)

Canonical **normalized-LF** SHA-256 (raw == normalized for all; files use LF line endings). The
report's own final hash is recorded **externally** in the freeze evidence (not embedded here, to
avoid a self-referential hash).

| artifact | normalized-LF SHA-256 | bytes |
| -------- | --------------------- | ----- |
| `prisma/migration-m2-bootstrap-orgunits-memberships.sql` | `ae0a3704bcdfc67d61266b368597d78d9fde5a629738dd1be8316f42697aa31f` | 22051 |
| `scripts/m2-orgunit-id.mjs` | `419375ad3683cf93030032d8d0f685825487b19f99e0a83f2caaaaae790d8deb` | 4826 |
| `scripts/validate-m2-clone.mjs` (post-refactor) | `c4bd978957bc0dbdac4de39af11b4f35637c43839b11038d5bf6f6bbe6e26438` | 23236 |
| `scripts/run-migration-clone.mjs` | `5a9b64b38e73cd6d5c0d0f36318e4102b09b22c1031f6b8066b3d2567c7d59d4` | 1782 |
| `PHASE_1_3_M2_BACKFILL_DESIGN.md` | `9038134eb1e4955f850cadf40998e064409cb5d09968413d5a887a5da08df140` | 39707 |

The frozen `validate-m2-clone.mjs` hash represents the **post-refactor** version, with the provenance
exception documented above.
