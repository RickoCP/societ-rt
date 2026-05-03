---
inclusion: always
---

# ⚙️ Konfigurasi & Konvensi (Steering)

Dokumen ini adalah **standar konfigurasi dan konvensi WAJIB** untuk seluruh proyek.

Semua developer dan AI Agent (Kiro) HARUS mengikuti aturan ini untuk menjaga:

* konsistensi codebase
* kualitas kode
* maintainability
* compatibility dengan arsitektur Clean Architecture

---

# 📁 Path Aliases (WAJIB)

Gunakan path alias, **DILARANG menggunakan relative path panjang (`../../..`)**.

| Alias               | Target                              |
| ------------------- | ----------------------------------- |
| `@core/*`           | `src/core/*`                        |
| `@infrastructure/*` | `src/infrastructure/*`              |
| `@features/*`       | `src/presentation/features/*`       |
| `@components/*`     | `src/presentation/components/*`     |
| `@presentation/*`   | `src/presentation/*`                |
| `@di/*`             | `src/infrastructure/di/*`           |
| `@app/*`            | `src/app/*`                         |
| `@styles/*`         | `src/styles/*`                      |
| `@assets/*`         | `src/assets/*`                      |
| `@locales/*`        | `src/presentation/locales/*`        |
| `@localization/*`   | `src/infrastructure/localization/*` |
| `@utils/*`          | `src/infrastructure/utils/*`        |

🚫 DILARANG:

```ts
import x from '../../../core/...'
```

---

# 🧠 TypeScript Rules (STRICT WAJIB)

Konfigurasi wajib:

* `strict: true`
* `noImplicitAny: true`
* `strictNullChecks: true`
* `noUncheckedIndexedAccess: true`
* `noUnusedLocals: true`
* `noUnusedParameters: true`

## Rule tambahan:

❌ DILARANG:

* `any`
* `@ts-ignore`

✅ WAJIB:

* gunakan type/interface jelas
* gunakan union type / generics

---

# 🧹 ESLint (WAJIB LULUS)

Config:

* `next/core-web-vitals`
* `prettier`
* `plugin:sonarjs/recommended-legacy`

## Rule penting:

* Tidak boleh ada warning di PR
* SonarJS rules WAJIB diikuti

---

# 🎨 Prettier (FORMAT WAJIB)

```js
{
  arrowParens: 'avoid',
  bracketSameLine: true,
  bracketSpacing: true,
  singleQuote: true,
  trailingComma: 'all',
}
```

Semua file WAJIB auto-format.

---

# 🧾 Commit Convention (WAJIB)

Gunakan Conventional Commits:

* `feat:` fitur baru
* `fix:` bug
* `refactor:` refactor
* `docs:` dokumentasi
* `test:` testing
* `chore:` maintenance

## Enforcement:

* Husky + lint-staged WAJIB aktif
* Commit tanpa format → DITOLAK

---

# 🔐 Environment Variables

## Rule:

* Client env → WAJIB prefix `NEXT_PUBLIC_`
* Tidak boleh expose secret ke client

| Variable                  | Deskripsi    |
| ------------------------- | ------------ |
| `NEXT_PUBLIC_API_HOST`    | Base URL API |
| `NEXT_PUBLIC_BASEPATH`    | Base path    |
| `NEXT_PUBLIC_ENVIRONMENT` | env          |

🚫 DILARANG:

* hardcode URL
* akses process.env langsung tanpa wrapper (opsional best practice)

---

# ⚡ Next.js Config (Production Ready)

## Rule:

* `output: 'standalone'` (WAJIB untuk Docker)
* `poweredByHeader: false` (security)
* `basePath` dari env

## Catatan penting:

❌ `reactStrictMode: false`
→ hanya boleh jika ada alasan kuat

✅ Disarankan:

* `true` untuk dev consistency

---

# 🌍 Internationalization (i18n)

## Rule:

* Semua text HARUS pakai `t()`
* Tidak boleh hardcode text

```ts
const { t } = useTranslation();
```

## Struktur:

```
src/presentation/locales/[lang]/translation.json
```

---

# 🎨 Styling Convention

## Priority:

1. Tailwind (default)
2. SCSS Modules (complex UI only)

## Rule:

* Tidak boleh inline style kompleks
* Tidak boleh global CSS sembarangan

---

# 🧩 Naming Convention (STRICT)

| Item           | Format               | Contoh                     |
| -------------- | -------------------- | -------------------------- |
| Component      | PascalCase           | `PaymentCard.tsx`          |
| Hook/ViewModel | camelCase            | `usePaymentViewModel.ts`   |
| UseCase        | PascalCase + UseCase | `GetPaymentUseCase.ts`     |
| Repository     | PascalCase           | `PaymentRepository.ts`     |
| Impl           | PascalCase + Impl    | `PaymentRepositoryImpl.ts` |
| Entity         | PascalCase           | `Payment.ts`               |
| Mapper         | PascalCase + Mapper  | `PaymentMapper.ts`         |
| DI Key         | camelCase            | `paymentUseCase`           |
| Slice          | kebab-case           | `payment-slice.ts`         |

---

# 🚫 Anti-Pattern (STRICT)

❌ relative path panjang
❌ any type
❌ hardcode string UI
❌ env langsung di banyak tempat
❌ naming tidak konsisten

---

# ✅ Best Practice

* gunakan alias path
* gunakan strict typing
* gunakan lint + format otomatis
* gunakan commit convention

---

# 🏁 Kesimpulan

Dengan mengikuti aturan ini:

* code lebih konsisten
* lebih mudah di-scale
* lebih aman
* lebih mudah di-maintain
