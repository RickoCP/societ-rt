# FASE 1.2c — M1 DEV PROMOTION: PASS

M1 (the additive **OrgUnit + Membership** foundation) has been promoted to the **primary
development database** as an **additive schema foundation only**. No data was created, no
backfill was performed, and no cutover occurred.

Current post-M1 state:

```text
legacy data      = unchanged
org_units        = 0 rows
memberships      = 0 rows
M2/backfill      = NOT STARTED
```

This document is the closeout evidence for FASE 1.2c. It records the frozen source, the gated
execution sequence, and the verification results. It contains no secrets.

---

## 1. Frozen source

| item             | value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| M1 source commit | `3c01e1f41175383359531cf48c004ab6454dc1b0`                         |
| tag              | `phase-1-m1-validated`                                             |
| runbook commit   | `e890296d63fbccb76ddc86af554ca3b0b4079bd2`                         |
| migration        | `prisma/migration-add-orgunit-membership.sql`                     |

**Source-content identity (STEP 4)** — the migration that was executed is the same content
frozen at `phase-1-m1-validated`. Established by:

- **Git blob identity:** `HEAD:prisma/migration-add-orgunit-membership.sql` and
  `phase-1-m1-validated:…` resolve to the **same** blob object
  `db2a8b44daefba19a7e67728b2a3a08395f9eb36`.
- **Normalized SHA-256 match:** hashing git's stored bytes for both refs yields the same
  SHA-256 `EA619CD7D82851996D2F95FE628AB8B1814C0E8C0A2B4412AD16A9F8842DEEDD`.
- **Empty git diff:** `git diff phase-1-m1-validated -- <migration>` produced no output.
- **Unchanged since freeze:** `git diff 3c01e1f..HEAD -- <migration>` empty — the later runbook
  commit did not touch the migration.

**EOL nuance (stated accurately):** the *committed git content* was identical. The *raw
working-tree file bytes* produced a different SHA-256 (`F745E68B…E1CC`) purely because of
LF→CRLF checkout normalization on Windows. The raw working-tree bytes are therefore **not**
byte-for-byte identical to the LF-stored blob; identity of the *source content* was established
via git blob identity, normalized SHA-256, and the empty git diff — not via the raw byte hash.

---

## 2. Credential rotation

Previously exposed development credential was rotated and invalidated before promotion.

(No credential, connection string, or `DATABASE_URL` value is recorded in this report.)

---

## 3. Primary DEV identity (sanitized)

| field                | value                             |
| -------------------- | --------------------------------- |
| database             | `neondb`                          |
| DB user              | `neondb_owner`                    |
| PostgreSQL           | 17.11                             |
| endpoint identifier  | `ep-dry-cake-aoi3l143…` (pooler)  |
| target classification| **primary development DB**        |

The target was proven **not** to be any validation clone (`ep-winter-river…`, `ep-red-dawn…`,
`ep-morning-boat…`) or the recovery branch — checked at preflight (STEP 2), before execution
(STEP 5 final assertion), and during verification (STEP 6).

---

## 4. Recovery point

| field           | value                          |
| --------------- | ------------------------------ |
| recovery branch | `pre-m1-dev-recovery-20260923` |
| parent          | `production`                   |
| created         | `2026-09-23 16:33:48`          |
| expiry          | `2026-09-24 16:33:47`          |

- The recovery branch was created **before** M1.
- It was **not** reset/updated from parent afterward.
- It remained **untouched** throughout promotion, and is **not** deleted by this closeout.

---

## 5. STEP 2 — Preflight evidence

```text
target_identity_ok    = true
read_only_enforced    = true
legacy_counts_ok      = true
targets_absent        = true
m1_objects_absent     = true
schema_baseline_ok    = true
legacy_integrity_ok   = true

STEP_2_PREFLIGHT_PASS = true
```

PRE-M1 legacy counts:

```text
tenants     = 3
users       = 21
residents   = 54
households  = 19
```

PRE-M1 target state:

```text
org_units   = absent
memberships = absent
```

