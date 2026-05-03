---
inclusion: always
---

# 🚨 Error Handling Guideline (Steering)

Dokumen ini adalah **standar error handling WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Tujuan utama dokumen ini adalah memastikan bahwa seluruh error pada sistem ditangani secara:

* konsisten
* aman
* dapat diobservasi
* mudah diuji
* ramah terhadap user
* selaras dengan Clean Architecture

Dokumen ini berlaku untuk seluruh layer:

* `core`
* `infrastructure`
* `presentation`
* `app`
* `BFF / route handler`

---

# 🎯 Tujuan Error Handling

Panduan ini dibuat untuk:

* mencegah error handling yang tersebar dan tidak konsisten
* memastikan error tidak bocor sebagai detail internal
* membedakan error bisnis, teknis, validasi, dan authorization
* memastikan user menerima pesan yang tepat
* memastikan tim engineering menerima log dan trace yang cukup untuk debugging

---

# ⚖️ Prinsip Utama

## 1. Error Harus Terklasifikasi

Setiap error HARUS masuk ke kategori yang jelas.

## 2. Fail Securely

Saat error terjadi, sistem HARUS gagal dengan aman.

## 3. User Message ≠ Internal Error Detail

Pesan untuk user tidak boleh sama dengan detail internal error.

## 4. Error Tidak Boleh Hilang Diam-diam

Semua error penting HARUS tercatat atau terobservasi.

## 5. Error Handling Harus Konsisten Antar Layer

Setiap layer memiliki tanggung jawab error handling yang berbeda dan tidak boleh overlap sembarangan.

---

# 🧩 Klasifikasi Error

Minimal gunakan kategori berikut:

## 1. Validation Error

Terjadi ketika input tidak valid.

Contoh:

* field wajib kosong
* format email salah
* parameter query tidak valid

## 2. Business Error

Terjadi ketika aturan bisnis tidak terpenuhi.

Contoh:

* saldo tidak cukup
* binding tidak diizinkan
* status transaksi tidak sesuai

## 3. Authorization Error

Terjadi ketika user tidak memiliki hak akses.

Contoh:

* token valid tapi role tidak cukup
* akses resource milik user lain

## 4. Authentication Error

Terjadi ketika user/session tidak valid.

Contoh:

* token expired
* token invalid
* session tidak ada

## 5. Not Found Error

Terjadi ketika resource tidak ditemukan.

Contoh:

* order tidak ditemukan
* data profil tidak ada

## 6. Technical / Infrastructure Error

Terjadi karena gangguan teknis.

Contoh:

* API timeout
* network error
* upstream 5xx
* parsing gagal

## 7. Unexpected Error

Terjadi ketika ada kondisi yang tidak diprediksi.

Contoh:

* null access
* invariant broken
* unknown exception

---

# 🏗️ Responsibility per Layer

## Core

### Boleh:

* mendefinisikan error domain
* melempar / mengembalikan error bisnis terstruktur
* mengelompokkan hasil ke dalam `DomainResult`

### Dilarang:

* membuat pesan UI
* mengetahui toast/modal/error page
* melakukan logging platform-specific

## Infrastructure

### Boleh:

* menangkap error teknis dari API/storage/external service
* mapping error teknis ke bentuk yang terstruktur
* menambahkan context observability/logging

### Dilarang:

* menentukan wording final untuk user
* menaruh business rule di error mapping teknis

## Presentation

### Boleh:

* mapping error ke UX (toast, inline message, empty state, modal)
* menentukan perilaku UI saat loading/error/retry
* menerjemahkan error code ke text i18n

### Dilarang:

* membaca raw error teknis lalu menampilkan semuanya ke user
* memutuskan business rule inti di UI

## BFF / Route Handler

### Boleh:

* memvalidasi input
* menormalkan error response
* mengubah exception internal menjadi HTTP response aman
* menambahkan correlationId / observability metadata

### Dilarang:

* mengekspos stack trace
* mengembalikan raw upstream error tanpa sanitasi

---

# 🧱 Standard Error Model

Disarankan menggunakan model error yang konsisten di seluruh aplikasi.

Contoh field minimum:

```ts
export interface AppError {
  type:
    | 'validation'
    | 'business'
    | 'authentication'
    | 'authorization'
    | 'not_found'
    | 'technical'
    | 'unexpected';
  code: string;
  message: string;
  userMessage?: string;
  retryable?: boolean;
  cause?: unknown;
}
```

## Rule:

* `message` = untuk internal/dev context
* `userMessage` = opsional, aman untuk user
* `code` = WAJIB stabil dan dapat dipakai untuk mapping/logging/testing
* `cause` = tidak boleh langsung dibocorkan ke UI

---

# 🔄 DomainResult Pattern (WAJIB)

Untuk repository dan boundary tertentu, gunakan `DomainResult<T>` sebagai kontrak hasil.

## Rule:

* repository → mengembalikan `DomainResult<T>`
* use case → unwrap/transform dengan aman
* ViewModel/UI → konsumsi hasil yang sudah dinormalisasi

## Tujuan:

* menghindari `throw` liar di semua tempat
* membuat success/error path eksplisit
* mempermudah testing

---

# 🧠 Error Code Convention

Gunakan error code yang:

* stabil
* eksplisit
* dapat dicari di log
* tidak ambigu

Contoh:

* `AUTH_TOKEN_EXPIRED`
* `AUTH_UNAUTHORIZED`
* `PAYMENT_INSUFFICIENT_BALANCE`
* `PAYMENT_PARTNER_TIMEOUT`
* `COMMON_VALIDATION_FAILED`
* `COMMON_NOT_FOUND`
* `COMMON_UNEXPECTED_ERROR`

## Rule:

* jangan gunakan code generik seperti `ERROR_1`
* jangan hanya bergantung pada message string

---

# 🌐 HTTP & BFF Error Mapping

## HTTP status mapping yang disarankan

* `400` → validation error
* `401` → authentication error
* `403` → authorization error
* `404` → not found
* `409` → conflict / business conflict tertentu
* `422` → semantic validation / domain validation tertentu
* `429` → rate limit
* `500` → unexpected/internal error
* `502/503/504` → upstream / service availability / timeout

## Rule:

* jangan asal semua error menjadi `500`
* jangan kembalikan `200` untuk error bisnis hanya karena “lebih mudah di UI”, kecuali kontrak legacy mengharuskan dan didokumentasikan jelas
* response error HARUS aman dan konsisten

Contoh respons aman:

```ts
return NextResponse.json(
  {
    code: 'AUTH_UNAUTHORIZED',
    message: 'Unauthorized',
    correlationId,
  },
  { status: 401 },
);
```

---

# 🖥️ UI Error Handling Pattern

## Rule 1 — Bedakan jenis tampilan error

UI harus membedakan:

* inline validation error
* page-level error
* modal/dialog error
* toast/snackbar error
* retryable section error

## Rule 2 — User-facing message harus jelas

Pesan user harus:

* jelas
* singkat
* tidak teknis
* actionable bila memungkinkan

✅ Contoh:

* “Sesi Anda telah berakhir. Silakan login kembali.”
* “Terjadi gangguan saat memproses pembayaran. Coba lagi beberapa saat.”

❌ Dilarang:

* “TypeError: Cannot read properties of undefined”
* “AxiosError 500 Internal Server Error from partner-x”

## Rule 3 — Gunakan i18n

Seluruh user-facing error message HARUS menggunakan key translasi.

---

# 🧪 Validation Error Handling

## UI Layer

* tampilkan pesan dekat field bila memungkinkan
* fokuskan pada field error yang relevan

## BFF/API Layer

* validasi tetap WAJIB dilakukan walau UI sudah memvalidasi
* response validation error harus terstruktur

Contoh:

```ts
{
  code: 'COMMON_VALIDATION_FAILED',
  fields: {
    email: 'invalid_email',
    amount: 'required',
  },
}
```

## Rule:

* jangan hanya kirim message generik bila field-level error tersedia dan berguna

---

# 🔁 Retry Handling

## Rule 1 — Hanya retry untuk error yang masuk akal

Retry cocok untuk:

* timeout
* network transient failure
* temporary upstream unavailability

## Rule 2 — Jangan retry untuk semua error

❌ Jangan retry otomatis untuk:

* validation error
* authorization error
* business rule failure
* duplicate-sensitive operation tanpa idempotency

## Rule 3 — Retryability harus eksplisit

Error yang retryable sebaiknya memiliki flag seperti:

```ts
retryable: true
```

---

# 🧾 Logging & Observability untuk Error

Semua error penting HARUS dapat diobservasi.

## Wajib dicatat:

* `code`
* `type`
* `correlationId`
* route/feature
* upstream target (jika ada)
* severity
* retryable atau tidak

## Dilarang log:

* password
* token
* OTP
* CVV
* PII sensitif tanpa masking

## Rule:

* userMessage tidak harus sama dengan log message
* log internal boleh lebih detail, tapi tetap aman

