# PRE-FASE-1 — Clean Build Baseline Report

> ## STATUS: PRE-FASE-1 CLEAN BUILD BASELINE: ACCEPTED
>
> - **TYPECHECK: PASS — 0 errors**
> - **UNIT TEST: PASS — 70/70**
> - **PRODUCTION BUILD: PASS — exit 0**
> - **LINT: KNOWN BASELINE — 5 errors** (`PRE-EXISTING / ACCEPTED TECHNICAL DEBT`, bukan PASS, bukan regression)
> - **DATABASE/SCHEMA CHANGE: NONE**
>
> Catatan: **12 dari 17 lint error diperbaiki tanpa escape hatch**; tidak ada
> perubahan schema/database. 5 lint error `react-hooks/set-state-in-effect`
> diterima sebagai documented technical debt (lihat §8.1 & §13). ESLint rule &
> config **tidak** diubah/di-disable untuk menyembunyikannya.
>
> **Regression ceiling mulai checkpoint berikutnya: lint errors = 5**, dibandingkan
> per identity (file+rule), bukan hanya jumlah total (lihat §14).

---

> Checkpoint terpisah sebelum FASE 1. Tujuan: baseline teknis yang bersih
> (typecheck / test / production build) sebelum implementasi target architecture.
>
> **Boundary dipatuhi:** tidak ada perubahan Prisma schema, migration,
> `prisma db push`, `prisma generate`, struktur DB, OrgUnit, Membership,
> refresh-token, NIK migration, RLS, atau perubahan target architecture. Hanya
> TypeScript/application code.

---

## 1. Ringkasan Target vs Hasil

| Target | Status |
|--------|--------|
| **TYPECHECK** | ✅ **PASS** — 0 error (dari 58) |
| **UNIT TEST** | ✅ **PASS** — 70/70 |
| **PRODUCTION BUILD** | ✅ **PASS** — `next build` exit 0 (penuh) |
| **DATABASE/SCHEMA CHANGE** | ✅ **NONE** |
| **LINT** | ⚠️ **NOT PASS** — 17 error tersisa, **semua pre-existing di luar scope 58 error TS** (lihat §8) |

Tiga dari empat target inti tercapai penuh. Lint belum PASS, tetapi bukan karena
regresi pekerjaan ini — 17 error lint yang tersisa identik dengan baseline dan
berada **di luar** 58 error TypeScript yang menjadi mandat checkpoint ini.
Keputusan cakupannya diserahkan ke Anda (§8).

---

## 2. Baseline Awal

- **58 error TypeScript** di 28 file (memblokir production build pada tahap
  type-check).
- Sumber: audit read-only sebelumnya (`TYPESCRIPT_ERROR_AUDIT.md`).

---

## 3. Progres Error Count

| Tahap | TypeScript errors |
|-------|-------------------|
| Baseline | **58** |
| Setelah Batch 1 (import Prisma) | **17** |
| Setelah Batch 2 (C–H) | **0** |

Batch 1 menghapus 41 error (21 kategori A + **18 kategori B implicit-any yang
hilang otomatis** dari type inference, tanpa menambahkan `any`, + 2 lain-lain
yang ikut ter-resolve).

---

## 4. File yang Berubah

**Batch 1 — import path Prisma (21 file, `@prisma/client` → `@/generated/prisma/client`):**
`src/app/api/` : administration/letters/[id]/route.ts, administration/letters/[id]/document/route.ts,
announcements/route.ts, announcements/[id]/route.ts, auth/me/route.ts, dashboard/route.ts,
events/route.ts, events/[id]/route.ts, events/[id]/rsvp/route.ts, finance/summary/route.ts,
finance/iuran/batch/route.ts, packages/[id]/collect/route.ts, residents/[id]/route.ts,
residents/households/route.ts, residents/households/[id]/route.ts, tenants/route.ts,
visitors/[id]/checkout/route.ts, voting/route.ts, voting/[id]/route.ts, voting/[id]/tally/route.ts.

