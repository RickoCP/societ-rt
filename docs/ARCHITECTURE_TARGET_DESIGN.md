# SocieT-RT — Target Architecture Design (FINAL)

> **Status dokumen:** FINAL sebagai *target design* untuk menjadi dasar implementasi.
> **PENTING:** "Final" di sini berarti desain target yang disepakati sebagai acuan. **Ini BUKAN izin untuk mengubah database/schema existing.** Perubahan kode/schema/migration hanya dilakukan setelah instruksi eksplisit per-fase (dimulai dari FASE 0 — Security).
>
> **Ruang lingkup:** transformasi SocieT-RT menjadi SaaS multi-tenant komersial dengan model **Tenant ≠ RT**, membership, entitlement, dan IoT provider-agnostic.
>
> **Prinsip pemandu:** correctness & data integrity > kecepatan; commercial-ready MVP tanpa over-engineering; patuh UU PDP; UUID sebagai identifier utama (bukan NIK).

---

## 0. Ringkasan Keputusan yang Terkunci

| # | Keputusan | Status | Inti |
|---|-----------|--------|------|
| 1 | OrgUnit path | APPROVE | `parent_id + path uuid[] + depth`, `parent_id` kanonik, invariant ketat |
| 2 | Legacy identity | APPROVE | Staging + manual resolution, tanpa auto-merge by email |
| 3 | Session/revocation | APPROVE w/ REVISION | JWT hanya identity/context; authorization authoritative server-side |
| 4 | Role set MVP | APPROVE w/ NOTE | Role→Permission abstraction; tiga sumbu terpisah |
| 5 | IoT saat SUSPENDED | APPROVE w/ REVISION | Safety-critical tetap jalan; policy matrix status×capability |
| 6 | NIK key management | APPROVE w/ REVISION | AES-256-GCM + HMAC + KeyProvider; **NIK uniqueness = OPEN** |

**Sumbu otorisasi (tiga dimensi terpisah — tidak boleh dicampur):**
- **Role / Permission** = boleh melakukan APA
- **Org Scope** = terhadap UNIT mana
- **Entitlement / Plan** = FITUR apa yang dimiliki tenant

---

## 1. Model Hierarki: Tenant ≠ RT

### 1.1 Prinsip
Hierarki organisasi **tidak** disamakan dengan tenancy. Asumsi `tenant_id == rt_id` **dilarang** menyebar ke codebase.

```
Tenant (unit komersial / langganan)
  └── OrgUnit (self-referencing tree)
        type: ORGANIZATION | CLUSTER | RW | RT
        └── Household
              └── Resident
```

- **Tenant** = batas komersial + isolasi data + security boundary.
- **OrgUnit** = struktur organisasi intra-tenant (bisa Organization→Cluster→RW→RT).
- Satu Tenant dapat memiliki banyak OrgUnit; RT hanyalah salah satu `type` OrgUnit.

### 1.2 OrgUnit (Keputusan #1 — APPROVE)

Representasi: **materialized path** dengan `parent_id` sebagai relasi kanonik.

Kolom inti:
- `id uuid PK`
- `tenant_id uuid FK` — **security boundary**
- `parent_id uuid FK NULL` — **relasi kanonik (source of truth hierarki)**
- `type enum(ORGANIZATION, CLUSTER, RW, RT)`
- `path uuid[]` — optimasi query subtree (bukan source of truth)
- `depth int`
- atribut display (name, code, dll.)

**Invariant (WAJIB ditegakkan):**
1. `parent.tenant_id == child.tenant_id` — child tidak boleh lintas tenant.
2. **Tidak boleh cycle** dalam pohon.
3. `depth` dan `path` **tidak boleh dimodifikasi sembarangan** oleh application code biasa.
4. **Move subtree** hanya melalui **satu domain/service operation** dalam **satu transaksi**; operasi ini yang meng-update `path` + `depth` seluruh descendant (recursive CTE, splice prefix).
5. Validasi di database + application harus mencegah `path` invalid (mis. `path` harus konsisten dengan rantai `parent_id`).
6. `tenant_id` tetap security boundary — **bukan** `path`.

