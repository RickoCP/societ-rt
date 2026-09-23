# FASE 1.5 — M2 Primary Development Promotion (Pre-Promotion Checkpoint)

**Report scope:** pre-promotion checkpoint (§1–§17) **and** the authorized M2 apply
(see "M2 PRIMARY-DEV APPLY" section at the end).
**Final status:**

```text
M2_PRIMARY_PREFLIGHT_PASS = true
RECOVERY_POINT_READY      = true    (recovery branch created + verified; see §12/§13)
M2_APPLY_AUTHORIZED       = true    (granted after checkpoint)
M2_DEV_PROMOTION_PASS     = true    (M2 executed exactly once; see final section)
```

This report may remain uncommitted until promotion closeout.

---

## 1. Frozen commit / tag identity

```text
HEAD                 = 2ac16178c6d68ea5281f09e5eab468abcffaccec
tag phase-1-m2-validated → 2ac16178c6d68ea5281f09e5eab468abcffaccec
working tree         = clean (0 status lines)
```

## 2. Frozen migration SHA-256

```text
prisma/migration-m2-bootstrap-orgunits-memberships.sql
normalized-LF SHA-256 = ae0a3704bcdfc67d61266b368597d78d9fde5a629738dd1be8316f42697aa31f
match                 = true
```

## 3. UUIDv5 consistency (frozen helper)

```text
rt01 (…011) → 2459b0bb-115e-52ce-88cd-c176a9aa1e39   (ok)
rt02 (…012) → 50197f3e-5ebc-5547-91ba-e54b604e0edb   (ok)
```

## 4. Primary target identity (sanitized)

```text
database    = neondb
host prefix = ep-dry-cake-aoi3l143
db_user     = neondb_owner
pg_version  = PostgreSQL 17.11
read_only_enforced = true (SET default_transaction_read_only = on)
```

## 5. Primary / clone isolation

```text
target_host_prefix_ok = true   (ep-dry-cake-aoi3l143)
target_database_ok    = true   (neondb)
target_not_clone      = true   (DATABASE_URL target != CLONE_DATABASE_URL target; not ep-winter-river)
clone_prefix_distinct = true
```

Validation clone `ep-winter-river-aol4em67` is NOT the target here and remains untouched.

## 6. Primary PRE-M2 counts (read-only)

| metric | expected | actual |
| ------ | -------- | ------ |
| M1 installed | true | true |
| org_units | 0 | 0 |
| memberships | 0 | 0 |
| tenants | 3 | 3 |
| users (active) | 21 | 21 |
| residents | 54 | 54 |
| households | 19 | 19 |
| partial-M2 evidence | none | none (0/0) |

## 7. M1 structural verification

```text
enums_exact          = true  (OrgUnitType / MembershipRole / MembershipStatus, exact ordered labels)
composite_fks_present = true  (org_units_parent_same_tenant_fkey, memberships_org_unit_same_tenant_fkey → org_units(id, tenant_id))
m1_indexes_present   = true  (org_units_id_tenant_id_key, org_units_path_gin_idx,
                              memberships_user_tenant_orgunit_uq, memberships_user_tenant_null_orgunit_uq)
```

## 8. Source-role classification

```text
platform Super_Admin = 3
ordinary RT users    = 13
platform anomalies   = 5
```

## 9. Exclusion-manifest result (IDs / roles only, no PII)

| alias | user_id | expected tenant | expected legacy role |
| ----- | ------- | --------------- | -------------------- |
| PNA-01 | `00000000-0000-0000-0000-000000000021` | platform (`…010`) | Ketua_RT |
| PNA-02 | `00000000-0000-0000-0000-000000000022` | platform (`…010`) | Pengurus |
| PNA-03 | `00000000-0000-0000-0000-000000000023` | platform (`…010`) | Warga |
| PNA-04 | `00000000-0000-0000-0000-000000000024` | platform (`…010`) | Security_Guard |
| PNA-05 | `42cc1bea-9a68-44b1-aadf-1bb0bb609028` | platform (`…010`) | Warga |

```text
manifest matched      = 5 / 5 (exact tenant + role)
outside manifest      = 0
manifest_exact_five   = true
```

## 10. Unexpected-user / role & integrity checks

```text
no_unknown_role   = true (0 users outside the 5 legacy roles)
no_orphan_user    = true (0 user→tenant orphans)
tenant_ownership  = true (0 NULL tenant_id)
b4_drift_unchanged = true (gates / cctv_cameras / homes still absent)
```

## 11. PRE-M2 fingerprint (sanitized; no PII)

