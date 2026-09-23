# FASE 1.1 — Database & Multi-Tenant Domain Foundation: Migration Plan

> **Status:** DESIGN ONLY / READ-ONLY. Tidak ada perubahan `schema.prisma`,
> migration, database, atau application code pada FASE 1.1. Dokumen ini adalah
> deliverable tunggal; setelah ini **STOP** menunggu review sebelum FASE 1.2.
>
> **Baseline:** `pre-phase-1-clean-baseline` (`9747d47`). Regression ceiling: lint = 5 (by identity).
>
> **Prinsip:** ADD → MIGRATE/BACKFILL → VERIFY → CUTOVER LATER → DROP LAST. No big-bang. No point-of-no-return di FASE 1.
>
> **Acuan:** `docs/ARCHITECTURE_TARGET_DESIGN.md` (keputusan LOCKED).

---

## 1. Current Schema Inventory

Sumber: `prisma/schema.prisma` (dibaca penuh). Generator: `provider = "prisma-client"`, output `../src/generated/prisma`. Datasource: postgresql. Konvensi: id `String @default(uuid())` (kolom DB `TEXT`, migration SQL memakai `gen_random_uuid()::text`), camelCase↔snake_case via `@map`, tabel plural via `@@map`, soft-delete `deletedAt` di sebagian model.

**Enums (33):** TenantStatus, UserRole, UserStatus, ResidencyStatus, Gender, TransactionType, IuranPaymentStatus, VoteMode, AnnouncementCategory, EmergencyAlertStatus, SeverityLevel, LetterType, LetterRequestStatus, RsvpResponse, InvoiceStatus, IoTDeviceType, IoTDeviceOnlineStatus, DeviceEventType, IncidentSeverity, IncidentCategory, IncidentStatus, GateStatus, GateEventState, CctvCameraStatus, CctvSnapshotTriggerType, PatrolSessionStatus, AlarmDeviceStatus, AlarmTriggerSource, AutomationExecutionStatus, DoorState, DoorInstallationStatus, EmergencyContactCategory.

**Models inti yang relevan FASE 1:**

| Model | Ownership keys | Unique constraints | Catatan |
|-------|----------------|--------------------|---------|
| `SubscriptionPlan` | — | — | dipakai Tenant |
| `Tenant` | root | `subdomain` unique; `@@unique([rtRwNumber, region])` | membawa atribut RT + branding + `sirenDeviceId` + `subscriptionPlanId` |
| `User` | `tenantId` (FK) | `@@unique([tenantId, email])` | 1 user → 1 tenant (1:1 bridge). role tunggal global. soft-delete. |
| `Household` | `tenantId` (FK) | `@@unique([tenantId, householdNumber])` | |
| `Resident` | `tenantId`, `householdId` (FK) | `@@unique([tenantId, nik])` | **NIK plaintext**. soft-delete. Terpisah dari User. |
| `InvitationToken` | `tenantId` (FK) | `token` unique | role via UserRole |
| Device: `IoTDevice` | `tenantId` + `householdId` | `tuyaDeviceId` unique | household-scoped |
| Device: `DoorSensorConfig` | `tenantId` + `householdId` unique + `iotDeviceId?` unique | — | household-scoped |
| Device: `Home` | `tenantId` + `householdId` + `ownerId` | — | household-scoped |
| Device: `Gate`, `CctvCamera`, `AlarmDevice` | `tenantId` only (+ `deviceId` string) | — | tenant-scoped, **tanpa** householdId |
| ~30 model lain (finance, voting, event, security, audit, dst) | `tenantId` (FK) | beragam | semua tenant-scoped |

**Tidak ada** model `OrgUnit` maupun `Membership` (greenfield).

---

## 2. Migration Tooling & Convention (Inventory)