Dokumen `05-security-guideline.md` dan `08-observability-guideline.md` HARUS menjadi acuan tambahan.

---

# 🔐 Security Rules

## Rule 1 — Jangan Bocorkan Detail Internal

Jangan kirim ke UI:

* stack trace
* class name exception
* internal endpoint URL
* SQL/raw backend message
* payload sensitif

## Rule 2 — Authentication/Authorization Error Harus Disamakan Secukupnya

Dalam kasus tertentu, detail error auth harus dibatasi agar tidak membantu enumerasi/abuse.

## Rule 3 — Error Page Aman

Halaman error tidak boleh membocorkan env, config, atau metadata sensitif.

---

# 🧰 Infrastructure Error Mapping Pattern

Pada repository/adapter, error teknis HARUS dinormalisasi.

Contoh tanggung jawab repository:

* timeout → `technical` + `*_TIMEOUT`
* 404 upstream → `not_found` jika semantik sesuai
* 401 upstream → `authentication` / `authorization` sesuai konteks
* parse failure → `technical`

## Rule:

* jangan lempar raw axios/fetch error ke UI layer
* gunakan mapper/helper error terpusat bila memungkinkan

---

# 🧩 ViewModel Error Handling Pattern

ViewModel bertanggung jawab untuk mengubah hasil/error menjadi state UI yang mudah dipakai.

Contoh state:

* `isError`
* `errorCode`
* `errorMessageKey`
* `canRetry`
* `showErrorModal`

## Rule:

* ViewModel tidak boleh membuat business rule baru dari error
* ViewModel boleh menentukan **bagaimana UI bereaksi**, bukan **apa aturan bisnisnya**

---

# 🧪 Testing Rules untuk Error Handling

WAJIB ada test untuk:

* success path
* validation error
* business error
* technical error
* unexpected error
* retryable vs non-retryable
* mapping HTTP status → AppError/domain error
* UI reaction terhadap error penting

## Contoh target test:

* repository mengubah timeout menjadi code yang benar
* use case meng-unwrapping DomainResult dengan benar
* ViewModel memunculkan error state yang benar
* route handler tidak membocorkan stack trace
* redirect/auth error mengembalikan response yang aman

Dokumen `04-testing-pattern.md` HARUS menjadi acuan tambahan.

---

# 🚫 Anti-Pattern (DILARANG KERAS)

❌ Menampilkan raw exception ke user
❌ Menangkap semua error lalu mengabaikannya diam-diam
❌ Menggunakan message string sebagai satu-satunya dasar logika
❌ Semua error dipaksa menjadi generic tanpa code
❌ Semua error dilempar sebagai `500`
❌ Retry buta pada operasi non-idempotent
❌ Logging token / secret / payload sensitif saat error
❌ Meletakkan logic mapping error user message di banyak tempat tanpa standard
❌ Melempar raw axios/fetch error ke ViewModel/UI
❌ Menggunakan `try/catch` berlapis tanpa purpose yang jelas

---

# ✅ Best Practice

* gunakan klasifikasi error yang jelas
* gunakan `code` yang stabil
* gunakan `DomainResult<T>` di boundary yang relevan
* normalkan error teknis di infrastructure
* normalkan HTTP response di BFF/route handler
* map error ke UX di presentation/ViewModel
* gunakan i18n untuk user message
* log error dengan correlationId dan context yang cukup
* bedakan retryable dan non-retryable
* uji seluruh jalur error penting

---

# ⚠️ Enforcement (Kiro Steering Rule)

Semua AI Agent dan Developer:

* WAJIB menggunakan pola error handling yang konsisten
* WAJIB memastikan error penting memiliki code yang jelas dan dapat diuji
* DILARANG membocorkan detail internal ke UI
* DILARANG membiarkan error penting hilang tanpa logging/observability
* WAJIB memisahkan internal message dan user-facing message
* WAJIB memikirkan retryability, security impact, dan user experience pada setiap error path

Jika ada konflik antara kecepatan implementasi vs kualitas error handling:
👉 **pilih penanganan error yang aman, eksplisit, dan mudah diobservasi**

Jika ada konflik dengan dokumen lain:
👉 gunakan dokumen ini sebagai **sumber kebenaran utama untuk keputusan error handling**

---

# 🏁 Kesimpulan

Error handling bukan sekadar `try/catch`, tetapi bagian inti dari reliability, security, dan user experience.

Dengan mengikuti panduan ini:

* error menjadi lebih konsisten
* user mendapat pengalaman yang lebih baik
* debugging lebih cepat
* security lebih terjaga
* sistem lebih siap untuk skala enterprise
