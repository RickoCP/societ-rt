# FASE 0 — Security Report (SocieT-RT)

> Scope: security emergency/hardening only. **Tidak ada** perubahan Prisma
> migration, struktur database, RLS, OrgUnit, Membership, refresh-token schema,
> atau migrasi NIK. Semua batasan FASE 0 dipatuhi.
>
> Acuan desain berikutnya: `docs/ARCHITECTURE_TARGET_DESIGN.md` (target design,
> belum diimplementasikan).

---

## 1. Ringkasan Eksekutif

FASE 0 menutup gap keamanan yang bisa ditangani tanpa menyentuh database:
- Menghapus ketergantungan pada JWT secret lemah (`socieTRT-rcp`) dan menegakkan
  fail-fast di produksi.
- Menghapus fallback kunci enkripsi hardcoded (`default-dev-key`) pada CCTV.
- Memperkuat validasi environment (3-tier: always / production / feature).
- Menambahkan security headers (CSP, HSTS, Permissions-Policy) terpusat.
- Menyelesaikan vulnerability dependency **runtime-facing** (`next`, `ws`,
  `postcss`) via upgrade non-major.

Regressi terhadap baseline: **nol** untuk typecheck, lint, dan unit test.
Build production penuh masih terhambat oleh **error TypeScript pre-existing**
(bukan akibat FASE 0) dan kendala platform Windows (Turbopack/SWC) — dijelaskan
di §7 dan §9.

---

## 2. Temuan Awal & Severity

| # | Temuan | Severity | Status setelah FASE 0 |
|---|--------|----------|------------------------|
| F1 | `JWT_SECRET="socieTRT-rcp"` lemah, dipakai sign+verify | HIGH | Ditegakkan fail-fast di prod + denylist. **Rotasi manual diperlukan.** |
| F2 | `CctvRepositoryImpl` fallback kunci `'default-dev-key'` | HIGH | Dihapus; fail-fast di prod, dev-only eksplisit. |
| F3 | Tidak ada CSP / HSTS / Permissions-Policy | MEDIUM | Ditambahkan terpusat di middleware. |
| F4 | Env validation lemah (tanpa cek kekuatan, tanpa fail-fast otomatis) | MEDIUM | Diperkuat 3-tier + dipanggil saat startup. |
| F5 | Kredensial asli tersimpan plaintext di `.env` | MEDIUM | `.env` tidak tracked; **rotasi manual direkomendasikan** (lihat §8). |
| F6 | `next` 16.2.4 — CVE runtime (RCE Windows-host, SSRF, cache poisoning, XSS, middleware bypass) | CRITICAL | Upgrade → 16.3.6. |
| F7 | `ws` 8.20.0 — memory disclosure + DoS | HIGH | Upgrade → 8.21.3. |
| F8 | `postcss` — XSS/path traversal (transitif via next) | HIGH | Ter-fix via upgrade next. |
| F9 | Tidak ada `.env.example` | LOW | Dibuat (placeholder murni). |
| F10 | Rate limiter login in-memory per-instance | LOW | Diterima untuk MVP (residual, lihat §10). |

**Sudah baik sebelum FASE 0 (tidak diubah):**
- Error mapping tersanitasi (tidak membocorkan stack/SQL/internal URL).
- Logging worker/job hanya `err.message`; `auditWorker` strip field sensitif
  (password/token/otp/secret/cvv) + masking NIK/telepon/email.
- Account lockout login (5 gagal → 30 menit) + rate limit login 10/menit/IP.
- Cookie auth: `HttpOnly` + `Secure` (prod) + `SameSite=Lax`.

---

## 3. File yang Berubah / Dibuat

**Baru:**
- `src/infrastructure/utils/secrets.ts` — resolusi secret terpusat + penolakan
  secret lemah (fail-fast di prod). Edge-safe. Tidak pernah melog nilai secret.
- `src/infrastructure/utils/securityHeaders.ts` — definisi CSP, HSTS
  (prod-only), Permissions-Policy, dan header lain.
- `src/instrumentation.ts` — hook `register()` memanggil `validateEnv()` saat
  startup (runtime nodejs) → fail-fast konfigurasi.
- `public/sw-register.js` — registrasi service worker (dipindah dari inline
  script agar CSP `script-src 'self'` tanpa `'unsafe-inline'`).
- `.env.example` — template env berlabel `[ALWAYS] / [PROD] / [FEATURE:x]`,
  tanpa nilai kredensial nyata.