**Batch 2 — perbaikan typing lokal:**
- `src/app/api/emergency/route.ts` (C)
- `src/presentation/features/administration/viewModel/useLetterListViewModel.ts` (D)
- `src/presentation/features/events/viewModel/useEventListViewModel.ts` (D)
- `src/presentation/features/securityMap/screens/SecurityMapScreen.tsx` (E + F)
- `src/core/domains/automation/usecases/HandleRuleChainingUseCase.ts` (F)
- `src/infrastructure/automation/AutomationEngineImpl.ts` (F)
- `src/presentation/features/users/screens/UserManagementScreen.tsx` (F + H)
- `src/core/domains/voting/usecases/CastVoteUseCase.ts` (F)
- `src/infrastructure/repositories/event/EventRepositoryImpl.ts` (F)
- `src/app/api/finance/iuran/batch/route.ts` (G — juga di Batch 1)
- `src/infrastructure/iot/CircuitBreakerImpl.ts` (G)
- `src/core/domains/iot/usecases/GetDeviceHealthDashboardUseCase.ts` (G)
- `src/app/(dashboard)/residents/[id]/page.tsx` (H — juga di Batch 1)

> Catatan: `package.json`/`package-lock.json` dan beberapa file lain juga
> tampil "modified" di git karena pekerjaan FASE 0 sebelumnya (secrets, headers,
> next/ws upgrade) belum di-commit. Report ini fokus pada perubahan PRE-FASE-1.

**Lint cleanup (checkpoint terpisah, §8):**
- `scripts/generate-pwa-icons.js` → `scripts/generate-pwa-icons.mjs` (ESM)
- `scripts/patch-native-wasm.js` → `scripts/patch-native-wasm.mjs` (ESM)
- `package.json` (`patch:wasm` → `.mjs`)
- `src/presentation/features/resident/screens/ResidentListScreen.tsx` (B + C)
- `src/presentation/features/events/screens/EventListScreen.tsx` (C)
- `src/presentation/features/voting/screens/VoteListScreen.tsx` (C)
- `src/presentation/features/securityCenter/hooks/useSecurityWebSocket.ts` (E)
- `src/presentation/components/atoms/OfflineIndicator.tsx` (useSyncExternalStore)

---

## 5. Root-Cause Fix per Kategori (tanpa escape hatch)

**A — Prisma import path (21).** Ganti `@prisma/client` → `@/generated/prisma/client`.
Ini path generated client resmi (generator `provider = "prisma-client"`, output
`src/generated/prisma`) yang sudah menjadi konvensi di seluruh repository/worker.
Tidak menyentuh schema, tidak `prisma generate`.

**B — implicit `any` (18).** Tidak ada perubahan manual. Hilang otomatis begitu
tipe `PrismaClient` ter-resolve → hasil query kembali bertipe → parameter
callback ter-infer. **Tidak ada `any` yang ditambahkan.**

**C — DI cradle untyped (2).** `emergency/route.ts`: ganti
`const { prismaClient } = container.cradle` (bertipe `{}`) menjadi
`container.resolve<PrismaClient>('prismaClient')` + `import type { PrismaClient }`.
Ini pola resolve bertipe yang sudah dipakai route lain. `alert` ikut ter-infer
dari generic `$queryRawUnsafe<Array<{...}>>` yang sudah ada.

**D — view return-type mismatch (2).** `useLetterListViewModel` &
`useEventListViewModel` mengekspos `total: query.data?.total ?? 0`, tetapi
kontrak `fetch*` hanya `{ data, totalPages }` (tidak pernah ada `total`).
Diverifikasi: **tidak ada screen/consumer yang memakai `total`** (grep nihil).
Root-cause fix = **hapus properti `total` vestigial**, bukan menambah field ke
interface. Behavior bisnis tidak berubah (paginasi tetap via `totalPages`).

**E — Leaflet typing (1).** `SecurityMapScreen`: `as Record<string, unknown>` →
`as unknown as Record<string, unknown>` (sesuai saran compiler untuk tipe yang
tidak cukup overlap). Idiom standar "fix Leaflet default icon".

**F — unused vars/imports (7).**
- `HandleRuleChainingUseCase`: `event` dihapus dari destructuring (tetap ada di
  tipe param, hanya tidak di-destructure) — tidak dipakai di body.
- `AutomationEngineImpl.executeActions`: `context` → `_context` (param wajib oleh
  signature interface, sengaja tak dipakai di method ini).
- `UserManagementScreen`: `isInviting` dihapus dari destructuring (tak dipakai).
- `CastVoteUseCase`: hapus import mati `votingAlreadyVoted`.
- `EventRepositoryImpl`: hapus import mati `eventDuplicateRsvp` + hapus fungsi
  mati `isPrismaUniqueConstraintError` (tidak pernah dipanggil).
