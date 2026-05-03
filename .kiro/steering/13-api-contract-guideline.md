---
inclusion: fileMatch
fileMatchPattern: "**/dto/**,**/api/**"
---

# 🔌 API Contract Guideline (Steering)

Dokumen ini adalah **standar kontrak API WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Kontrak API mencakup:

* request shape
* response shape
* DTO
* field naming
* status & metadata
* error response
* versioning
* backward compatibility

Tujuan utama dokumen ini adalah memastikan komunikasi antar layer dan antar sistem tetap:

* konsisten
* stabil
* aman
* mudah diuji
* mudah diobservasi
* ramah untuk frontend dan BFF

Dokumen ini berlaku untuk:

* BFF endpoint
* internal API contract
* response adapter
* DTO yang digunakan untuk integrasi service

---

# 🎯 Tujuan API Contract

Panduan ini dibuat untuk:

* menjaga kestabilan integrasi frontend ↔ BFF ↔ backend
* mencegah breaking change yang tidak terkendali
* memastikan request/response mudah dipahami
* mempermudah validation, logging, testing, dan observability
* memisahkan contract API dari domain internal

---

# ⚖️ Prinsip Utama

## 1. Contract is a Product

Kontrak API adalah janji antar sistem. Perubahan kontrak HARUS diperlakukan serius.

## 2. Stable, Explicit, Predictable

API harus stabil, eksplisit, dan dapat diprediksi.

## 3. UI-friendly, Not Backend-leaky

Contract untuk UI/BFF harus dirancang sesuai kebutuhan konsumen, bukan sekadar membocorkan bentuk internal backend.

## 4. Backward Compatibility by Default

Perubahan API HARUS diusahakan tetap kompatibel ke belakang.

## 5. Validation at the Boundary

Semua request dan response penting HARUS tervalidasi di boundary.

---

# 🧱 Struktur Dasar Kontrak

Pisahkan dengan jelas:

* **Request DTO** → input ke API
* **Response DTO** → output dari API
* **Domain Entity** → model internal domain

## Rule penting

```text
Request DTO ≠ Domain Entity ≠ Response DTO
```

DTO tidak boleh dianggap sama dengan entity domain.

---

# 🧾 Request Contract Rules

## Rule 1 — Request Harus Eksplisit

Semua field input harus jelas:

* nama
* tipe
* required/optional
* format
* enum/range bila ada

Contoh:

```ts
export interface CreatePaymentRequestDto {
  amount: number;
  methodCode: string;
  orderId: string;
  customerId?: string;
}
```

## Rule 2 — Gunakan Tipe yang Ketat

* hindari `any`
* hindari union yang terlalu longgar tanpa alasan
* gunakan enum/string union bila field punya pilihan terbatas

## Rule 3 — Jangan Kirim Field yang Tidak Dibutuhkan

Request harus minimal dan sesuai tujuan endpoint.

## Rule 4 — Validasi Wajib

Semua request HARUS divalidasi di boundary:

* type
* required field
* format
* enum
* range
* length

---

# 📤 Response Contract Rules

## Rule 1 — Response Harus Konsisten

Response harus memiliki struktur yang mudah dipahami dan konsisten antar endpoint.

## Rule 2 — Kembalikan Hanya Data yang Dibutuhkan

Jangan expose field internal yang tidak dipakai client.

## Rule 3 — Gunakan Shape yang Ramah Konsumen

Response untuk UI/BFF harus mudah dipakai tanpa parsing/mapping berlebihan di sisi konsumen.

Contoh:

```ts
export interface PaymentResponseDto {
  transactionId: string;
  status: 'pending' | 'success' | 'failed';
  amount: number;
  paymentMethod: string;
}
```

## Rule 4 — Gunakan `null` dan `optional` dengan Disiplin

* gunakan `optional` jika field bisa tidak hadir
* gunakan `null` jika field selalu ada tetapi nilainya bisa kosong
* jangan campur keduanya tanpa alasan jelas

---

# 🧠 DTO Design Rules

## Rule 1 — DTO = Contract, bukan Domain Model

DTO boleh mengikuti kebutuhan integrasi, bukan struktur domain internal.

## Rule 2 — Gunakan Suffix yang Jelas

Disarankan menggunakan penamaan seperti:

* `CreatePaymentRequestDto`
* `CreatePaymentResponseDto`
* `PaymentPartnerResponseDto`

## Rule 3 — Satu DTO, Satu Tujuan

Jangan gunakan satu DTO besar untuk banyak endpoint jika shape-nya berbeda.

## Rule 4 — Nested Object Harus Terkontrol