- Project **tidak** memakai `prisma migrate` untuk deploy (Prisma engine gagal di Windows — `spawn UNKNOWN`). Migration dijalankan sebagai **SQL idempotent** via `scripts/run-migration.mjs <file.sql>` (pakai `pg` langsung).
- Pola SQL existing (mis. `migration-add-emergency-contacts.sql`): `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`, `CREATE TABLE IF NOT EXISTS`, `id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`, FK `REFERENCES "tenants"("id")`, `CREATE INDEX IF NOT EXISTS`, diakhiri SELECT verifikasi.
- **Konsekuensi FASE 1:** migration additive akan ditulis sebagai SQL idempotent + `schema.prisma` diperbarui agar Prisma Client tetap sinkron (generate dijalankan di lingkungan yang mendukung / CI). Baseline migration wajib dijalankan **di Docker/Linux/CI atau via runner**, dengan backup + uji di clone DB (lihat §14, §17).
- **Tipe kolom:** kolom `path` `uuid[]` — perhatikan bahwa id existing bertipe `TEXT` (uuid-as-text), bukan `uuid` native. Lihat §6 (keputusan tipe `path`).

---

## 3. Dependency Map (blast radius)

Dari discovery (context-gatherer + baca langsung). Alur tenant scoping:
`JWT payload (userId, tenantId, role)` → `middleware` verify → inject header `x-user-id/x-tenant-id/x-user-role` → `resolveAuthContext` → `AuthContext {userId, tenantId, role}` → use case → repository → `TenantScopedRepository` (`where.tenantId`).

**Titik sentral (harus stabil selama FASE 1 — JANGAN diubah di 1.x additive):**
1. `src/core/protocols/AuthContext.ts` — `AuthContext {userId, tenantId, role}` + enum `UserRole`.
2. `src/infrastructure/repositories/TenantScopedRepository.ts` — primitive isolasi; hardcode 1 `tenantId` string/operasi. Blast radius terbesar (dipakai hampir semua repository).
3. `src/middleware.ts` — sumber header tenant (JWT klaim `tenantId`).
4. `src/infrastructure/utils/jwt.ts` — `JwtPayload {userId, tenantId, role}`; `signJwt/verifyJwt`.
5. `src/infrastructure/utils/resolveAuthContext.ts` — rekonstruksi AuthContext dari header.
6. `src/infrastructure/repositories/auth/AuthRepositoryImpl.ts` — `login()` baca `tenantId+role` dari `User`, cetak ke JWT.
7. Seluruh `src/core/domains/**/usecases/*` + `src/infrastructure/repositories/**/*Impl.ts` — kontrak `(tenantId, ...)`.

**RT attributes / branding / siren:** `Tenant` membawa `rtRwNumber, region, address, contactPerson, logoUrl, primaryColor, secondaryColor, sirenDeviceId`. Baca/tulis di `TenantRepositoryImpl` (`update` whitelist: name/address/contactPerson/logoUrl/primaryColor/secondaryColor/sirenDeviceId; `rtRwNumber`/`region` immutable dari sini), route `api/tenants/*`, `useTenantListViewModel`, seed.

**IoT ownership (tidak seragam):** `IoTDevice`/`DoorSensorConfig`/`Home` = household-scoped; `Gate`/`CctvCamera`/`AlarmDevice` = tenant-scoped tanpa household. `TuyaAlarmAdapter.resolveDeviceId(tenantId)` mengasumsikan **1 siren/tenant** via `Tenant.sirenDeviceId` + env fallback.

**Role:** tunggal & tenant-global di JWT; cek role hardcoded tersebar (kadang enum, kadang string literal).

**Resident ≠ User:** dikonfirmasi terpisah. Tidak ada pembuatan User untuk tiap Resident. Membership akan menempel ke **User**, bukan Resident.

---

## 4. Legacy Assumptions (yang harus diperlakukan hati-hati)