- `SecurityMapScreen`: `const [popupContent, setPopupContent]` → `const [popupContent]`
  (setter tak pernah dipanggil; `popupContent` tetap dipakai untuk render popup).

**G — possibly-undefined (3).** (`noUncheckedIndexedAccess`/`strictNullChecks`)
- `finance/iuran/batch`: `if(!map[k]) map[k]={}; map[k][m]=..` → `const hs = (map[k] ??= {}); hs[m]=..`
- `CircuitBreakerImpl.pruneExpiredCommands`: `const command = commandQueue[i]; if (command && ...)`.
- `GetDeviceHealthDashboardUseCase`: `reduce<Date | null>((latest,d)=> latest===null||d.lastSeen>latest ? d.lastSeen:latest, null)` — menghilangkan seed `devices[0]` yang possibly-undefined; **behavior identik** (kosong→null, isi→max lastSeen).

**H — optional string → required prop (2).** `getAvatarColor` di
`residents/[id]/page.tsx` & `UserManagementScreen.tsx`: `return colors[index]`
(→ `string | undefined`) menjadi `return colors[index] ?? 'bg-blue-500'`
(fallback literal deterministik). Tidak ada `!`.

**Escape hatch yang DIHINDARI:** tidak ada `any`, `@ts-ignore`,
`@ts-expect-error`, `!` non-null assertion, cast berlapis untuk membungkam
compiler, pelebaran tipe sembarang, atau mematikan strictness/`noUnusedLocals`.

---

## 6. Konfirmasi Tidak Ada Perubahan Schema/DB/Migration

`git status` menunjukkan: tidak ada perubahan pada `prisma/schema.prisma`, tidak
ada file migration/SQL baru, tidak ada perubahan struktur DB. `prisma generate`
tidak dijalankan (generated client existing sudah benar). **DATABASE/SCHEMA
CHANGE: NONE.**

---

## 7. Hasil Regression

- **Typecheck** (`npx tsc --noEmit`): **0 error**, exit 0. ✅
- **Unit test** (`vitest run`): **70/70 passed** (8 files). ✅
- **Production build** (`next build --webpack`): **exit 0**. ✅
  - `Compiled successfully in 11.7s`
  - `Finished TypeScript in 6.2s` (tahap yang sebelumnya gagal — kini lolos)
  - `Generating static pages (122/122)`
  - `Collecting build traces` → selesai, route table tercetak, exit 0.
  - Build memakai `--webpack` (native Turbopack SWC diblokir Windows Application
    Control di mesin ini; keputusan ini dibuat & didokumentasikan pada FASE 0,
    bukan checkpoint ini).

---

## 8. Lint — Cleanup Result (checkpoint terpisah "PRE-FASE-1 Lint Cleanup")

Baseline lint checkpoint ini: **17 errors, 17 warnings**. Setelah cleanup:
**5 errors, 11 warnings** (`eslint` exit 1).

**12 dari 17 error diperbaiki di root-cause, tanpa escape hatch** (tanpa
`any`/`@ts-ignore`/`@ts-expect-error`/disable/ubah config/turunkan strictness):

| Rule | Awal | Kini | Fix |
|------|------|------|-----|
| `@typescript-eslint/no-require-imports` (A) | 5 | **0** | `scripts/*.js` → `.mjs` ESM |
| `react/no-unescaped-entities` (B) | 2 | **0** | `"..."` → `&quot;...&quot;` |
| `@next/next/no-html-link-for-pages` (C) | 3 | **0** | `<a href>` → `<Link href>` |
| `react-hooks/refs` + `immutability` (E) | 2 | **0** | latest-ref via effect + `connectRef` |
| `react-hooks/set-state-in-effect` (D) | 5 | **5** | **DITAHAN — lihat §8.1** |

### Detail fix yang diterapkan

**A — no-require-imports (5 → 0).** Kedua file adalah **Node CLI script** (bukan
kode aplikasi). Proyek tidak `"type":"module"`, jadi `.js` = CommonJS. Rename ke
`.mjs` + konversi ESM (`import node:fs/path/url`, `fileURLToPath` untuk
`__dirname`, `await import('sharp')` untuk optional dep). `package.json`
`patch:wasm` diarahkan ke `.mjs`. **Runtime semantics dipertahankan** (tetap
Node script).

**B — no-unescaped-entities (2 → 0).** `"Warga"` → `&quot;Warga&quot;` di
ResidentListScreen. **Wording tidak berubah.**