**Query:**
- Descendant: `WHERE :ancestorId = ANY(path)`
- Children langsung: `WHERE parent_id = :id`
- Ancestor: unnest `path`

**Index:** GIN pada `path`; b-tree pada `parent_id`; b-tree pada `tenant_id`.

**Alasan memilih `uuid[]` atas `ltree`:** hierarki dangkal (≤5 level); Prisma mendukung `uuid[]` native (`String[] @db.Uuid`) sementara `ltree` memaksa `Unsupported()` + raw query + encoding UUID (label ltree tidak boleh mengandung `-`). Jalur upgrade ke `ltree` tetap terbuka karena `path` sudah materialized.

---

## 2. Membership & Identity

### 2.1 Membership menggantikan `User.tenantId` 1:1
Model lama `User.tenantId` (1:1) diganti tabel **`membership`** agar mendukung multi-tenant per user + active-context switcher.

`membership`:
- `id uuid PK`
- `user_id uuid FK`
- `tenant_id uuid FK`
- `org_unit_id uuid FK` — scope role berlaku pada unit ini (dan descendant-nya sesuai kebijakan)
- `role enum` (lihat §4)
- `status enum(ACTIVE, INVITED, SUSPENDED, REVOKED)`
- audit (`created_at`, `updated_at`, `revoked_at`)

Satu user → banyak membership. **Active context** (tenant + orgUnit aktif) disimpan di sesi (lihat §3).

### 2.2 Legacy Identity Resolution (Keputusan #2 — APPROVE)
- **Tidak pernah auto-merge** User legacy hanya karena email sama.
- Pipeline: **normalization → candidate matching → resolution report → manual resolution** untuk record ambigu.
- `legacy_email_unresolved` = field **transitional/migrasi**. Jangan jadikan konsep domain permanen; boleh di-drop setelah migrasi tuntas & terverifikasi.
- `identity_resolution_report` boleh dipertahankan sebagai **audit** bila bermanfaat.

---

## 3. Session & Authorization (Keputusan #3 — APPROVE WITH REVISION)

### 3.1 Prinsip inti
**JWT BUKAN source of truth authorization.** JWT hanya membawa **identity/context**. Role, membership status, org scope, dan permission sensitif **divalidasi server-side dari authoritative state**. Authorization/revocation **tidak** menunggu JWT expiry.

### 3.2 Access token (JWT, pendek)
- Umur: **10–15 menit**.
- Payload **hanya**:
  - `sub` (userId)
  - `activeTenantId`
  - `activeOrgUnitId`
  - `tokenVersion`
  - `iat`, `exp`
- **Tidak** membawa `roles`/permission sebagai authority.
- Ditandatangani dengan secret kuat (hasil rotasi FASE 0; menggantikan `socieTRT-rcp`).

### 3.3 Alur otorisasi authoritative (per request sensitif)
```
JWT identity (sub, activeTenantId, activeOrgUnitId, tokenVersion)
  → resolve active membership (authoritative)
  → validate tenant (aktif, tidak CLOSED)
  → validate membership status (ACTIVE, bukan REVOKED/SUSPENDED)
  → resolve role → permission
  → validate org scope (orgUnit dalam wewenang membership)
  → validate entitlement (fitur aktif untuk tenant)
  → authorize / deny
```
- Jika membership `REVOKED`, role berubah, atau scope berubah → efek **segera**, tidak bergantung pada klaim lama.
- **Boleh** memakai cache/Redis untuk authorization context demi performa, **dengan invalidation yang benar** saat membership/role/scope/entitlement berubah (bukan sekadar TTL). Tidak setiap endpoint harus banyak query DB.