```text
tenants=3  users=21  residents=54  households=19
org_units=0  memberships=0
platform_admin_source_count=3
ordinary_rt_source_count=13
excluded_manifest_count=5
unexpected_platform_nonadmin_count=0
legacy_integrity_ok=true

role_matrix_sha256                  = ffae45a27d761890f3aab491834f83cf55bef3c4e33aa3b61ab723a69ba5abdb
exclusion_manifest_sha256           = b0e9de56e9e150e24b08de12e72b8ed78080b1c51873e0f4ce305c0ed8b45159
rt_source_identity_sha256           = a21d5e0fc832f1506e2350ae88e417a1050b0cc2f16d17ab92949e6864db7fc9
platform_super_admin_identity_sha256 = 300b4dafa8a6e2b03f4a8c621af6d3d1e66e2e8848284f94740a2eff07df81ba
```

## 12. Recovery branch (STEP 5) — CREATED

```text
name           = pre-m2-dev-recovery-20260923   (POST-M1 / PRE-M2)
created by     = operator (Neon console), from current primary development
recovery host  = ep-dawn-mud-aodkjecd   (distinct from primary + clone)
database       = neondb
access         = RECOVERY_DATABASE_URL (stored locally by operator; not printed)
DATABASE_URL   = NOT repointed
must NOT reuse = pre-m1-dev-recovery-20260923 (different, PRE-M1 state) — not reused
```

## 13. Recovery branch verification (STEP 6) — READ-ONLY, PASS

Verified with `RECOVERY_DATABASE_URL` under `SET default_transaction_read_only = on`; recovery target
proven distinct from both primary (`ep-dry-cake-aoi3l143`) and clone (`ep-winter-river-aol4em67`).

| check | expected | actual |
| ----- | -------- | ------ |
| recovery_not_primary / recovery_not_clone | true | true |
| M1 installed | true | true |
| org_units | 0 | 0 |
| memberships | 0 | 0 |
| tenants / users / residents / households | 3 / 21 / 54 / 19 | 3 / 21 / 54 / 19 |
| platform Super_Admin | 3 | 3 |
| ordinary RT users | 13 | 13 |
| excluded anomalies (manifest exact) | 5 | 5 |
| unexpected platform non-admin outside manifest | 0 | 0 |
| unknown roles | 0 | 0 |
| legacy integrity clean | true | true |
| M1 structural foundation | intact | intact (enums / composite FKs / indexes) |

**Fingerprint comparison vs recorded primary PRE-M2 — all match:**

```text
role_matrix_sha256                   : match  (ffae45a2…ba5abdb)
exclusion_manifest_sha256            : match  (b0e9de56…d8b45159)
rt_source_identity_sha256            : match  (a21d5e0f…64db7fc9)
platform_super_admin_identity_sha256 : match  (300b4daf…07df81ba)
all_match = true
```

The recovery branch is a faithful POST-M1 / PRE-M2 snapshot of primary development.
`RECOVERY_POINT_READY = true`.

## 14. B4 drift status

```text
gates        = absent
cctv_cameras = absent
homes        = absent
(unchanged from prior phases)
```

## 15. Files created / changed this checkpoint

- `scripts/preflight-m2-dev.mjs` — SELECT-only primary PRE-M2 preflight + fingerprint (new, untracked).
- `PHASE_1_5_M2_DEV_PROMOTION_REPORT.md` — this report (new, untracked).
- Frozen M2 artifacts: **unmodified**.

## 16. DB mutation summary

```text
primary dev (ep-dry-cake-aoi3l143)  : READ-ONLY only (SET default_transaction_read_only = on); NO writes
validation clone (ep-winter-river)  : untouched (retained at org_units=2 / memberships=16)
recovery branch (ep-dawn-mud-…)     : READ-ONLY verification only (SET default_transaction_read_only = on); NO writes
```

## 17. Checkpoint conclusion

```text
M2_PRIMARY_PREFLIGHT_PASS = true
RECOVERY_POINT_READY      = true
M2_APPLY_AUTHORIZED       = false
```

**STOP — M2 not applied.** Preflight passed and a verified POST-M1/PRE-M2 recovery point exists.
Awaiting explicit approval for the M2 write step.

---

# M2 PRIMARY-DEV APPLY (executed after authorization)

**M2 was executed EXACTLY ONCE on primary development (`ep-dry-cake-aoi3l143`).**

```text
M2_DEV_PROMOTION_PASS = true
```

## A. Write-time safety gate (immediately pre-write) — GATE_PASS

