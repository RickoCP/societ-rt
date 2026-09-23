# FASE 1.2a — Pre-Migration Anomaly Audit

> **Status:** READ-ONLY audit. Tidak ada DDL, migration, `db push`, perubahan
> schema, application code, atau mutasi data. Deliverable tunggal; setelah ini
> **STOP** menunggu review sebelum M1.
>
> **Metode:** SELECT-only via `scripts/audit-phase1.mjs` (koneksi `pg`, sesi
> `SET default_transaction_read_only = on`). NIK/secret **tidak pernah**
> ditampilkan plaintext — hanya count / distribusi panjang / masked.

---

## 1. Database / Environment yang Diaudit

| Item | Nilai |
|------|-------|
| Database | `neondb` (Neon, PostgreSQL 17.11, aarch64-linux) |
| DB user | `neondb_owner` |
| Koneksi | via `DATABASE_URL` (.env) — **credential tidak ditampilkan** |
| Transaksi | `default_transaction_read_only = on` (dijamin tidak ada write) |

Ini adalah database development/shared yang sama dengan yang dipakai aplikasi
saat ini (Neon). Karena audit read-only + transaction read-only, inspeksi aman.

## 2. Timestamp / Snapshot Context

- `audited_at`: **2026-09-23T05:36:28Z** (UTC, dari `now()` server).
- Snapshot bukan dari backup/clone; dijalankan langsung terhadap DB dev dengan
  sesi read-only. Untuk M1/M2/M3 nanti, jalankan terhadap **clone + backup**
  (lihat §16 blockers & rencana).

## 3. Row Counts (core tables)

| Tabel | Rows |
|-------|------|
| tenants | 3 |
| users | 21 (not-deleted: 21) |
| residents | 54 (not-deleted: 54) |
| households | 19 |
| subscription_plans | 3 |

Skala sangat kecil (3 tenant) → M2/M3 berisiko rendah, mudah diverifikasi
manual.

## 4. Tenant Anomalies

| Cek | Hasil |
|-----|-------|
| Total tenant | 3 |
| `rt_rw_number` null/blank | **0** |
| `region` null/blank | **0** |
| `name` null/blank | **0** |
| Duplicate normalized `(rt_rw_number, region)` | **0** (tidak ada grup) |
| Status distribution | `active`: 3 (tidak ada suspended) |
| `siren_device_id` terisi | **0 dari 3** (semua tenant tanpa siren device id) |

Tenant teridentifikasi (dari langkah lain): `…010` (subdomain `platform`),
`…011`, `…012`. **Nol anomali tenant.**

> Catatan `siren_device_id`: ketiga tenant kosong. Ini konsisten dengan temuan
> FASE 0/1.1 bahwa siren saat ini di-resolve via `ALARM_DEVICE_ID` env fallback,
> bukan `Tenant.sirenDeviceId`. Tidak berdampak pada M1–M3 (IoT tidak disentuh).

## 5. User / Identity Anomalies

| Cek | Hasil |
|-----|-------|
| Total user | 21 |
| User orphan (tenant_id tak ada di tenants) | **0** |
| Email null/blank | **0** |
| Duplicate normalized email **within** tenant | **0** |
| Duplicate normalized email **cross** tenant | **0** |
| Status distribution | `active`: 21 (tidak ada locked/inactive) |

**Nol anomali identity.** Tidak ada duplicate email lintas tenant → tidak ada
kasus identity-collision yang perlu resolution workflow pada data saat ini
(workflow tetap didesain untuk masa depan, tapi **tidak** terpicu sekarang).

## 6. Role Distribution + Legacy → Target Role Analysis

Distribusi `users.role` (legacy `UserRole`):