No partial M1 footprint (enums / named indexes / constraints all absent). Run read-only via
`scripts/preflight-m1-dev.mjs` (`SET default_transaction_read_only = on`).

---

## 6. STEP 4 — Frozen artifact evidence

```text
tag_commit_ok                    = true   (phase-1-m1-validated -> 3c01e1f…)
same_git_blob                    = true   (db2a8b44…)
normalized_sha256_match          = true   (EA619CD7…DEEDD)
git_content_diff_empty           = true
migration_unchanged_since_freeze = true

STEP_4_FROZEN_ARTIFACT_PASS      = true
```

---

## 7. STEP 5 — Execution evidence

```text
target_identity_ok       = true
migration_file_unchanged = true
migration_started        = true
migration_exit_code      = 0
migration_applied        = true

STEP_5_M1_APPLY_PASS     = true
```

Runner output: `MIGRATION_OK: prisma/migration-add-orgunit-membership.sql` (exit 0). Command
executed: exactly `node scripts/run-migration.mjs prisma/migration-add-orgunit-membership.sql`
— no other migration command.

Note: successful execution alone did **not** prove the installed structure; the structural
proof was supplied separately by STEP 6 (catalog inspection).

---

## 8. STEP 6 — Structural verification

```text
STEP_6_STRUCTURAL_VERIFICATION_PASS = true
```

Verified from PostgreSQL catalogs (read-only, `scripts/verify-m1-dev.mjs`):

- **OrgUnit** structure correct: `id`/`tenant_id`/`name` TEXT NOT NULL, `parent_id` TEXT nullable,
  `type` `OrgUnitType` NOT NULL, `path` `TEXT[]` (`_text`) NOT NULL, `depth` INTEGER NOT NULL,
  timestamps NOT NULL.
- **Membership** structure correct: `id`/`user_id`/`tenant_id` TEXT NOT NULL, `org_unit_id` TEXT
  **nullable**, `role` `MembershipRole` NOT NULL, `status` `MembershipStatus` NOT NULL default
  `ACTIVE`, timestamps NOT NULL, `revoked_at` nullable.
- **Exact enums** (ordered): `OrgUnitType` = ORGANIZATION, CLUSTER, RW, RT; `MembershipRole` =
  PLATFORM_ADMIN, TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT; `MembershipStatus` =
  INVITED, ACTIVE, SUSPENDED, REVOKED.
- **Same-tenant composite FKs** correct: `org_units_parent_same_tenant_fkey (parent_id, tenant_id)
  → org_units(id, tenant_id)`; `memberships_org_unit_same_tenant_fkey (org_unit_id, tenant_id) →
  org_units(id, tenant_id)`. Plus tenant/user FKs.
- **Candidate unique index** `org_units_id_tenant_id_key (id, tenant_id)` correct.
- **GIN index** `org_units_path_gin_idx USING gin (path)` correct.
- **Both Membership partial uniques** correct: `…_user_tenant_orgunit_uq (user_id, tenant_id,
  org_unit_id) WHERE org_unit_id IS NOT NULL`; `…_user_tenant_null_orgunit_uq (user_id, tenant_id)
  WHERE org_unit_id IS NULL`.
- **`role` absent** from both uniqueness keys.
- **CHECK** `org_units_depth_nonneg_check ((depth >= 0))` correct.

Target rows post-DDL:

```text
org_units   = 0
memberships = 0
```

Legacy counts remained:

```text
tenants     = 3
users       = 21
residents   = 54
households  = 19
```

Legacy integrity remained clean (orphan User/Resident/Household→Tenant = 0; null-tenant = 0;
platform tenant `…010` present). No NT1–NT8 fixtures were run on the primary dev DB — constraint
behavior was already proven on the fresh clone (FASE 1.2b).

---

## 9. Known B4 schema drift

```text
gates         = absent
cctv_cameras  = absent
homes         = absent
```

This is pre-existing, documented schema drift (present in `schema.prisma`, absent in the dev DB).
It was **NOT** reconciled as part of M1 and remains out of scope.