Gunakan nested structure hanya jika memang memperjelas kontrak.
Hindari nesting terlalu dalam tanpa manfaat.

---

# 🔁 Mapping Rules

Mapping HARUS eksplisit:

```text
Request DTO → Domain Input
Domain Output → Response DTO
Upstream Response DTO → Domain/BFF Model → UI Response DTO
```

## Rule:

* jangan expose raw upstream response ke UI
* mapping dilakukan di layer yang tepat (repository/mapper/BFF adapter)
* UI tidak boleh menjadi tempat mapping contract backend mentah

---

# 🏷️ Naming Convention

## Field Naming

Gunakan naming yang konsisten dalam satu contract.

### Disarankan untuk contract internal/BFF:

* `camelCase`

### Jika upstream memakai format lain:

* mapping di adapter/mapper
* jangan sebarkan inconsistency naming ke seluruh codebase

Contoh:

❌ Buruk:

```ts
{
  transaction_id: '123',
  paymentStatus: 'SUCCESS',
  payment_method_code: 'VA'
}
```

✅ Baik (setelah normalisasi):

```ts
{
  transactionId: '123',
  paymentStatus: 'success',
  paymentMethodCode: 'VA'
}
```

---

# 🔐 Security Rules untuk Contract

## Rule 1 — Jangan Expose Sensitive Field

Dilarang mengekspos ke client:

* token internal
* refresh token
* credential
* secret key
* internal trace detail sensitif
* internal backend URL

## Rule 2 — Masking Bila Diperlukan

Field sensitif yang memang perlu tampil harus dimasking.

Contoh:

* phoneNumberMasked
* emailMasked
* cardLast4

## Rule 3 — Error Contract Harus Aman

Response error tidak boleh membocorkan stack trace atau detail internal.

---

# 🚨 Error Response Contract

Semua endpoint HARUS memiliki kontrak error yang konsisten.

Contoh minimum:

```ts
export interface ErrorResponseDto {
  code: string;
  message: string;
  correlationId?: string;
  fields?: Record<string, string>;
}
```

## Rule:

* `code` WAJIB stabil
* `message` aman untuk konsumen
* `fields` digunakan untuk validation error jika relevan
* `correlationId` disertakan untuk debugging jika memungkinkan

Dokumen `12-error-handling.md` HARUS menjadi acuan tambahan.

---

# 🌐 HTTP Semantics Rules

## Rule 1 — Gunakan HTTP Status yang Tepat

* `200` → success read/update yang berhasil
* `201` → resource berhasil dibuat
* `202` → accepted / async processing
* `204` → no content
* `400` → request invalid
* `401` → unauthenticated
* `403` → forbidden
* `404` → not found
* `409` → conflict
* `422` → semantic validation tertentu
* `429` → too many requests
* `500+` → server/upstream problem

## Rule 2 — Jangan Menyembunyikan Error di Status 200

Kecuali kontrak legacy mengharuskan, hindari pola:

```ts
{ success: false, error: '...' }
```

pada HTTP 200 untuk error nyata.

## Rule 3 — 202 untuk Async Workflow

Gunakan `202 Accepted` bila proses belum selesai dan akan dilanjutkan async.

Contoh response:

```ts
{
  requestId: 'req_123',
  status: 'processing'
}
```

---

# 📚 Pagination, Filtering, Sorting

Jika endpoint list mendukung data besar, kontrak HARUS eksplisit.

## Pagination Response yang disarankan:

```ts
export interface PaginatedResponseDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
```

## Rule:

* jangan gunakan bentuk pagination berbeda-beda tanpa alasan kuat
* field metadata pagination harus konsisten antar endpoint list

## Filtering/Sorting

Gunakan parameter yang jelas:

* `page`
* `pageSize`
* `sortBy`
* `sortOrder`
* filter spesifik lain

---

# 🔄 Versioning Rules

## Rule 1 — Versioning untuk Breaking Change

Jika ada breaking change, HARUS ada strategi versioning.

Contoh:

* `/api/v1/...`
* `/api/v2/...`

## Rule 2 — Additive Change Lebih Diutamakan

Utamakan perubahan yang tidak merusak kontrak lama:

* menambah field optional
* menambah endpoint baru

## Rule 3 — Jangan Mengubah Makna Field Lama Diam-diam

Perubahan semantik field lama tanpa versioning adalah breaking change.

## Rule 4 — Deprecation Harus Jelas

Jika suatu field/endpoint akan dihapus:

* beri masa transisi
* dokumentasikan deprecations
* beri timeline migrasi bila memungkinkan

---

# ♻️ Backward Compatibility Rules

## Perubahan yang umumnya aman:

* tambah field optional
* tambah enum value **hanya jika consumer siap**
* tambah endpoint baru

## Perubahan yang berisiko breaking:

* rename field
* hapus field
* ubah type field
* ubah makna/status enum
* ubah struktur nested
* ubah default behavior tanpa dokumentasi

## Rule:

Setiap perubahan kontrak HARUS dinilai dari sudut pandang consumer, bukan provider saja.

---

# 📡 Observability & Contract

## Rule 1 — Contract Harus Mendukung Tracing Aman

Response error atau async flow sebaiknya dapat menyertakan `correlationId`/`requestId` jika relevan dan aman.

## Rule 2 — Logging Contract Change

Perubahan kontrak penting HARUS mudah dilacak dalam release note/changelog.

## Rule 3 — Jangan Log Payload Sensitif Mentah

Observability harus tetap mematuhi security guideline.

Dokumen `08-observability-guideline.md` dan `05-security-guideline.md` HARUS menjadi acuan tambahan.

---

# 🧪 Testing Rules untuk Contract

WAJIB ada test untuk:

* request validation
* response mapping
* error response shape
* optional/null field behavior
* backward compatibility untuk contract penting
* pagination/filter/sorting behavior bila ada

## Disarankan:

* contract test untuk endpoint penting
* snapshot test terbatas untuk shape DTO yang stabil (dengan hati-hati)
* integration test di BFF/route handler untuk memastikan response sesuai kontrak

Dokumen `04-testing-pattern.md` HARUS menjadi acuan tambahan.

---

# 🧭 BFF-specific Contract Rules

Untuk endpoint BFF:

## Rule 1 — Normalize Upstream Complexity

BFF HARUS menyederhanakan kompleksitas banyak upstream menjadi contract yang lebih bersih.

## Rule 2 — Jangan Bocorkan Coupling ke Upstream

Jika upstream berubah, usahakan UI tidak perlu berubah selama contract BFF bisa dipertahankan.

## Rule 3 — Async Flow Harus Eksplisit

Untuk event-driven/async process, kontrak harus mendukung status seperti:

* `pending`
* `processing`
* `completed`
* `failed`

Dokumen `11-bff-pattern.md` HARUS menjadi acuan tambahan.

---

# 🚫 Anti-Pattern (DILARANG KERAS)

❌ Menggunakan domain entity langsung sebagai request/response contract
❌ Mengekspos raw upstream payload ke UI
❌ Mengubah field lama diam-diam tanpa versioning
❌ Menggunakan `any` dalam DTO contract
❌ Kontrak error yang tidak konsisten antar endpoint
❌ HTTP 200 untuk semua jenis error nyata tanpa alasan legacy yang sah
❌ Naming field campur aduk tanpa normalisasi
❌ Mengekspos field sensitif/internal ke client
❌ Response list tanpa metadata pagination yang jelas saat dibutuhkan
❌ Menambah breaking change tanpa rencana migrasi

---

# ✅ Best Practice

* pisahkan Request DTO, Domain Entity, dan Response DTO
* desain response sesuai kebutuhan consumer
* gunakan naming konsisten (`camelCase` untuk internal/BFF)
* normalisasi upstream inconsistency di mapper
* gunakan error response yang stabil dan aman
* utamakan additive change dibanding breaking change
* dokumentasikan versioning dan deprecation
* uji kontrak penting secara otomatis
* jaga contract tetap kecil, eksplisit, dan dapat diprediksi

---

# ⚠️ Enforcement (Kiro Steering Rule)

Semua AI Agent dan Developer:

* WAJIB menjaga kestabilan kontrak API
* WAJIB memisahkan DTO dari domain entity
* DILARANG membuat breaking change tanpa strategi versioning/deprecation yang jelas
* WAJIB mendesain request/response yang eksplisit, aman, dan mudah dikonsumsi
* DILARANG mengekspos detail internal backend/upstream ke consumer
* WAJIB memastikan error contract, pagination, filtering, dan async response bersifat konsisten bila relevan

Jika ada konflik antara kecepatan implementasi vs stabilitas kontrak:
👉 **stabilitas kontrak harus diprioritaskan**

Jika ada konflik dengan dokumen lain:
👉 gunakan dokumen ini sebagai **sumber kebenaran utama untuk keputusan API contract**

---

# 🏁 Kesimpulan

API contract adalah fondasi integrasi yang sehat antara frontend, BFF, dan backend.

Dengan mengikuti panduan ini:

* integrasi menjadi lebih stabil
* perubahan lebih aman
* testing lebih mudah
* observability lebih kuat
* risiko breaking change menurun
* sistem lebih siap untuk skala enterprise