### 3.4 Refresh token (opaque, revocable)
- **Opaque random 256-bit** (bukan JWT), umur panjang (mis. 30 hari), dikirim sebagai cookie **HttpOnly + Secure + SameSite**.
- Tabel `refresh_token`:
  - `id uuid PK`
  - `user_id uuid FK`
  - `token_hash` — **SHA-256 dari token mentah** (simpan hash, bukan token)
  - `family_id uuid` — untuk rotation & reuse detection
  - `issued_at`, `expires_at`
  - `revoked_at NULL`, `replaced_by NULL`
  - `user_agent`, `ip` (audit)
- **Rotation:** tiap refresh → terbitkan token baru dalam `family_id` sama; tandai lama `revoked_at` + `replaced_by`.
- **Reuse detection:** token ber-`revoked_at` dipakai lagi → indikasi pencurian → revoke **seluruh `family_id`**.
- **Logout:** revoke refresh aktif; access token mati ≤15 menit.
- **Logout-all-devices:** bump `User.tokenVersion` + revoke semua refresh milik user.

### 3.5 `tokenVersion`
- Kolom `token_version int NOT NULL DEFAULT 0` pada `user`.
- Alat force-invalidation murah: access token dengan `tokenVersion` lama langsung ditolak.

---

## 4. Role & Permission (Keputusan #4 — APPROVE WITH NOTE)

### 4.1 Role set MVP
`PLATFORM_ADMIN`, `TENANT_OWNER`, `ORG_ADMIN`, `RT_ADMIN`, `SECURITY`, `RESIDENT`.

### 4.2 Abstraksi Role → Permission
- **Dilarang** menyebar `if role == RT_ADMIN` di ratusan route.
- Otorisasi berbasis **permission**, dengan mapping **Role → Permissions**.
- Mapping boleh **statis/config-based** untuk MVP (belum perlu UI manajemen permission kompleks).
- Menambah/mengubah permission tidak boleh menuntut rewrite seluruh route.

### 4.3 Tiga sumbu terpisah
- **Role/Permission** (boleh apa) — dari `membership.role` → permission set.
- **Org Scope** (di unit mana) — dari `membership.org_unit_id` + subtree.
- **Entitlement** (fitur tenant) — dari plan/subscription tenant (§6).

Ketiganya dievaluasi terpisah lalu digabung di titik authorize.

---

## 5. IoT — Provider-agnostic & Safety-aware (Keputusan #5 — APPROVE WITH REVISION)

### 5.1 Abstraksi provider
- Interface `IoTProvider` menyembunyikan Tuya (dan provider lain).
- Tuya Cloud Project terpusat untuk MVP; BYO-credentials untuk enterprise di masa depan.
- Jangan mengikat arsitektur IoT ke satu message bus tertentu.

### 5.2 Klasifikasi command (WAJIB)
- **SAFETY / SECURITY CRITICAL** — panic alarm, emergency siren, security alert, safety shutdown (bila ada actuator).
- **NON-CRITICAL / NORMAL** — automation convenience, command administratif non-emergency, fitur IoT premium tertentu.

### 5.3 Prinsip saat tenant SUSPENDED
- Telemetry/event **ingestion tetap jalan** (jangan buang event).
- **Audit tetap jalan.**
- **Emergency/safety-critical flow TETAP boleh berjalan.**
- Command non-critical **dapat diblokir** berdasarkan entitlement/subscription.
- Admin diarahkan ke **billing/recovery flow**.
- **Keterlambatan bayar tidak boleh** mematikan panic button / sistem keamanan warga tanpa kebijakan eksplisit.

### 5.4 Policy Matrix (status subscription × capability) — disepakati sebelum implementasi

Capability: `READ`, `INGEST`, `EMERGENCY_COMMAND`, `NORMAL_COMMAND`, `NOTIFICATION`, `ADMIN_ACCESS`.