1. **`Tenant == RT`.** Tenant membawa atribut RT langsung. Target: Tenant = SaaS/billing/security boundary; RT menjadi `OrgUnit(type=RT)`. FASE 1: **jangan hapus** atribut RT dari Tenant (compatibility).
2. **`User.tenantId` 1:1.** Satu user milik satu tenant, role tunggal. Target: `Membership(user, tenant, orgUnit, role, status)`. FASE 1: `User.tenantId` tetap **compatibility bridge** (tetap ditulis & dibaca).
3. **1 siren per tenant** (`Tenant.sirenDeviceId`). Target: device ownership per level (OrgUnit/Household) dengan integritas FK. FASE 1: **tidak** menyentuh IoT ownership.
4. **NIK sebagai natural key** (`@@unique([tenantId, nik])`, plaintext). Target: AES-GCM + HMAC + KeyProvider; **uniqueness OPEN**. FASE 1: **tidak** menyentuh NIK.
5. **`@@unique([tenantId, householdNumber])`** & **`@@unique([tenantId, email])`** — natural keys per tenant; tetap valid selama Tenant tetap boundary.
6. Data mungkin tidak bersih: duplicate RT identity, missing `rtRwNumber`, malformed region, orphan, duplicate email lintas tenant, anomali resident/household (harus di-audit di FASE 1.2 sebelum bootstrap).

---

## 5. Target Transitional Schema (FASE 1 — additive)

Yang **ditambahkan** (semua nullable/independen, tanpa mengubah kolom existing):
- Enum baru: `OrgUnitType`, `MembershipRole`, `MembershipStatus`.
- Tabel baru: `org_units`, `memberships`.
- Kolom transisional nullable pada tabel existing (opsional, lihat §6.3): `users.primary_org_unit_id` (nullable FK) sebagai jembatan baca bertahap — **default TIDAK ditambahkan di 1.2 kecuali disetujui**; dicatat sebagai opsi.

Yang **TIDAK** disentuh di FASE 1: `Tenant` RT attributes, `User.tenantId`, `Resident.nik`, semua device model, refresh-token, RLS.

---

## 6. Proposed OrgUnit Schema

### 6.1 Enum `OrgUnitType`
`ORGANIZATION | CLUSTER | RW | RT` (sesuai target design; extensible).

### 6.2 Tabel `org_units`

| Kolom (Prisma / DB) | Tipe | Null | Keterangan |
|---------------------|------|------|------------|
| `id` / `id` | String / TEXT (`gen_random_uuid()::text`) | NOT NULL PK | konsisten dengan id existing (TEXT) |
| `tenantId` / `tenant_id` | String / TEXT | NOT NULL, FK→`tenants(id)` | **security boundary** |
| `parentId` / `parent_id` | String / TEXT | NULL, FK→`org_units(id)` | **relasi kanonik**; NULL = root |
| `type` / `type` | `OrgUnitType` | NOT NULL | |
| `name` / `name` | String / TEXT | NOT NULL | |
| `path` / `path` | String[] / **TEXT[]** | NOT NULL DEFAULT `'{}'` | materialized path berisi rantai id ancestor→self. Lihat 6.4. |
| `depth` / `depth` | Int / INTEGER | NOT NULL DEFAULT 0 | root depth 0 |
| `createdAt`/`updatedAt` | DateTime | NOT NULL | konvensi |

> **Keputusan tipe `path`:** target design menyebut `uuid[]`. Namun id existing disimpan sebagai **TEXT** (uuid-as-text), dan Prisma memodelkan sebagai `String`. Agar konsisten & first-class di Prisma (`String[]`), `path` = **`TEXT[]`** berisi nilai id yang sama (uuid dalam bentuk text). Ini memenuhi maksud keputusan LOCKED (materialized path array, bukan `ltree`) tanpa mismatch tipe FK. Alternatif `uuid[]` native ditolak karena id lain bertipe TEXT → akan memaksa cast di setiap join/query.

**Index:**
- `@@index([tenantId])` (b-tree) — filter per tenant.
- `@@index([parentId])` (b-tree) — traversal children.
- GIN pada `path` (`CREATE INDEX ... USING gin(path)`) — query descendant `:ancestorId = ANY(path)`.
- Pertimbangan unique: **tidak** ada unique global untuk `name` (nama boleh sama antar cabang). Uniqueness lain (mis. `(tenantId, parentId, name)`) **ditunda** — lihat §9 & Open Question.