**C — no-html-link-for-pages (3 → 0).** Ketiga `<a>` menuju **internal Next
route** (`/events/create`, `/voting/create`, `/residents/import`) — bukan
external/download/protocol. Diganti `next/link`. Struktur `<Button><Link>`
dipertahankan; tampilan & behavior navigasi sama.

**E — react-hooks/refs + immutability (2 → 0).** `useSecurityWebSocket`:
- `onMessageRef.current = onMessage` dipindah dari render body ke
  `useEffect(() => { onMessageRef.current = onMessage }, [onMessage])`
  (pola latest-ref standar; ref tetap ter-update tiap perubahan callback).
- Auto-reconnect di `onclose` memanggil `connectRef.current()` alih-alih
  closure `connect` langsung; `connectRef` disinkronkan via
  `useEffect(() => { connectRef.current = connect }, [connect])`.
  Ini memutus circular reference tanpa mengubah lifecycle
  (connect/reconnect/cleanup/unsubscribe/backoff/unmount semua identik).

**OfflineIndicator (bonus, sebelumnya masuk hitungan D).** Dikonversi ke
`useSyncExternalStore` (idiom React untuk subscribe browser online/offline
store). Menghilangkan set-state-in-effect **tanpa mengubah UX** (indikator tetap
muncul hanya saat offline). Ini menghapus 1 dari 5 lokasi D awal; digantikan oleh
1 lokasi D baru yang sebelumnya ter-mask di WebSocket hook (§8.1), sehingga total
D tetap 5.

### 8.1 `react-hooks/set-state-in-effect` — 5 error DITAHAN (STOP + lapor)

