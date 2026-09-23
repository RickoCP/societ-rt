# TypeScript Error Audit (Read-Only) — Pre-FASE 1 Baseline

> **Read-only diagnostic.** Tidak ada kode/schema/database yang diubah. Tidak ada
> fix, migration, `db push`, `prisma generate`, OrgUnit, Membership,
> refresh-token, NIK migration, atau RLS yang dijalankan.
>
> Tujuan: memahami penyebab ~60 error TypeScript yang memblokir production build,
> agar FASE 1 tidak dimulai di atas baseline yang tidak bisa di-build tanpa tahu
> akarnya.
>
> Sumber: `npx tsc --noEmit` (identik dengan yang memblokir `next build`).
> Total: **58 error** di **28 file**.

---

## Ringkasan per Kategori

| # | Kategori | Jumlah error | Terkait target schema/migration? | Perbaiki sebelum FASE 1? | Perbaiki saat FASE 1? | Aman diperbaiki sekarang (independen)? |
|---|----------|--------------|-----------------------------------|--------------------------|------------------------|-----------------------------------------|
| A | Prisma import path salah (`@prisma/client` → seharusnya `@/generated/prisma/client`) | 21 | Tidak (murni import path) | Opsional | Boleh sekalian | **Ya — aman & independen** |
| B | Implicit `any` turunan dari kategori A | 18 | Tidak | Ikut A | Ikut A | Ya (hilang begitu A/DI diperbaiki atau anotasi) |
| C | DI cradle untyped (`container.cradle` → `{}`) | 2 | Tidak (typing DI) | Opsional | Boleh | Ya, tapi menyentuh tipe container |
| D | View/domain return-type mismatch (`.total`) | 2 | Tidak | Opsional | Boleh | **Ya — aman & independen** |
| E | Leaflet/framework typing (cast `Record<string, unknown>`) | 1 | Tidak | Opsional | Boleh | **Ya — aman & independen** |
| F | Unused vars/imports (noUnusedLocals) | 8 | Tidak | Opsional | Boleh | **Ya — aman & independen** |
| G | Strict null / possibly-undefined | 4 | Tidak | Opsional | Boleh | **Ya — aman & independen** |
| H | `string | undefined` → `string` (props) | 2 | Tidak | Opsional | Boleh | **Ya — aman & independen** |

**Kesimpulan utama:** **TIDAK ADA** error yang berasal dari schema/client mismatch
sungguhan (mis. referensi ke model/field yang sudah dihapus). Semua error adalah
**inconsistency import path**, **typing lokal**, atau **lint-style strictness** —
**independen dari target architecture FASE 1** dan tidak menuntut migration untuk
diperbaiki.

---

## Kategori A — Prisma import path salah (21 error) — ROOT CAUSE UTAMA

**Error khas:**
```
error TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'.
```

**Root cause:** Generator Prisma dikonfigurasi (di `prisma/schema.prisma`):
```prisma
generator client {
  provider = "prisma-client"          // bukan "prisma-client-js"
  output   = "../src/generated/prisma"
}
```
Karena provider `prisma-client` + output kustom, `PrismaClient` **diekspor dari
`@/generated/prisma/client`**, BUKAN dari paket `@prisma/client`. Mayoritas
codebase sudah benar (semua repository impl, workers, dan route baru seperti
`opening-balance`, `automation/executions`, `packages`, `iot/*` memakai
`@/generated/prisma/client`). Hanya **21 route API lama** yang masih memakai
`@prisma/client` — dibuat sebelum generator dipindah.

**File terdampak (21):** route di `src/app/api/**` — administration/letters (2),
announcements (2), auth/me, dashboard, events (3), finance/iuran/batch,
finance/summary, packages/[id]/collect, residents (3), tenants, visitors/checkout,
voting (4).

**Bukti ini BUKAN schema mismatch:** import yang benar dipakai luas di file lain
tanpa error. Ini murni jalur import tidak konsisten.

- **Terkait target schema/migration?** Tidak.
- **Sebelum FASE 1?** Tidak wajib, tapi ini blocker build → sebaiknya diselesaikan
  agar baseline bisa di-build. Fix = ganti string import (satu baris per file),
  tidak menyentuh schema/DB.