### 6.3 Invariant OrgUnit (dilindungi di aplikasi/service; sebagian di DB)
1. `parent.tenant_id == child.tenant_id` — **CHECK sulit lintas-baris di SQL murni**; ditegakkan via **domain/service + trigger opsional** (lihat §9 "invariant enforcement"). FK `parent_id → org_units(id)` menjamin parent ada; kesamaan tenant divalidasi di service dan (opsional) trigger.
2. **No cycle** — dijaga oleh service move-subtree (satu operasi, satu transaksi) + validasi `path` (self tidak boleh muncul di prefix). Tidak ada CHECK cycle di DDL murni.
3. `path`/`depth` **derived** — hanya boleh ditulis oleh service hierarki, bukan caller arbitrary. Ditegakkan dengan tidak mengekspos setter path/depth di repository publik (kebijakan aplikasi).
4. **Move subtree** = satu domain/service operation dalam satu transaksi (update path+depth seluruh descendant). Belum diimplementasi di FASE 1 (hanya create root saat bootstrap).
5. `tenant_id` = security boundary. RLS **tidak** bergantung pada `path` (dan RLS tidak diimplementasikan FASE 1).

### 6.4 Semantik `path`
`path` = array id dari root→self **inklusif** (atau ancestor-only; **keputusan**: inklusif-self agar `:id = ANY(path)` mengembalikan node itu sendiri + descendant). `depth = length(path) - 1`. Contoh root RT tunggal: `path = [rtId]`, `depth = 0`.

---

## 7. Proposed Membership Schema

### 7.1 Enum `MembershipRole` & `MembershipStatus`
- `MembershipStatus`: `INVITED | ACTIVE | SUSPENDED | REVOKED` (LOCKED).
- `MembershipRole`: **keputusan role-set** — target design §4 mengusulkan `PLATFORM_ADMIN, TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT`. Namun legacy `UserRole` = `Super_Admin, Ketua_RT, Pengurus, Warga, Security_Guard`. **Untuk FASE 1 additive**, `MembershipRole` diusulkan sebagai enum baru target (`PLATFORM_ADMIN, TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT`) dengan **mapping** dari legacy (lihat §5 backfill / §11). Enum legacy `UserRole` **tetap ada** dan dipakai auth existing. (Menandai sebagai keputusan yang perlu konfirmasi di review — apakah pakai enum baru atau reuse `UserRole` dulu.)

### 7.2 Tabel `memberships`

| Kolom (Prisma / DB) | Tipe | Null | Keterangan |
|---------------------|------|------|------------|
| `id` | String / TEXT | NOT NULL PK | |
| `userId` / `user_id` | String / TEXT | NOT NULL, FK→`users(id)` | membership menempel ke User (bukan Resident) |
| `tenantId` / `tenant_id` | String / TEXT | NOT NULL, FK→`tenants(id)` | denormalized boundary (eksplisit, tidak via path) |
| `orgUnitId` / `org_unit_id` | String / TEXT | NULL, FK→`org_units(id)` | scope org; nullable di transisi (bootstrap mengisi RT root) |
| `role` | `MembershipRole` (atau `UserRole` — lihat 7.1) | NOT NULL | |
| `status` | `MembershipStatus` | NOT NULL DEFAULT `ACTIVE` (backfill) / `INVITED` (baru) | |
| `createdAt`/`updatedAt` | DateTime | NOT NULL | |
| `revokedAt` / `revoked_at` | DateTime | NULL | audit lifecycle |

**Index / uniqueness:**
- `@@index([userId])`, `@@index([tenantId])`, `@@index([orgUnitId])`.
- Uniqueness **hati-hati**: mencegah duplicate membership. Kandidat: `@@unique([userId, tenantId, orgUnitId, role])`. **Masalah:** `orgUnitId` nullable → di Postgres NULL tidak dianggap sama (unique tidak mencegah duplikat saat orgUnit NULL). **Keputusan (FASE 1):** JANGAN pasang unique keras dulu; gunakan **partial unique index** `WHERE org_unit_id IS NOT NULL` ATAU tunda ke 1.2 setelah backfill mengisi orgUnit. Ditandai sebagai constraint yang di-defer (lihat §9 + Open Question).