| Status \ Capability | READ | INGEST | EMERGENCY_COMMAND | NORMAL_COMMAND | NOTIFICATION | ADMIN_ACCESS |
|---|---|---|---|---|---|---|
| **TRIAL** | ✅ | ✅ | ✅ | ✅ (batas kuota) | ✅ | ✅ |
| **ACTIVE** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **PAST_DUE** | ✅ | ✅ | ✅ | ✅ (grace) | ✅ | ✅ (peringatan billing) |
| **SUSPENDED** | ✅ | ✅ | ✅ | ❌ | ✅ (emergency/billing saja) | ⚠️ billing/recovery saja |
| **CLOSED** | ⚠️ (retensi/audit) | ⚠️ (sesuai retensi) | ❌ | ❌ | ❌ | ⚠️ export/offboarding saja |

> Catatan: `PAST_DUE` bersifat opsional (dipakai bila ada tahap grace sebelum `SUSPENDED`). Nilai kuota/grace final ditetapkan saat implementasi FASE IoT/Entitlement. Matriks ini adalah kontrak kebijakan, bukan nilai hardcode tersebar.

### 5.5 Device ownership
- FK nullable per level + `CHECK (num_nonnulls(...) = 1)` untuk menjamin tepat satu pemilik (referential integrity kuat, bukan polymorphic tanpa FK).

---

## 6. Entitlement / Subscription

- **Entitlement ≠ RBAC ≠ Org-scope.** Jangan campur `Role=ADMIN` dengan `Plan=PRO`.
- Plan MVP: Basic / Standard / Pro + add-on (mis. IoT).
- Entitlement dievaluasi per **tenant**, menggerbangi fitur (termasuk kelas command IoT non-critical pada §5).
- Subscription status: `TRIAL`, `ACTIVE`, `PAST_DUE` (opsional), `SUSPENDED`, `CLOSED`.

---

## 7. PII & NIK Key Management (Keputusan #6 — APPROVE WITH REVISION)

### 7.1 Kriptografi
- **AES-256-GCM** (authenticated encryption). Simpan `iv(96-bit acak) || ciphertext || authTag`.
- **HMAC-SHA256** atas NIK ternormalisasi → `nik_hmac` untuk equality lookup (ciphertext GCM non-deterministik tidak bisa di-query kesetaraan).
- **Dua key terpisah:** `NIK_ENCRYPTION_KEY` (AES-GCM) dan `NIK_HMAC_KEY` (HMAC). Tidak boleh sama.

### 7.2 KeyProvider & penyimpanan key
- Interface **`KeyProvider`** menyembunyikan sumber key.
- **Key tidak pernah** berada di DB, repository, atau client (`NEXT_PUBLIC_*`).
- MVP: env/secret injection boleh sebagai backend `KeyProvider`, **tetapi production secret tidak boleh sekadar `.env` file di server/repo** — gunakan deployment secret mechanism/secret store environment hosting.
- Migrasi ke KMS/managed secret nanti **tidak mengubah** domain/application code (di balik `KeyProvider`).

### 7.3 Versioning & rotation
- Kolom `nik_key_version smallint` per baris.
- `KeyProvider` memetakan versi → key (`..._V1`, `..._V2`, ...).
- Rotation bertahap: versi baru untuk tulis baru; job backfill dekripsi (key lama) → enkripsi (key baru) → recompute HMAC bila `NIK_HMAC_KEY` dirotasi → naikkan `nik_key_version`.
- **V1 + V2 coexistence** sampai backfill selesai; `KeyProvider` memuat semua versi aktif.

### 7.4 Backfill NIK existing
- NIK saat ini plaintext. Prosedur (dalam migrasi terkontrol + backup):
  baca plaintext → hitung `nik_hmac` → enkripsi GCM → tulis `nik_ciphertext`, `nik_hmac`, `nik_key_version` → **verifikasi** → drop kolom plaintext setelah terverifikasi.

### 7.5 Normalisasi, masking, akses
- **Canonical normalization** NIK deterministik (trim, digit-only) sebelum encrypt/HMAC.
- **Jangan pernah log** plaintext / ciphertext / HMAC / key.
- Masking tampilan (mis. `3201••••••••1234`).
- Decrypt **hanya** melalui service terotorisasi.
- **Audit** setiap akses NIK sensitif.