| Legacy Role | Count | Target Candidate (`MembershipRole`) | Confidence | Manual Review? |
|-------------|-------|--------------------------------------|-----------|----------------|
| `Warga` | 6 | `RESIDENT` | High | No |
| `Pengurus` | 5 | `RT_ADMIN` (kandidat, per Decision #2) | Medium | **Ya** — validasi apakah semua Pengurus setara RT_ADMIN atau ada yang ORG_ADMIN |
| `Security_Guard` | 4 | `SECURITY` | High | No |
| `Ketua_RT` | 3 | `RT_ADMIN` | High | No |
| `Super_Admin` | 3 | `PLATFORM_ADMIN` (lihat §7) | High (platform) | **Ya** — representasi org scope (NULL) |

Catatan: `Ketua_RT` dan `Pengurus` keduanya kandidat `RT_ADMIN`. Jika perlu
membedakan (Ketua = pemimpin, Pengurus = staf), pertimbangkan `Pengurus →
ORG_ADMIN`. **Butuh keputusan Anda** (Decision #2 caveat). Tidak ada role legacy
di luar 5 nilai enum resmi (tidak ada nilai tak terduga).

## 7. Super_Admin Semantics — Evidence

Query `super_admin_by_tenant`:

| tenant_id | subdomain | is_platform_tenant | super_admin_count |
|-----------|-----------|--------------------|-------------------|
| `00000000-0000-0000-0000-000000000010` | `platform` | **true** | 3 |

**Bukti kuat:** ketiga `Super_Admin` berada **seluruhnya di tenant platform**
(`…010`, subdomain `platform`). **Tidak ada** Super_Admin di tenant RT (`…011`,
`…012`). Ini mengonfirmasi `Super_Admin` = **platform-level administrator**,
bukan tenant admin dengan penamaan legacy.

**Implikasi untuk M3 (Decision #2):**
- **JANGAN** membuat fake RT membership untuk Super_Admin.
- Representasi yang benar: `PLATFORM_ADMIN` dengan **org scope platform-level**,
  bukan RT OrgUnit. Karena model Membership saat ini `User → Tenant + OrgUnit`,
  ada dua opsi yang perlu **keputusan Anda** sebelum M3:
  - (a) Membership platform: `tenantId = platform tenant (…010)`, `orgUnitId =
    NULL` (butuh dukungan tenant-level membership + partial-unique NULL — Decision #4), atau
  - (b) Membership platform: `orgUnitId = ORGANIZATION root` milik tenant
    platform (bootstrap platform sebagai `type=ORGANIZATION`, bukan RT).
- Sesuai instruksi: **STOP sebelum M3** untuk mengusulkan representasi platform
  admin yang benar (ini bagian dari review M1→M3). Tidak diputuskan sepihak.

Distribusi `Pengurus` per tenant (konteks): `…012`: 2, `…011`: 2, `…010`
(platform): 1.

## 8. Resident Anomalies

| Cek | Hasil |
|-----|-------|
| Total resident | 54 |
| Orphan tenant | **0** |
| Orphan household | **0** |
| NIK null/blank | **0** |
| NIK length distribution | semua **16** digit (54/54) — sesuai format NIK Indonesia |
| Duplicate NIK **within** tenant | **0** grup kolisi |
| Duplicate NIK **cross** tenant | **0** NIK dibagi >1 tenant |

**Nol anomali resident.** NIK **tidak pernah** ditampilkan plaintext — hanya
COUNT + distribusi panjang. Tidak ada merge dilakukan.

**Resident ↔ User:** kolom tabel `residents` = `id, tenant_id, household_id,
name, nik, date_of_birth, gender, phone, status, categories,
emergency_contact_name/phone/relationship, created_at, updated_at, deleted_at`.
**Tidak ada** FK/kolom ke `users`. Konfirmasi final: **Resident ≠ User**;
Membership akan menempel ke User saja.

## 9. Household Anomalies

| Cek | Hasil |
|-----|-------|
| Total household | 19 |
| Orphan tenant | **0** |
| Duplicate household_number within tenant | **0** grup kolisi |
| Resident → missing household refs | **0** |

**Nol anomali household.**

## 10. Duplicate / Collision Counts (ringkas)

| Domain | Collision |
|--------|-----------|
| Email within tenant | 0 |
| Email cross tenant | 0 |
| NIK within tenant | 0 |
| NIK cross tenant | 0 |
| Household number within tenant | 0 |
| Tenant (rtRw, region) normalized | 0 |

Semua nol. Tidak ada collision yang memerlukan resolution sebelum M2/M3.

## 11. Orphan / Reference Integrity

| Referensi | Orphan |
|-----------|--------|
| users → tenants | 0 |
| residents → tenants | 0 |
| residents → households | 0 |
| households → tenants | 0 |

Integritas referensial existing bersih. Tidak ada FK menggantung yang akan
menyulitkan backfill Membership/OrgUnit.

## 12. IoT Ownership Inventory (read-only)

| Tabel | Rows | Catatan |
|-------|------|---------|
| `iot_devices` | 6 | semua punya `tenant_id` + `household_id` (household-scoped) |
| `alarm_devices` | 1 | tenant-scoped |
| `door_sensor_configs` | 6 | 5 (enabled + device terpasang), 1 (disabled + device terpasang) |
| `device_events` | 0 | kosong |
| `gates` | **TABEL TIDAK ADA** | ada di `schema.prisma`, **tidak ada** di DB (schema drift) |
| `cctv_cameras` | **TABEL TIDAK ADA** | idem |
| `homes` | **TABEL TIDAK ADA** | idem |
| `Tenant.sirenDeviceId` | 0/3 terisi | siren via env fallback |

**Blast radius IoT ownership migration (masa depan, BUKAN FASE 1):** device
tersebar di 2 pola ownership (household-scoped: iot_devices/door_sensor_configs;
tenant-scoped: alarm_devices). Volume kecil. **Tidak** di-redesign di FASE 1.2.

> **Schema drift penting:** `gates`, `cctv_cameras`, `homes` terdefinisi di
> `schema.prisma` tetapi **belum ada** di DB dev. Ini bukti bahwa
> `schema.prisma` dan DB fisik **tidak sepenuhnya sinkron** — kemungkinan
> beberapa migration SQL manual belum dijalankan di DB ini. Ini **tidak
> memblokir** M1–M3 (OrgUnit/Membership independen), tetapi harus dicatat
> sebagai risiko saat menjalankan `prisma generate`/migrate additive (lihat §16).

## 13. Membership Tenant-Level vs Org-Level Semantics — Recommendation

Berdasar data:
- **Org-level membership** cocok untuk mayoritas: Warga/Pengurus/Ketua_RT/
  Security_Guard di tenant RT (`…011`, `…012`) → membership dengan `orgUnitId =
  RT root` tenant tersebut.
- **Tenant-level membership (orgUnitId NULL)** **diperlukan** untuk minimal 1
  kasus nyata: **3 Super_Admin di tenant platform**. Mereka platform-level, tidak
  natural dipetakan ke RT OrgUnit.

**Rekomendasi:**
- Dukung **kedua** bentuk membership: org-scoped (`orgUnitId NOT NULL`) dan
  tenant-scoped (`orgUnitId NULL`, untuk platform/tenant-owner).
- Uniqueness (Decision #4): terapkan **dua partial unique** —
  `UNIQUE(user_id, tenant_id, org_unit_id) WHERE org_unit_id IS NOT NULL` dan
  `UNIQUE(user_id, tenant_id) WHERE org_unit_id IS NULL`. **Namun** karena
  Decision #4 meminta konfirmasi semantics dulu, ini **diusulkan** dan **belum
  dieksekusi** — final di review M1.
- Platform admin representation (§7) menentukan apakah orgUnit NULL vs
  ORGANIZATION root — **butuh keputusan Anda**.

## 14. Constraints yang AMAN dibuat di M1

Berdasar data bersih (nol anomali), yang aman di M1 additive DDL:
1. Enum `OrgUnitType`, `MembershipStatus`, `MembershipRole` (idempotent create).
2. Tabel `org_units` (id TEXT PK, tenant_id FK→tenants, parent_id self-FK
   nullable, type, name, path TEXT[], depth, timestamps).
3. **Composite candidate key** `org_units (id, tenant_id)` — prasyarat untuk
   composite FK same-tenant (Decision #5).
4. Index `org_units`: `(tenant_id)`, `(parent_id)`, GIN(`path`).
5. Tabel `memberships` (id TEXT PK, user_id FK→users, tenant_id FK→tenants,
   org_unit_id FK→org_units nullable, role, status, timestamps, revoked_at).
6. Index `memberships`: `(user_id)`, `(tenant_id)`, `(org_unit_id)`.
7. **Composite FK same-tenant (Decision #5, declarative preferred):** child
   `org_units (parent_id, tenant_id)` → parent `org_units (id, tenant_id)`.
   Ini feasible karena kita menambah candidate key di poin 3. **Diusulkan
   dipakai daripada trigger.**

Semua di atas **tidak** memodifikasi tabel/kolom existing → nol risiko data
loss (verifikasi G4 akan tetap dijalankan).

## 15. Constraints yang HARUS DITUNDA

1. **Membership uniqueness final** (partial unique NULL vs NOT NULL) — tunggu
   konfirmasi semantics tenant-level (Decision #4 + §13). Di M1 boleh pasang
   partial unique `WHERE org_unit_id IS NOT NULL` **hanya jika** disetujui;
   yang `WHERE org_unit_id IS NULL` menunggu keputusan platform-admin repr.
2. **`memberships.org_unit_id` NOT NULL** — tetap nullable; jadi NOT NULL hanya
   setelah backfill mengisi + verifikasi 0 NULL (fase lanjutan, bukan M1).
3. **Cycle-prevention / path-derivation / subtree-move via trigger** — jangan di
   M1; hierarchy mutation lewat domain service nanti. M1 hanya buat root
   (bootstrap), tidak ada mutasi berlapis.
4. **Same-tenant enforcement via trigger** — hanya jika composite FK (§14.7)
   ternyata tidak feasible; default: pakai composite FK declarative.
5. Apa pun terkait NIK unique/enkripsi, refresh-token, RLS, IoT ownership —
   di luar FASE 1.

## 16. Blockers untuk M1 / M2 / M3

| # | Blocker | Untuk | Tindakan |
|---|---------|-------|----------|
| B1 | **Platform-admin representation belum diputuskan** (§7, §13) | **M3** | Butuh keputusan Anda: orgUnit NULL (tenant-level) vs ORGANIZATION root platform. STOP sebelum M3. |
| B2 | **Role mapping Pengurus** (RT_ADMIN vs ORG_ADMIN) & Ketua vs Pengurus (§6) | **M3** | Konfirmasi mapping final. |
| B3 | **Membership uniqueness semantics** (Decision #4) belum final | M1 (jika mau pasang) / M3 | Konfirmasi; boleh tunda ke setelah backfill. |
| B4 | **Schema drift** (gates/cctv_cameras/homes ada di prisma, tak ada di DB) (§12) | M1 (saat `prisma generate`/migrate) | Bukan blocker OrgUnit/Membership, tapi hati-hati: jangan biarkan `prisma migrate` mencoba drop/create tabel lain. Gunakan SQL additive terisolasi via runner, bukan `prisma migrate dev` yang membandingkan seluruh schema. |
| B5 | **Backup + clone** belum disiapkan | M1/M2/M3 eksekusi | Sebelum menjalankan DDL/DML di DB berisi data, buat Neon branch/dump + uji di clone. |

Tidak ada blocker dari **kualitas data** (semua bersih). Blocker utama = **keputusan
desain** (B1, B2, B3) + **operasional** (B4, B5).

## 17. Verification Queries yang Digunakan

Semua di `scripts/audit-phase1.mjs` (SELECT-only). Ringkas:
- `row_counts` (UNION COUNT core tables).
- Tenant: null/blank rtRw/region/name; dup normalized `(rtRw, region)`; status
  dist; siren presence (boolean, bukan device id).
- User: orphan tenant (LEFT JOIN), null email, dup email within/cross tenant
  (GROUP BY lower(btrim(email))), role dist, status dist.
- Super_Admin: GROUP BY tenant + subdomain + `is_platform_tenant`; Pengurus per
  tenant.
- Resident: orphan tenant/household, null NIK, **NIK length dist** (bukan nilai),
  dup NIK within/cross tenant (COUNT grup saja).
- Household: orphan tenant, dup number within tenant, resident→missing household.
- `information_schema.columns` untuk kolom `residents` (cek relasi user).
- IoT: COUNT per tabel + `to_regclass` existence guard; ownership presence
  (boolean has_tenant/has_household); door binding.
- `to_regclass` untuk `org_units`/`memberships` (konfirmasi belum ada).

## 18. Confirmation — Read-Only

- Sesi menjalankan `SET default_transaction_read_only = on` sebelum query apa pun
  → server menolak write jika ada.
- Hanya `SELECT` + `to_regclass` (metadata). **Tidak ada** INSERT/UPDATE/DELETE/
  DDL.
- **Tidak ada** perubahan `schema.prisma`, migration, application code, atau
  Prisma Client generate.
- NIK, password, token, encryption key, secret, dan credential **tidak**
  ditampilkan; DATABASE_URL tidak dicetak; NIK hanya diukur via COUNT + panjang.
- Satu file baru dibuat: `scripts/audit-phase1.mjs` (tooling audit, **bukan**
  runtime aplikasi; tidak diimpor oleh `src/`, tidak masuk bundle Next.js).

---

## Ringkasan Eksekutif

Data dev **sangat bersih**: nol anomali di tenant/user/resident/household, nol
duplicate email/NIK/household, integritas referensial utuh. Skala kecil (3
tenant, 21 user, 54 resident) → M2/M3 low-risk.

**Dua temuan yang butuh keputusan Anda sebelum lanjut:**
1. **Platform-admin representation** — 3 Super_Admin murni platform-level (tenant
   platform), tidak boleh dipaksa ke RT OrgUnit. Perlu keputusan orgUnit NULL vs
   ORGANIZATION root (B1).
2. **Role mapping** Pengurus (RT_ADMIN vs ORG_ADMIN) (B2).

**Satu temuan operasional:** schema drift (gates/cctv_cameras/homes belum ada di
DB) → gunakan SQL additive via runner, hindari `prisma migrate dev` full-diff
(B4). Serta siapkan backup/clone sebelum eksekusi (B5).

**STOP — FASE 1.2a selesai. Menunggu review data aktual + keputusan B1/B2 (dan
B3) sebelum Anda mengizinkan M1. Tidak ada M1/M2/M3, migration, schema, RLS, NIK,
refresh-token, atau IoT redesign yang dijalankan.**