### 7.3 Relasi konseptual
`User (1) → Membership (N) → (Tenant + OrgUnit + Role + Status)`. `User.tenantId` **tetap** ada sebagai bridge; membership adalah sumber kebenaran baru yang dibangun **paralel** (belum menggantikan).

---

## 8. Enum Design (baru)

```
OrgUnitType      = ORGANIZATION | CLUSTER | RW | RT
MembershipStatus = INVITED | ACTIVE | SUSPENDED | REVOKED
MembershipRole   = PLATFORM_ADMIN | TENANT_OWNER | ORG_ADMIN | RT_ADMIN | SECURITY | RESIDENT   (pending konfirmasi §7.1)
```
SQL: `DO $$ BEGIN CREATE TYPE "OrgUnitType" AS ENUM (...); EXCEPTION WHEN duplicate_object THEN NULL; END $$;` (idempotent, konsisten konvensi).

---

## 9. Indexes / Constraints + invariant yang dilindungi

| Objek | Invariant yang dilindungi | Catatan |
|-------|---------------------------|---------|
| `org_units.tenant_id` FK | OrgUnit selalu milik tenant valid (referential) | tenant boundary |
| `org_units.parent_id` FK (self) | parent selalu node valid | tidak menjamin same-tenant sendiri |
| `org_units_parent_same_tenant` (opsional trigger) | `parent.tenant_id = child.tenant_id` | invariant #1 §6.3; **diusulkan trigger** karena CHECK lintas-baris tak natural di SQL. Alternatif: enforce app-only di FASE 1, trigger di 1.2. |
| GIN(`org_units.path`) | performa query subtree | bukan integritas |
| `memberships.user_id/tenant_id/org_unit_id` FK | tidak ada membership menggantung | referential |
| `memberships` partial unique (deferred) | cegah duplicate membership aktif | ditunda sampai orgUnit terisi (backfill) |

**Nullable transitional → kapan boleh NOT NULL:**
- `memberships.org_unit_id` NULL saat awal (sebelum bootstrap OrgUnit tuntas). Boleh menjadi NOT NULL **hanya setelah**: (a) bootstrap OrgUnit RT selesai untuk semua tenant, (b) backfill membership mengisi `org_unit_id` untuk semua baris, (c) verifikasi 0 NULL. Itu perubahan di fase lanjutan (bukan FASE 1.2 additive pertama).
- `users.primary_org_unit_id` (jika ditambahkan) NULL sampai backfill; tetap nullable selama `User.tenantId` masih bridge.

---

## 10. Bootstrap Strategy (Tenant → OrgUnit)

**Tujuan:** setiap Tenant existing mendapat minimal satu OrgUnit root `type=RT` (deterministik).

- **Deterministik:** `org_unit.id` untuk RT root diturunkan deterministik dari tenant (mis. UUIDv5(namespace, tenantId) atau `id = tenant_id` prefix-mapped) sehingga **idempotent** (rerun tidak menggandakan). Keputusan: gunakan id deterministik berbasis tenantId aga restartable.
- **Mapping:** `Tenant` → `OrgUnit(type=RT, tenantId=tenant.id, parentId=NULL, name = tenant.name atau tenant.rtRwNumber, path=[orgUnitId], depth=0)`.
- **Idempotent/restartable:** `INSERT ... WHERE NOT EXISTS` / `ON CONFLICT (id) DO NOTHING`. Rerun aman.
- **Auditable:** tulis laporan hasil bootstrap (jumlah tenant, jumlah OrgUnit dibuat, skipped).
- **Anomali (audit dulu di 1.2 sebelum eksekusi):** duplicate RT identity (`rtRwNumber+region`), missing `rtRwNumber`, malformed region, tenant tanpa nama. Anomali **tidak** di-auto-fix; masuk report. Tenant `platform` (`00000000-...010`) diperlakukan khusus (kemungkinan `type=ORGANIZATION`, bukan RT).
- **Jangan** membuat hierarki RW/Cluster di FASE 1 (hanya root RT/ORGANIZATION); struktur berlapis menyusul.