**Diubah:**
- `src/infrastructure/utils/envValidation.ts` — REWRITE: skema 3-tier;
  `superRefine` cek kekuatan `JWT_SECRET` (min 32 char + denylist; fatal di
  prod, warning di dev); validasi feature-conditional (Tuya/S3/VAPID) yang
  hanya fatal bila fitur *setengah* dikonfigurasi di prod.
- `src/infrastructure/utils/jwt.ts` — `getJwtSecret()` → `requireJwtSecret()`.
- `src/middleware.ts` — resolusi JWT via `requireJwtSecret()`; security headers
  via `getSecurityHeaders(isProduction)`.
- `src/infrastructure/repositories/cctv/CctvRepositoryImpl.ts` — hapus fallback
  `'default-dev-key'`; fail-fast di prod, dev-only key eksplisit.
- `src/app/layout.tsx` — inline SW script → `<script src="/sw-register.js" defer>`.
- `package.json` — `ws` → `^8.21.3`; `next`/`eslint-config-next` → `16.3.6`;
  script `build` → `next build --webpack` (lihat §9).

**Tidak diubah (keputusan sadar):**
- `cookieConfig.ts` — tetap `SameSite=Lax` (evaluasi `Strict` terpisah, sesuai
  arahan).
- Auth rate limiting & logging redaction — sudah memenuhi; tidak diubah.

---

## 4. Detail Patch Keamanan (#1–#6)

### #1 Env validation (3-tier)
- **ALWAYS**: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`.
- **PRODUCTION**: kekuatan `JWT_SECRET` ditegakkan; fitur yang *setengah*
  dikonfigurasi ditolak (mencegah half-enabled).
- **FEATURE-conditional**: Tuya/IoT, S3, VAPID, CCTV — absennya fitur yang
  memang dimatikan **tidak** memblokir startup. (Mis. `TUYA_*` boleh kosong bila
  IoT nonaktif.)

### #2 JWT secret hardening
- Baseline minimum 32 karakter; **rekomendasi**: random cryptographically secure
  ≥256-bit. Denylist menolak nilai lemah umum termasuk `socieTRT-rcp`.
- Tidak ada secret pengganti hardcoded. Dev boleh secret lemah (dengan warning),
  produksi menolak (fail-fast).

### #3 CCTV encryption key
- Fallback `'default-dev-key'` dihapus. Produksi wajib `CCTV_ENCRYPTION_KEY`
  (atau `TUYA_ENCRYPTION_KEY`); jika fitur CCTV dipakai tanpa key di prod →
  fail-fast. Dev memakai key dev-only eksplisit (tidak pernah dipakai di prod).

### #4 Security headers
- **CSP**: `script-src 'self'` (tanpa `unsafe-inline`/`unsafe-eval`);
  `style-src 'self' 'unsafe-inline'` (kebutuhan Next.js/Leaflet — residual);
  `img-src` termasuk tiles OpenStreetMap + `data:`/`blob:`/`https:`;
  `connect-src` termasuk Nominatim + `ws:`/`wss:`; `frame-ancestors 'none'`;
  `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`.
- **HSTS**: hanya produksi — `max-age=63072000; includeSubDomains; preload`.
- **Permissions-Policy**: menonaktifkan sensor/kamera/mikrofon/pembayaran/USB,
  `geolocation=(self)`.
- Header existing (`X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`) dipertahankan.

### #5 `.env.example`
- Placeholder murni, tidak ada kredensial nyata; berlabel kategori.

### #6 Cookie
- Tidak diubah: `HttpOnly` + `Secure`(prod) + `SameSite=Lax`. `Strict`
  dievaluasi terpisah (residual §10).

---

## 5. Perubahan Dependency (lockfile)

| Paket | Sebelum | Sesudah | Jenis | Alasan |
|-------|---------|---------|-------|--------|
| `ws` | 8.20.0 | 8.21.3 | non-major | memory disclosure + DoS (HIGH) |
| `next` | 16.2.4 | 16.3.6 | non-major | CVE runtime CRITICAL/HIGH |
| `eslint-config-next` | 16.2.4 | 16.3.6 | non-major | konsistensi dengan next |
| `postcss` | — | ter-fix transitif | — | via upgrade next |

- `package-lock.json` diperbarui oleh package manager (dependency + transitif
  yang diperlukan). Tidak ada major upgrade lain / cleanup tak berkaitan.
- Tidak dilakukan `npm audit fix --force` (menghindari perubahan breaking).

**npm audit:** 26 → **21** vulnerabilities (2 critical, 11 high, 5 moderate,
3 low). Semua sisa yang *direct* adalah **dev/build-time** (`vitest`,
`@vitest/coverage-v8`, `prisma`) — tidak dikirim ke runtime produksi. Tidak
diupgrade karena butuh perubahan major (di luar scope FASE 0).

---

## 6. Secret yang Perlu Dirotasi (manual, oleh Anda)

> Tidak ada rotasi otomatis dilakukan. Nilai secret tidak ditampilkan di sini.

| Secret | Current risk | Rotation required? | Impact | Recommended order | Verification | Rollback |
|--------|--------------|--------------------|--------|-------------------|--------------|----------|
| `JWT_SECRET` | Lemah (guessable) | **Ya (prioritas 1)** | Semua sesi/token lama invalid → user login ulang | 1 | Login baru berhasil; token lama ditolak | Set kembali nilai lama (tidak disarankan) |
| `DATABASE_URL` (Neon) | Plaintext di `.env` | Ya, jika ada indikasi akses tak sah | Koneksi DB putus saat rotasi | 2 | App connect + query sehat | Simpan connstring lama sampai verifikasi |
| `REDIS_URL` (Upstash) | Plaintext | Ya, direkomendasikan | Queue/rate-limit/session cache reconnect | 3 | Worker/queue jalan | connstring lama |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_TOKEN` (R2) | Plaintext | Ya, direkomendasikan | Upload/download file gagal saat transisi | 4 | Upload+download uji sukses | keypair lama |
| `TUYA_CLIENT_SECRET` | Plaintext | Ya, direkomendasikan | Kontrol IoT/siren gagal saat transisi | 5 | Uji siren/telemetry | secret lama |
| `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` | Plaintext | **Bersyarat** (lihat §8) | Rotasi meng-invalidasi push subscription existing | 6 (opsional) | Push uji terkirim | keypair lama |