- **Aman sekarang?** Ya, sangat aman & independen. Tapi Anda meminta tidak fix
  dulu — jadi hanya dicatat.

---

## Kategori B — Implicit `any` turunan (18 error)

**Error khas:**
```
error TS7006: Parameter 'u' implicitly has an 'any' type.
error TS7006: Parameter 'r'/'h'/'o'/'sum'/'b'/'alert' implicitly has an 'any' type.
```

**Root cause:** Callback `.map()`/`.reduce()` di route yang sama dengan kategori A.
Ketika tipe `PrismaClient` gagal di-resolve (kategori A), hasil query kehilangan
tipe → parameter callback jatuh ke implicit `any` (dilarang `noImplicitAny`).
Sebagian besar akan **hilang otomatis** begitu import Prisma dibetulkan; sisanya
butuh anotasi eksplisit ringan.

**File terdampak:** announcements/route (1), events/[id] (4), events/route (2),
finance/iuran/batch (1), residents/households (2), tenants/route (1), voting/[id]
(1), voting/[id]/tally (6), voting/route (1) + emergency/route (`alert`, terkait C).

- **Terkait target schema/migration?** Tidak.
- **Sebelum/ saat FASE 1?** Ikut penyelesaian kategori A.
- **Aman sekarang?** Ya (tergantung A/C).

---

## Kategori C — DI cradle untyped (2 error)

**Error:**
```
src/app/api/emergency/route.ts(138,13): TS2339: Property 'prismaClient' does not exist on type '{}'.
src/app/api/emergency/route.ts(159,27): TS7006: Parameter 'alert' implicitly has an 'any' type.
```

**Root cause:** `const { prismaClient } = container.cradle;` — Awilix `cradle`
bertipe `{}` (tidak ada tipe registrasi container), jadi destructuring
`prismaClient` gagal, dan `alert` di `.map()` menjadi implicit any turunan. Ini
**typing Dependency Injection**, bukan schema. Route lain umumnya
`container.resolve<T>('x')` (bertipe), sementara ini memakai `container.cradle`
langsung.

- **Terkait target schema/migration?** Tidak.
- **Sebelum FASE 1?** Opsional.
- **Aman sekarang?** Ya, tapi idealnya ditangani bersama penambahan tipe cradle
  container (atau ganti ke `container.resolve<PrismaClient>('prismaClient')`).

---

## Kategori D — View/domain return-type mismatch (2 error)

**Error:**
```
useLetterListViewModel.ts(79,24): TS2339: Property 'total' does not exist on type '{ data: LetterRequest[]; totalPages: number; }'.
useEventListViewModel.ts(116,24): TS2339: Property 'total' does not exist on type '{ data: CommunityEvent[]; totalPages: number; }'.
```

**Root cause:** ViewModel mengakses `query.data.total`, tetapi tipe hasil use
case/repository hanya `{ data, totalPages }` — tidak ada `total`. Mismatch kontrak
antara layer (repository/usecase vs viewModel). Perlu keputusan: tambah `total`
ke kontrak, atau viewModel berhenti memakainya.

- **Terkait target schema/migration?** Tidak (kontrak tipe internal).
- **Sebelum FASE 1?** Opsional.
- **Aman sekarang?** Ya, independen — perbaikan lokal 2 file.

---

## Kategori E — Leaflet/framework typing (1 error)

**Error:**
```
SecurityMapScreen.tsx(38,15): TS2352: Conversion of type 'Default' to type 'Record<string, unknown>' may be a mistake...
```

**Root cause:** `delete (L.Icon.Default.prototype as Record<string, unknown>)['_getIconUrl']`
— cast paksa tipe Leaflet Icon.Default yang tidak cukup overlap. Idiom umum "fix
Leaflet default icon" tetapi cast-nya perlu lewat `unknown` dulu. Framework typing,
independen.

- **Terkait target schema/migration?** Tidak.
- **Aman sekarang?** Ya, 1 baris.

---

## Kategori F — Unused vars/imports (8 error)