### 7.6 Kehilangan / kompromi key
- `NIK_ENCRYPTION_KEY` hilang → ciphertext tak terpulihkan (by design) → key wajib di-backup di secret store terpisah berakses ketat.
- Compromise → rotasi segera + backfill re-enkripsi + rotasi `NIK_HMAC_KEY` (prosedur terkendali berkat versioning).

### 7.7 ⚠️ NIK Uniqueness — **OPEN, BELUM DI-APPROVE**
- **JANGAN** menetapkan `UNIQUE(tenant_id, nik_hmac)` sekarang.
- Alasan: aturan bisnis Resident lintas RT/tenant belum final; NIK sama bisa terkait residency berpindah / riwayat keanggotaan.
- **Rencana sementara:** `nik_hmac` sebagai **indexed lookup** + **duplicate detection / business validation**, **bukan** hard unique constraint.
- Keputusan unique-vs-non-unique **ditunda** sampai model Resident/residency final diverifikasi. Ditandai sebagai *open question* (§10).

---

## 8. Migrasi & Cutover
- **Phased cutover + dual-write selektif** (bukan big-bang).
- Setiap fase: backup + uji di clone DB sebelum apply.
- **Kendala tooling diketahui:** Prisma engine gagal di Windows (`spawn UNKNOWN`); baseline migration FASE 1 harus dijalankan di **Docker/Linux/CI**, atau via runner `scripts/run-migration.mjs` (pakai `pg`).

---

## 9. Ringkasan Perubahan Schema yang Terdampak (untuk implementasi FASE 1, belum dieksekusi)

> Ini daftar dampak untuk perencanaan — **belum** menjadi migration.

**Tabel baru:**
- `org_unit` (`id`, `tenant_id`, `parent_id`, `type`, `path uuid[]`, `depth`, atribut) + GIN(`path`), invariant §1.2.
- `membership` (`id`, `user_id`, `tenant_id`, `org_unit_id`, `role`, `status`, audit).
- `refresh_token` (`id`, `user_id`, `token_hash`, `family_id`, `issued_at`, `expires_at`, `revoked_at`, `replaced_by`, `user_agent`, `ip`).
- `identity_resolution_report` (audit resolusi identitas legacy) — opsional dipertahankan.

**Perubahan tabel existing:**
- `user`: tambah `token_version int NOT NULL DEFAULT 0`; **hapus** ketergantungan `tenantId` 1:1 (dipindah ke `membership`) — dilakukan bertahap via dual-write.
- `resident`: ganti `nik` plaintext → `nik_ciphertext bytea` + `nik_hmac` + `nik_key_version smallint`; kolom transitional `legacy_email_unresolved` (drop setelah migrasi).
  - **Index NIK:** indexed lookup pada `nik_hmac`. **Unique constraint DITUNDA (OPEN §7.7).**
- Device/IoT: FK ownership per level + `CHECK num_nonnulls = 1`.

**Kebijakan (bukan schema, tapi dikunci sebagai kontrak):**
- Policy matrix IoT §5.4.
- Mapping Role→Permission §4 (config-based).
- Alur authoritative authorization §3.3.

---

## 10. Open Questions (belum dikunci — bukan penghalang FASE 0)
1. **NIK uniqueness** (§7.7): unique `(tenant_id, nik_hmac)` vs indexed + duplicate detection — menunggu model Resident/residency final.
2. Detail kuota/grace `TRIAL`/`PAST_DUE` pada policy matrix §5.4 — ditetapkan saat FASE Entitlement/IoT.
3. Strategi cache/Redis authorization context + invalidation konkret (§3.3) — dirancang saat FASE tenant isolation/authorization.

---

## 11. Urutan Fase (disepakati)
`FASE 0 Security → finalisasi schema → FASE 1 migration/baseline → FASE 2 RLS/tenant isolation → Entitlement → PII/privacy → IoT → Onboarding → Production hardening`

> **Batas saat ini:** dokumen ini final sebagai *target design*. **Tidak ada** perubahan kode / Prisma schema / migration / database sampai instruksi eksplisit memulai **FASE 0 — Security**.