---

## 10. STEP 7 — Application regression

```text
prisma validate     = PASS
TypeScript          = PASS / 0 errors
Vitest              = 70/70 PASS
production build    = PASS / 122/122
ESLint errors       = 5
ESLint warnings     = 11
new lint identities = 0
```

The five ESLint errors are the **accepted pre-existing D1–D5** `react-hooks/set-state-in-effect`
identities:

- `src/app/(dashboard)/finance/report/page.tsx:54`
- `src/app/(dashboard)/residents/[id]/page.tsx:92`
- `src/app/(dashboard)/security/incidents/page.tsx:77`
- `src/app/(dashboard)/voting/[id]/page.tsx:87`
- `src/presentation/features/securityCenter/hooks/useSecurityWebSocket.ts:151`

**ESLint is NOT globally clean** — it reports 5 errors + 11 warnings, which is the accepted
baseline debt. **Command-capture caveat:** one shell capture printed `LINT_EXIT=0` due to a
`cmd /c … & echo %errorlevel%` expansion quirk; that value is **not authoritative**. ESLint's
real native exit is non-zero whenever errors exist. The regression verdict is based on the exact
baseline **error identities/count (5, all D1–D5)** and **warning count (11)**, not on that
captured shell value.

---

## 11. Final gate matrix

```text
credential rotation             PASS
runbook freeze                  PASS
STEP 2 primary-dev preflight    PASS
STEP 3 recovery point           PASS
STEP 4 frozen artifact          PASS
STEP 5 M1 execution             PASS
STEP 6 structural verification  PASS
legacy preservation             PASS
STEP 7 application regression   PASS
```

# `M1_DEV_PROMOTION_PASS = true`

---

## 12. Architecture boundary — what FASE 1.2c did NOT do

FASE 1.2c was **additive schema foundation only**. It did **NOT**:

- run M2/M3;
- create root OrgUnits;
- backfill Memberships;
- change auth reads;
- dual-write;
- remove `User.tenantId`;
- change JWT/session behavior;
- implement RLS;
- implement NIK migration;
- implement refresh tokens;
- reconcile B4 schema drift;
- redesign IoT ownership.

---

## 13. Helper scripts

Two untracked read-only helper scripts were created during promotion:

- `scripts/preflight-m1-dev.mjs` — STEP 2 preflight (SELECT-only, enforces
  `default_transaction_read_only = on`, emits sanitized JSON).
- `scripts/verify-m1-dev.mjs` — STEP 6 structural verification (SELECT-only, catalog inspection,
  emits sanitized JSON).

Review result: **no secrets, no hardcoded credentials, no connection strings, no PII, and no
write/DDL capability** (both are SELECT-only and read `DATABASE_URL` from the environment; neither
prints it). They contain no `INSERT/UPDATE/DELETE/DROP/ALTER/CREATE`.

**Recommendation:** promote both to **reusable tracked operational verification scripts**. They
are valuable for future migration promotions (M2/M3 will want analogous preflight/verify gates),
are safe by construction (read-only), and complement the existing `scripts/validate-m1-clone.mjs`.
Suggested: commit them under a `docs`/`chore` change when convenient — **not** as part of this
closeout, and only on your instruction. They should **not** be silently deleted, since they encode
the exact preflight/verification contract used here.

---

## 14. Git hygiene (this closeout)

- Report secret-scanned: no credential / connection string / token.
- No `_m1_dev_*.json` artifact is tracked (they are gitignored).
- `.env` remains ignored and untracked.
- Nothing committed by this step.

---

## 15. Database untouched during STEP 9

STEP 9 is documentation only. **No database operation was performed** — no query, no DDL, no
DML, no recovery-branch change. The report was written from evidence captured in STEP 2–7.

---

## Status

**FASE 1.2c — M1 DEV PROMOTION: PASS.** M1 is live on the primary development DB as an empty,
additive, structurally-verified foundation; legacy data preserved; application at the frozen
regression baseline. Awaiting separate approval for any subsequent phase.