Sesuai instruksi Anda ("jika penyelesaian butuh perubahan berisiko/refactor
besar, jangan paksakan lint 0 — STOP dan laporkan"), 5 error ini **tidak** saya
paksakan. Tidak memakai disable, tidak konversi berisiko.

| # | Lokasi | Root cause | Kenapa ditahan |
|---|--------|-----------|-----------------|
| 1 | `finance/report/page.tsx:54` | `useEffect(()=>{fetchSummary()})`, `fetchSummary` `setLoading(true)` synchronous | fix = konversi React Query (hapus state+effect); perubahan struktur |
| 2 | `voting/[id]/page.tsx:87` | idem (`fetchVote`) | idem |
| 3 | `security/incidents/page.tsx:77` | idem (`fetchIncidents`, dipanggil juga dari submit/edit/delete) | idem |
| 4 | `residents/[id]/page.tsx:92` | idem (`fetchData`) **+ menyinkronkan 6 form-state** dari response | **paling berisiko** ubah behavior form |
| 5 | `useSecurityWebSocket.ts:151` | `connect()` di effect memanggil `setIsConnected(false)` (via `cleanup`) synchronous | menyentuh **lifecycle WebSocket** — instruksi E: STOP + lapor |

**Analisis akar (empiris):** rule menganalisis call-graph transitif. Uji
`void fetchIncidents()` **tidak** memadamkan rule karena `setLoading(true)`
tetap synchronous saat fungsi dipanggil. Untuk 4 halaman fetch, satu-satunya fix
root-cause yang benar (dan konsisten steering "React Query = sumber kebenaran
data server") adalah **konversi ke `useQuery`**, yang menghapus state
`loading/error/data` + effect manual. Itu perubahan struktur page-level;
`residents/[id]` yang menyinkronkan 6 form-state dari response berisiko mengubah
behavior form. Untuk WebSocket, menghapus `setIsConnected` dari jalur `connect`
synchronous menyentuh lifecycle koneksi.

**Opsi untuk 5 error ini (menunggu keputusan Anda):**
- **(a)** Konversi 4 halaman fetch ke React Query + rework `isConnected` di
  WebSocket hook, sebagai batch terpisah dengan regression UI/hook (dan targeted
  test untuk WebSocket bila memungkinkan tanpa refactor besar).
- **(b)** Terima sebagai technical-debt terdokumentasi; tetapkan clean baseline
  berbasis **typecheck + test + build PASS** (lint error tersisa non-blocking
  untuk build). Lanjut FASE 1, jadwalkan konversi React Query di fase UI/refactor.

### 8.2 Warning tersisa (11, non-blocking)

| Rule | Jml | Catatan |
|------|-----|---------|
| `@typescript-eslint/no-unused-vars` | 9 | mayoritas param sengaja `_`-prefixed (signature interface, mis. `_context`, `_job`, `_signature`, `_userId`, `_container`, `_patrolRepository`) + `emergency/route.ts` `error` unused (pre-existing) |
| `@next/next/no-img-element` | 2 | `Avatar.tsx`, `CctvMonitoringScreen.tsx` — saran pakai `next/image` (optimasi, bukan bug) |

Warning tidak dibersihkan otomatis karena sebagian butuh perubahan unrelated
(mis. `<img>`→`next/image` menyentuh layout/loader). Dilaporkan sebagai debt
ringan.

---

## 9. Dependency / Security Audit

`npm audit`: **21 vulnerabilities** (2 critical, 11 high, 5 moderate, 3 low) —
**tidak berubah** oleh pekerjaan PRE-FASE-1. Seluruh sisa yang *direct* adalah
**dev/build-time** (`vitest`, `@vitest/coverage-v8`, `prisma`), tidak dikirim ke
runtime produksi. Konsisten dengan residual FASE 0.

---

## 10. Architecture Boundary

- Route API tetap mengimpor **tipe** `PrismaClient` dari generated client
  (infrastructure), bukan menambah akses DB baru di layer presentation/core.
- `core` use cases tidak menyentuh infrastruktur; perubahan F/G di core murni
  typing/dead-code lokal.
- Tidak ada pelanggaran dependency rule baru. Tidak ada perubahan target
  architecture.

---

## 10.1 Behavioral Impact & Targeted Regression (Lint Cleanup)

- **A (scripts)**: zero app impact (Node CLI script). `patch:wasm` masih
  berfungsi via `.mjs`. Tidak ada test khusus (bukan kode aplikasi).
- **B (escape)**: zero behavior — hanya rendering entity kutip.
- **C (`<Link>`)**: navigasi ke route yang sama; Next `<Link>` memberi
  client-side nav (peningkatan, bukan regresi). Tampilan identik.
- **E (WebSocket refs/immutability)**: semantics connect/reconnect/cleanup/
  backoff/latest-callback dipertahankan (lihat §8). **Tidak ada test coverage
  existing** untuk hook ini; targeted test WebSocket memerlukan mock `WebSocket`
  + fake timers yang non-trivial — dicatat sebagai debt (tidak dibuat agar tidak
  refactor besar), perubahan bersifat pola-standar berisiko rendah.
- **OfflineIndicator (`useSyncExternalStore`)**: UX identik (muncul saat
  offline). 
- **Regression dijalankan setelah cleanup**: `tsc` 0 error, unit test **70/70**,
  production build **exit 0**. Tidak ada test yang tadinya hijau menjadi merah.

---

## 11. Residual / Technical Debt

1. **Lint: 5 error `react-hooks/set-state-in-effect`** (§8.1) — **DITERIMA
   sebagai documented technical debt** (keputusan (b)). Log lengkap di §13.
2. **Lint: 11 warning** (§8.2) — `no-unused-vars` (mayoritas `_`-prefixed
   sengaja) + `no-img-element` ×2. Non-blocking.
3. **Vulnerability dev-only** (vitest/prisma) — butuh upgrade major, ditunda.
4. **Turbopack di Windows** — build memakai `--webpack` karena native SWC
   diblokir Application Control policy (lingkungan). CI/Linux dapat memakai
   default.
5. **Peringatan Next**: konvensi `middleware` deprecated → `proxy`
   (informational; tidak diubah).
6. **Kredensial rotation** (dari FASE 0) — tetap tindakan manual Anda.

---

## 12. Status Akhir Checkpoint

**PRE-FASE-1 CLEAN BUILD BASELINE: ACCEPTED**
(5 known pre-existing lint errors accepted as documented technical debt.)

| Target | Hasil |
|--------|-------|
| TYPECHECK | ✅ PASS (0 error) |
| UNIT TEST | ✅ PASS (70/70) |
| PRODUCTION BUILD | ✅ PASS (exit 0) |
| DATABASE/SCHEMA CHANGE | ✅ NONE |
| LINT | 🟡 KNOWN BASELINE — **5 errors** (`PRE-EXISTING / ACCEPTED TECHNICAL DEBT`) |

Lint diturunkan dari 17 → 5 error tanpa escape hatch (12 diperbaiki root-cause).
5 error tersisa (`react-hooks/set-state-in-effect`) **diterima sebagai documented
technical debt** (keputusan (b)) — memaksakan lint 0 sekarang akan mengubah
checkpoint ini dari baseline cleanup menjadi behavioral refactor. ESLint rule &
config tidak diubah/di-disable. Semua target lain hijau; tidak ada perubahan
schema/database.

---

## 13. Technical Debt Log (5 accepted lint errors)

Kelompok ke dua area remediasi. **Jangan** dicampur ke migration database FASE 1.

### 13.1 UI / Data Fetching Debt (4 error)

Root cause umum: page memakai pola manual `useState(loading/error/data)` +
`useEffect(() => fetchX())`, di mana `fetchX` memanggil `setLoading(true)`
**synchronous** → memicu `react-hooks/set-state-in-effect`.

| # | File | Line | Rule | Root cause spesifik | Alasan deferred | Risk |
|---|------|------|------|---------------------|-----------------|------|
| D1 | `src/app/(dashboard)/finance/report/page.tsx` | 54 | `react-hooks/set-state-in-effect` | `fetchSummary()` dipanggil di effect; set loading/error synchronous; refetch on `year` change | fix = konversi React Query (perubahan struktur) | Rendah (fungsional benar saat ini) |
| D2 | `src/app/(dashboard)/voting/[id]/page.tsx` | 87 | `react-hooks/set-state-in-effect` | `fetchVote()` idem; refetch on `voteId` | idem | Rendah |
| D3 | `src/app/(dashboard)/security/incidents/page.tsx` | 77 | `react-hooks/set-state-in-effect` | `fetchIncidents()` idem; juga dipanggil dari submit/edit/delete | idem | Rendah |
| D4 | `src/app/(dashboard)/residents/[id]/page.tsx` | 92 | `react-hooks/set-state-in-effect` | `fetchData()` idem **+ menyinkronkan 6 form-state** dari response | idem, **plus** risiko sinkronisasi form | Sedang (form-state coupling) |

**Future remediation (UI/Data Fetching Debt):**
- Migrasikan pola fetch page ke **React Query** (`useQuery`) secara terencana,
  konsisten dengan steering "React Query = sumber kebenaran data server".
- Lakukan bersama **targeted UI regression/testing** (loading/error/empty state,
  refetch on param change, dan khusus D4: sinkronisasi form-state saat load &
  reset).
- Kerjakan sebagai batch UI terpisah, **bukan** bagian FASE 1 DB migration.

### 13.2 WebSocket Lifecycle Debt (1 error)

| # | File | Line | Rule | Root cause spesifik | Alasan deferred | Risk |
|---|------|------|------|---------------------|-----------------|------|
| D5 | `src/presentation/features/securityCenter/hooks/useSecurityWebSocket.ts` | 151 | `react-hooks/set-state-in-effect` | `connect()` dipanggil di effect memanggil `setIsConnected(false)` (via `cleanup`) synchronous | menyentuh lifecycle connect/reconnect/state; instruksi = STOP+lapor | Sedang (lifecycle koneksi) |

**Future remediation (WebSocket Lifecycle Debt):**
- Redesign sinkronisasi state `isConnected`/`lastEvent` di `useSecurityWebSocket`
  agar tidak setState synchronous di jalur `connect` dalam effect.
- Wajib disertai **targeted lifecycle tests**: connect, disconnect, reconnect
  (backoff + attempt cap), cleanup, dan unmount — dengan mock `WebSocket` + fake
  timers.
- Kerjakan sebagai batch WebSocket terpisah, **bukan** bagian FASE 1 DB migration.

---

## 14. Regression Rule (baseline ceiling)

Mulai checkpoint berikutnya, **lint errors = 5** adalah **baseline ceiling**:

- `5 → 5` = tidak ada lint regression (OK).
- `5 → <5` = improvement.
- `5 → >5` = **regression** — hentikan & analisis sebelum lanjut.

**Bandingkan per identity (file + rule + lokasi), bukan hanya total.** Jika satu
error baseline hilang tetapi error baru muncul sehingga total tetap 5, itu tetap
**regression baru** dan wajib dilaporkan. Baseline identity terdaftar di §13
(D1–D5). Fase berikutnya tidak boleh menambah lint error baru.

---

**STOP — PRE-FASE-1 baseline diterima & difinalisasi. Menunggu freeze Git
(commit + tag) lalu approval eksplisit Anda sebelum FASE 1. Tidak ada FASE 1
yang dimulai.**