---

## 11. Membership Backfill Strategy

**Mapping:** untuk setiap `User` non-deleted → `Membership(userId, tenantId=user.tenantId, orgUnitId = bootstrapped RT root of that tenant, role = map(user.role), status=ACTIVE)`.

**Legacy role → MembershipRole (usulan; konfirmasi di review):**
| UserRole (legacy) | MembershipRole (target) |
|-------------------|--------------------------|
| `Super_Admin` | `PLATFORM_ADMIN` (jika tenant=platform) / `TENANT_OWNER` (jika tenant RT biasa) — **butuh aturan**; default `TENANT_OWNER`, kecuali tenant platform → `PLATFORM_ADMIN` |
| `Ketua_RT` | `RT_ADMIN` |
| `Pengurus` | `ORG_ADMIN` (atau `RT_ADMIN` — konfirmasi) |
| `Warga` | `RESIDENT` |
| `Security_Guard` | `SECURITY` |

**Aturan:**
- **Default status:** `ACTIVE` untuk user existing yang aktif; user `status != active` → membership `SUSPENDED` (atau ikut status user — konfirmasi).
- **Org scope:** RT root tenant tersebut (hasil bootstrap §10).
- **Admin/non-resident:** `Super_Admin` di tenant platform → `PLATFORM_ADMIN`, orgUnit boleh NULL / ORGANIZATION root.
- **Users tanpa valid tenant / tenant hilang:** masuk report, **tidak** dibuatkan membership (jangan mengarang tenant).
- **Duplicate identity (email sama lintas tenant):** **BUKAN** bukti orang sama — **jangan auto-merge**. Setiap (user row) tetap membership sendiri; kandidat duplikat masuk **identity resolution report** (§12).
- **Idempotent:** membership id deterministik dari `(userId, tenantId, orgUnitId, role)` atau `ON CONFLICT DO NOTHING`.
- **Resident ≠ User:** backfill membership **hanya** dari `users`, **tidak** membuat User untuk Resident, dan **tidak** membuat membership untuk Resident yang bukan User.

`User.tenantId` **tetap ditulis & dibaca** — backfill hanya menambah data paralel.

---

## 12. Identity-Collision Handling

- **Email sama lintas tenant** = *candidate identity*, bukan proof. Tidak auto-merge.
- Rancang tabel/laporan `identity_resolution_report` (atau file audit) — **desain saja di 1.1**; pembuatan tabel ditunda kecuali disetujui. Isi: `candidate_user_ids[]`, `email`, `reason`, `status (PENDING/RESOLVED/REJECTED)`.
- Ambiguous → workflow manual, bukan bagian bootstrap otomatis.

---

## 13. Verification Queries / Gates (PASS/FAIL)

Dijalankan setelah setiap migration/backfill. **Gate FAIL → stop, jangan lanjut.**

**G1 — Tenant → OrgUnit (bootstrap):**
- `count(tenants)` vs `count(org_units WHERE type IN ('RT','ORGANIZATION') AND parent_id IS NULL)` → setiap tenant punya tepat 1 root. FAIL jika ada tenant tanpa root atau >1 root tak terduga.

**G2 — User → Membership (backfill):**
- `count(users WHERE deleted_at IS NULL AND tenant valid)` vs `count(memberships)` (untuk user tsb) → cocok. FAIL jika ada user eligible tanpa membership.

**G3 — Referential integrity (tidak boleh ada):**
- `memberships` → `user_id` tak ada di `users`;
- `memberships` → `tenant_id` tak ada di `tenants`;
- `memberships.org_unit_id` NOT NULL tapi tak ada di `org_units`;
- `org_units.parent_id` NOT NULL tapi tak ada di `org_units`;
- `org_units` dengan `parent.tenant_id <> tenant_id`;
- `path` tidak konsisten dengan rantai `parent_id`;
- duplicate membership tak terduga (per aturan uniqueness yang dipilih).