```text
target_host_prefix = ep-dry-cake-aoi3l143   (ok)
database           = neondb                 (ok)
DATABASE_URL != CLONE_DATABASE_URL          (ok)
DATABASE_URL != RECOVERY_DATABASE_URL       (ok)
HEAD = 2ac16178c6d68ea5281f09e5eab468abcffaccec
tag phase-1-m2-validated → 2ac16178c6d68ea5281f09e5eab468abcffaccec
migration normalized-LF SHA-256 = ae0a3704bcdfc67d61266b368597d78d9fde5a629738dd1be8316f42697aa31f (ok)
PRE-M2 org_units = 0, memberships = 0        (ok)
source guards: 3 tenants / 21 users / 3 Super_Admin / 13 RT / 5 anomalies (ok)
```

## B. M2 execution result

```text
runner       = node scripts/run-migration.mjs prisma/migration-m2-bootstrap-orgunits-memberships.sql
target        = DATABASE_URL (primary dev, ep-dry-cake-aoi3l143 / neondb)
artifact_sha256 = ae0a3704bcdfc67d61266b368597d78d9fde5a629738dd1be8316f42697aa31f
result        = MIGRATION_OK
exit_code     = 0
executed      = exactly once (no second run on primary)
```

## C. Post-M2 cardinalities (read-only)

```text
org_units                     = 2
memberships                   = 16
platform tenant-level PLATFORM_ADMIN = 3
RT org-scoped                 = 13
excluded anomaly w/ membership = 0
non-ACTIVE memberships        = 0
unexpected memberships        = 0
unexpected org_units          = 0
```

## D. Deterministic OrgUnits (verified)

| tenant | id | type | parent_id | depth | path |
| ------ | -- | ---- | --------- | ----- | ---- |
| rt01 (`…011`) | `2459b0bb-115e-52ce-88cd-c176a9aa1e39` | RT | NULL | 0 | `{2459b0bb-115e-52ce-88cd-c176a9aa1e39}` |
| rt02 (`…012`) | `50197f3e-5ebc-5547-91ba-e54b604e0edb` | RT | NULL | 0 | `{50197f3e-5ebc-5547-91ba-e54b604e0edb}` |

## E. Membership role/scope distribution

```text
platform (…010) tenant-level: PLATFORM_ADMIN = 3
rt01 (…011) org-scoped:  RT_ADMIN=1  ORG_ADMIN=2  RESIDENT=2  SECURITY=2   (=7)
rt02 (…012) org-scoped:  RT_ADMIN=1  ORG_ADMIN=2  RESIDENT=2  SECURITY=1   (=6)
all memberships status = ACTIVE
```

## F. Excluded anomaly verification

```text
5 exclusion-manifest users still present, same tenant + legacy role, and have NO membership.
excluded_with_membership = 0
```

## G. Legacy preservation + fingerprint comparison

```text
tenants=3  users=21  residents=54  households=19  (unchanged)
no orphan User→Tenant, no NULL tenant, no unknown legacy role
5 anomalous platform users untouched
role_matrix_sha256                   = ffae45a2…ba5abdb   (matches PRE-M2)
exclusion_manifest_sha256            = b0e9de56…d8b45159   (matches PRE-M2)
rt_source_identity_sha256            = a21d5e0f…64db7fc9   (matches PRE-M2)
platform_super_admin_identity_sha256 = 300b4daf…07df81ba   (matches PRE-M2)
→ M2 added only OrgUnit/Membership state; no legacy row mutated.
```

## H. B4 drift

```text
gates / cctv_cameras / homes = still absent (unchanged)
```

## I. Application regression (post-M2)

```text
prisma validate  = PASS
TypeScript       = 0 errors
Vitest           = 70/70 PASS (8 files)
production build = PASS (122/122 static pages)
ESLint           = 5 errors (D1-D5 baseline) / 11 warnings; new identities = 0
```

## J. Final primary state

```text
platform : no bootstrap OrgUnit; 3 PLATFORM_ADMIN memberships (tenant-level)
rt01     : RT OrgUnit 2459b0bb-… ; 7 org-scoped memberships
rt02     : RT OrgUnit 50197f3e-… ; 6 org-scoped memberships
TOTAL    : OrgUnits = 2, Memberships = 16, Excluded anomalies = 5
```

## K. Post-apply state of other databases

```text
validation clone (ep-winter-river-aol4em67) : untouched (retained at 2 / 16)
recovery branch  (ep-dawn-mud-aodkjecd)     : untouched (POST-M1 / PRE-M2 snapshot retained)
```

**STOP.** M2 promotion to primary dev complete and verified. Not committed/tagged/pushed; no M3; no
auth change; recovery branch and validation clone retained.