**Urutan yang disarankan:** `JWT_SECRET` dulu (murni aplikatif, tanpa dependency
eksternal), lalu kredensial eksternal satu per satu dengan verifikasi di antara.
Setelah rotasi, pindahkan secret produksi dari file `.env` ke **secret manager**
platform hosting (jangan simpan sebagai plain `.env` di server).

---

## 7. Kemungkinan Secret Exposure di Git History

**PASS — no known secret exposure in Git history.**

Bukti audit:
- `.env` **tidak** ter-track (`git ls-files` bersih); `.gitignore` meng-ignore
  `.env*`.
- `git log --all -- .env*` kosong di seluruh 19 commit → `.env` tidak pernah
  di-commit.
- Pencarian string password DB Neon di seluruh history commit: **nihil**.

> Batas kesimpulan: temuan ini terbatas pada repository & history yang diaudit
> pada mesin ini. Ini **tidak** membuktikan kredensial "pasti tidak pernah bocor"
> lewat jalur lain (mis. berbagi file, backup, log pihak ketiga). Rotasi tetap
> direkomendasikan sebagai higienis.

---

## 8. Catatan Khusus VAPID

VAPID keypair berada di `.env` tetapi **tidak ada indikasi exposure** (tidak
ter-commit, `.env` tidak tracked). Rotasi VAPID **meng-invalidasi seluruh push
subscription yang sudah ada** (semua klien harus re-subscribe).

**Rekomendasi:** rotasi VAPID **hanya jika** ada indikasi kebocoran nyata. Jika
tidak, prioritaskan rotasi secret lain dulu; VAPID bersifat opsional dan
berdampak UX (kehilangan subscriber push). Keputusan ada di Anda.

---

## 9. Hasil Test / Build / Typecheck

Baseline (sebelum perubahan) vs sesudah seluruh FASE 0:

| Cek | Baseline | Sesudah FASE 0 | Kesimpulan |
|-----|----------|----------------|------------|
| `tsc --noEmit` | EXIT 1, ~60 error pre-existing | **identik** (tak ada error baru) | Nol regresi |
| `eslint` | 34 problems (17 err, 17 warn) | **identik** (34) | Nol regresi |
| `vitest run` | 70 passed (8 files) | **70 passed** | Nol regresi |
| `next build` (compile) | tidak dijalankan | **Compiled successfully in ~41s** (webpack) | Kode terkompilasi |
| `next build` (full) | — | Gagal di tahap type-check | Karena error **pre-existing** (lihat bawah) |

**Tentang build production:**
1. Next 16.3.6 default ke **Turbopack** untuk `next build`, tetapi native SWC
   binding (`@next/swc-win32-x64-msvc`) **diblokir Windows Application Control
   policy** di mesin ini → hanya WASM tersedia, Turbopack menolak. Ini kendala
   **platform Windows** (sekelas dengan isu Prisma engine di sesi sebelumnya),
   bukan akibat FASE 0. Diperbaiki dengan menyamakan `build` ke `--webpack`
   (dev sudah memakai `--webpack` sejak sebelum FASE 0).