**G4 — Data preservation (count tidak berkurang):**
- `tenants, users, residents, households, iot_devices, alarm_devices, gates, cctv_cameras, door_sensor_configs` — count sebelum == sesudah (migration additive tidak menghapus apa pun).

**G5 — Compatibility bridge utuh:**
- `User.tenantId` tetap ada & terisi untuk semua user (tidak ada yang ter-null-kan).

---

## 14. Rollback Strategy

Karena FASE 1 **additive**, rollback tidak butuh restore full DB.

- **Migration rollback (DDL):** `DROP TABLE IF EXISTS memberships; DROP TABLE IF EXISTS org_units; DROP TYPE IF EXISTS "MembershipRole"/"MembershipStatus"/"OrgUnitType";` (urutan: memberships dulu karena FK ke org_units). Aman karena tabel baru & belum ada FK dari tabel lama yang menunjuk ke sini.
- **Backfill rollback (DML):** `DELETE FROM memberships;` dan `DELETE FROM org_units;` (data hasil backfill saja; tidak menyentuh tabel legacy). Karena id deterministik/idempotent, re-run bootstrap memulihkan.
- **Partial failure:** setiap backfill batch dalam transaksi; idempotent + restartable (`ON CONFLICT DO NOTHING`). Jika gagal di tengah, rerun aman.
- **Transaction boundary:** DDL create table + index dalam satu transaksi per objek; backfill per-tenant batch dalam transaksi.
- **Backup requirement:** sebelum menjalankan di DB berisi data → **backup/snapshot** + uji di **clone DB** dulu (Neon branch/dump).
- **Point-of-no-return:** **TIDAK ADA** di FASE 1 (tidak ada drop/rename/alter destruktif). Legacy tetap otoritatif.

---

## 15. Migration Sequencing

1. **M1 (additive DDL):** buat enum `OrgUnitType`, `MembershipStatus`, `MembershipRole`; buat tabel `org_units` + index (incl. GIN path); buat tabel `memberships` + index. Update `schema.prisma` selaras; regenerate client (di lingkungan mendukung). → Verifikasi G3 struktur, G4 preservation.
2. **M2 (bootstrap OrgUnit):** insert RT/ORGANIZATION root per tenant (idempotent). → Gate G1, G3, G4.
3. **M3 (backfill Membership):** insert membership dari users (idempotent). → Gate G2, G3, G4, G5.
4. (Opsional, fase lanjutan — BUKAN 1.2 pertama) tambah `users.primary_org_unit_id` nullable + backfill; **tidak** wajib.

Setiap langkah punya file SQL idempotent + verifikasi + rollback. **STOP gate** di antara langkah.

---

## 16. Application Compatibility Strategy

- **Selama FASE 1:** aplikasi **tetap** memakai `User.tenantId` + `AuthContext.tenantId` + `TenantScopedRepository` seperti sekarang. Tidak ada perubahan auth/JWT/middleware. `OrgUnit`/`Membership` hanya **data paralel** yang belum dibaca oleh jalur otorisasi.
- **Prisma Client:** penambahan model membuat client baru mengandung `orgUnit`/`membership` delegates; kode existing tidak terpengaruh (additive). tsc tetap 0 error karena tidak ada kode yang memakainya dulu.
- **Dual-write (ditunda):** menulis membership saat user baru dibuat/di-invite → **fase lanjutan** (setelah struktur stabil & disetujui), bukan 1.2 pertama.
- **No cutover** di FASE 1: jalur read/authorization tetap dari `tenantId`. Cutover ke Membership adalah fase terpisah dengan approval.

---

## 17. Risks