**Error khas:**
```
TS6133: 'X' is declared but its value is never read.
```
`noUnusedLocals`/`noUnusedParameters` aktif. Terdampak: HandleRuleChainingUseCase
(`event`), CastVoteUseCase (`votingAlreadyVoted`), AutomationEngineImpl (`context`),
EventRepositoryImpl (`eventDuplicateRsvp`, `isPrismaUniqueConstraintError`),
SecurityMapScreen (`setPopupContent`), UserManagementScreen (`isInviting`).

- **Terkait target schema/migration?** Tidak.
- **Aman sekarang?** Ya, sangat aman (hapus/prefix `_`). Murni higienis.

---

## Kategori G — Strict null / possibly-undefined (4 error)

**Error:**
```
finance/iuran/batch/route.ts(72,7): TS2532: Object is possibly 'undefined'.
GetDeviceHealthDashboardUseCase.ts(145,13): TS2532: Object is possibly 'undefined'.
CircuitBreakerImpl.ts(141,17): TS2532: Object is possibly 'undefined'.
```
(+ akses turunan). `noUncheckedIndexedAccess`/`strictNullChecks` — akses indeks/
optional tanpa guard. Butuh guard atau non-null assertion yang aman.

- **Terkait target schema/migration?** Tidak.
- **Aman sekarang?** Ya, perbaikan lokal per lokasi.

---

## Kategori H — `string | undefined` → `string` pada props (2 error)

**Error:**
```
residents/[id]/page.tsx(51,3): TS2322: Type 'string | undefined' is not assignable to type 'string'.
UserManagementScreen.tsx(43,3): TS2322: ...
```

**Root cause:** Nilai opsional (mis. dari params/route) diteruskan ke prop yang
menuntut `string`. Perlu fallback/guard atau prop dibuat opsional.

- **Terkait target schema/migration?** Tidak.
- **Aman sekarang?** Ya, lokal.

---

## Jawaban atas Pertanyaan Kategorisasi Anda

- **Prisma generated-client stale?** Tidak. Client ada di `src/generated/prisma`
  dan diimpor benar oleh mayoritas file. Tidak ada indikasi stale.
- **Schema/client mismatch?** Tidak ditemukan. Tidak ada error "field/model X
  tidak ada" pada model yang seharusnya ada.
- **Import/API Prisma tidak valid?** Ya — **kategori A**: import path lama
  `@prisma/client` (21 file) yang seharusnya `@/generated/prisma/client`. Ini
  sumber ~39 dari 58 error (A + B turunannya).
- **TypeScript errors independen?** Ya — kategori D, E, F, G, H (total ~17)
  murni typing lokal/strictness, tidak terkait Prisma sama sekali.
- **Kombinasi?** Ya: ~39 error (A+B) dari satu akar (import path), ~2 (C) dari DI
  typing, ~17 (D–H) independen.

---

## Rekomendasi (tanpa dieksekusi sekarang)

1. **Tidak ada** kategori yang menuntut migration/`db push`/schema change untuk
   diperbaiki. Baseline build **bisa dipulihkan tanpa menyentuh FASE 1**.
2. Semua kategori **aman diperbaiki sebagai technical-debt terpisah** kapan saja,
   karena independen dari target architecture. Yang berdampak paling besar &
   paling aman: **kategori A** (ganti import path — mekanis, satu baris/file).
3. Tidak perlu membuka kembali FASE 0. Ini layak menjadi **blocker/technical-debt
   tersendiri**: "Restore production build — pre-existing TS/Prisma import
   errors".
4. Karena kategori A murni import path (bukan schema), memperbaikinya **sebelum**
   FASE 1 aman dan akan memberi baseline yang bisa di-build — tetapi menunggu
   approval eksplisit Anda sebelum melakukan perubahan apa pun.

---

## Status

- Audit read-only: **SELESAI**.
- Perubahan kode/schema/DB: **NIHIL**.
- Menunggu keputusan Anda: apakah (a) memperbaiki kategori A (+B turunan) sebagai
  technical-debt sebelum FASE 1, atau (b) menunda semuanya dan lanjut sesuai
  rencana FASE 1 dengan blocker build didokumentasikan.

**STOP — menunggu approval berikutnya.**