2. Dengan `--webpack`, **kompilasi berhasil** ("Compiled successfully in 41s").
   Build lalu berhenti di fase **type-check** karena ~60 error TypeScript
   **pre-existing** (mayoritas `Module '@prisma/client' has no exported member
   'PrismaClient'` — akibat Prisma client di-generate ke `src/generated/prisma`;
   plus implicit `any` dan unused vars). Daftar error **identik** dengan baseline.

Error type-check ini **bukan** disebabkan upgrade Next.js maupun patch security
(dibuktikan: kompilasi sukses + daftar error identik baseline). Memperbaikinya
memerlukan penyelarasan import Prisma di banyak route (menyentuh wilayah Prisma
client) — itu **refactor di luar scope FASE 0** dan bersinggungan dengan FASE 1.
Sesuai arahan, tidak dilakukan refactor besar; dilaporkan sebagai residual.

Smoke test yang diminta (auth/login, middleware/security-header, PWA/static,
route/API, IoT/Tuya) belum dapat dijalankan end-to-end karena build produksi
belum bisa menghasilkan artefak akibat blocker type-check pre-existing di atas.
Unit test terkait IoT (`tuyaEventMapper`) dan domain lain tetap **70 passed**.

---

## 10. Residual Risks & Item Ditunda

1. **Error TypeScript pre-existing (~60)** memblokir build produksi. Perlu
   diselesaikan sebelum deploy — sebagian besar penyelarasan import
   `@prisma/client` → `src/generated/prisma`. Direkomendasikan sebagai tugas
   terpisah (bersinggungan FASE 1).
2. **CSP `style-src 'unsafe-inline'`** masih diperlukan (Next.js/Leaflet inject
   inline style). Hardening lanjut: pindah ke nonce/hash.
3. **Rate limiter login in-memory** per-instance; untuk multi-instance perlu
   Redis-backed (FASE berikutnya).
4. **Cookie `SameSite=Strict`** belum diterapkan (perlu uji kompatibilitas flow
   login/redirect).
5. **Rotasi kredensial** (§6) — tindakan manual Anda; belum dilakukan.
6. **Secret produksi** masih berupa file `.env` — pindahkan ke secret manager.
7. **Vulnerability dev-only tersisa** (vitest/prisma) — butuh upgrade major,
   ditunda; tidak memengaruhi runtime produksi.
8. **Peringatan Next**: konvensi `middleware` deprecated → disarankan `proxy`
   (informational; tidak diubah di FASE 0).

---

## 11. Checklist Readiness FASE 0

| Item | Status |
|------|--------|
| Inventarisasi & klasifikasi secret | ✅ PASS |
| `.env*` tidak tracked & tidak di history | ✅ PASS |
| JWT secret lemah tidak lagi bisa dipakai di prod (fail-fast) | ✅ PASS |
| Hardcoded weak key (CCTV) dihapus | ✅ PASS |
| Env validation 3-tier + startup fail-fast | ✅ PASS |
| Server vs public env dipisah; tak ada secret ke client | ✅ PASS |
| Security headers (CSP/HSTS/Permissions-Policy) | ✅ PASS |
| Auth rate limiting / brute-force protection | ✅ PASS (sudah ada) |
| Logging/error tidak bocorkan secret/PII/stack | ✅ PASS |
| Dependency runtime rentan (next/ws/postcss) di-fix | ✅ PASS |
| `.env.example` placeholder | ✅ PASS |
| Unit test hijau (nol regresi) | ✅ PASS (70/70) |
| Typecheck/lint tanpa regresi baru | ✅ PASS |
| Build produksi penuh | ⚠️ BLOCKED oleh error TS pre-existing (bukan FASE 0) |
| Rotasi kredensial eksternal | ⏳ MANUAL (menunggu Anda) |

**Verdict FASE 0: PASS dengan catatan** — seluruh hardening dalam scope selesai
tanpa regresi. Dua item berstatus non-PASS bersifat *pre-existing*/*manual* dan
sudah di luar mandat FASE 0.

---

## 12. Tidak Dilakukan (batasan FASE 0 dipatuhi)

Tidak ada: Prisma migration, `db push`, `migrate reset`, perubahan struktur DB,
penghapusan data, OrgUnit, Membership, tabel `refresh_token`, migrasi NIK, RLS,
maupun FASE 1/2. Tidak ada rotasi kredensial eksternal otomatis.

**STOP di sini — menunggu review Anda sebelum instruksi berikutnya.**