| Risk | Dampak | Mitigasi |
|------|--------|----------|
| Prisma engine gagal di Windows | migration/generate lokal gagal | jalankan via `run-migration.mjs` (pg) + generate di CI/Docker |
| Data legacy kotor (missing rtRwNumber, dup email, orphan) | bootstrap/backfill salah | audit anomali dulu (1.2), report-only, tidak auto-fix/merge |
| `orgUnitId` nullable → unique membership lemah | duplicate membership | partial unique / tunda unique sampai backfill; verifikasi G3 |
| Invariant same-tenant parent tak ada CHECK natif | cross-tenant org unit | enforce di service; trigger opsional; verifikasi G3 |
| `path` tipe (uuid[] vs text[]) | mismatch join/tooling | pakai `TEXT[]` konsisten id existing (§6.2) |
| Role mapping legacy→target ambigu (Super_Admin, Pengurus) | membership role salah | konfirmasi mapping di review sebelum backfill |
| Regenerate Prisma client mengubah tipe | tsc regression | jalankan tsc+build regression setelah M1; ceiling lint=5 |

---

## 18. Explicit Destructive Operations — DEFERRED (bukan FASE 1)

Semua ini **TIDAK** dilakukan di FASE 1 (tercatat untuk fase mendatang, butuh approval terpisah):
- Drop/ubah `Tenant.rtRwNumber/region/address/contactPerson` (pindah ke OrgUnit).
- Drop `User.tenantId` (cutover penuh ke Membership).
- Menjadikan `memberships.org_unit_id` NOT NULL.
- Menambah `UNIQUE(tenant_id, nik_hmac)` / migrasi enkripsi NIK.
- Refresh-token table + perubahan JWT (hanya identity/context).
- RLS / tenant isolation di DB.
- IoT ownership redesign (FK per level + CHECK num_nonnulls=1).
- Memindahkan authorization ke Membership (server-side authoritative resolution).

---

## 19. Proposed Scope FASE 1.2

Setelah plan ini di-approve, FASE 1.2 (implementasi additive, dengan gate + rollback + regression, di clone DB + backup):
1. **Data anomaly audit (read-only)** atas data existing: duplicate RT identity, missing rtRwNumber, malformed region, orphan household/resident, duplicate email lintas tenant. Deliverable: report. (Bisa jadi 1.2a sebelum DDL.)
2. **M1** — additive DDL (`OrgUnitType`/`MembershipStatus`/`MembershipRole`, `org_units`, `memberships`) + update `schema.prisma` + regenerate client + tsc/lint/test/build regression (ceiling lint=5).
3. **M2** — bootstrap OrgUnit root per tenant (idempotent) + Gate G1/G3/G4.
4. **M3** — backfill Membership dari users (idempotent) + Gate G2/G3/G4/G5.
5. Unit test untuk invariant baru (path/depth builder, bootstrap idempotency, backfill mapping) — tanpa menyentuh jalur auth.

**Belum termasuk 1.2:** dual-write, cutover auth, `primary_org_unit_id`, trigger same-tenant (bisa masuk 1.2 sebagai hardening bila disetujui).

---

## Keputusan yang butuh konfirmasi Anda sebelum FASE 1.2

1. **`MembershipRole`**: pakai enum target baru (`PLATFORM_ADMIN...RESIDENT`) sekarang, atau reuse `UserRole` legacy dulu lalu map belakangan? (§7.1)
2. **Mapping role** `Super_Admin`/`Pengurus` (§11) — konfirmasi target.
3. **`path` = `TEXT[]`** (konsisten id TEXT existing) alih-alih `uuid[]` native (§6.2) — konfirmasi diterima sebagai realisasi keputusan "uuid[] materialized path".
4. **Membership uniqueness**: partial unique `WHERE org_unit_id IS NOT NULL` vs tunda total (§7.2/§9).
5. **Same-tenant parent enforcement**: app-only di 1.2, atau sertakan trigger DB (§9).
6. **Anomaly audit** dijalankan sebagai langkah 1.2a read-only sebelum DDL — konfirmasi.

---

**STOP — FASE 1.1 (design) selesai. Menunggu review Anda sebelum approval FASE 1.2. Tidak ada migration/schema/DB/app-code yang diubah.**
