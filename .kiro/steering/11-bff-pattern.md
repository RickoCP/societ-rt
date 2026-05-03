---
inclusion: fileMatch
fileMatchPattern: "src/app/api/**"
---

# 🧩 Backend for Frontend (BFF) Pattern (Steering)

Dokumen ini adalah **standar BFF WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Dalam proyek ini, **Next.js** dapat berperan sebagai **Backend for Frontend (BFF)** untuk:

* mengorkestrasi kebutuhan data UI
* menyederhanakan integrasi frontend ke banyak backend
* menegakkan security boundary
* mengontrol contract API yang dikonsumsi UI
* mengoptimalkan performa dan observability

Dokumen ini berlaku untuk seluruh implementasi **Route Handler**, **Server Actions** (jika digunakan dengan disiplin), dan lapisan server-side orchestration lain di Next.js.

---

# 🎯 Tujuan BFF

BFF digunakan untuk:

* menyatukan banyak backend menjadi contract yang ramah UI
* mencegah frontend memanggil terlalu banyak service langsung
* menyederhanakan auth, error mapping, dan response shape
* mengurangi coupling UI ke backend internal
* mengontrol caching, logging, tracing, dan fallback di satu tempat

---

# ⚖️ Prinsip Utama

## 1. BFF adalah Orchestration Layer

BFF bertugas untuk:

* compose data
* validasi input di boundary
* panggil satu atau banyak backend
* mapping response ke contract frontend
* enforce auth/security policy di boundary

BFF **bukan** tempat utama business logic domain.

## 2. Frontend Tidak Bergantung Langsung pada Backend Internal

UI idealnya berbicara ke BFF, bukan ke banyak service internal secara langsung.

## 3. Contract UI-centric

Response dari BFF harus didesain sesuai kebutuhan UI, bukan sekadar proxy mentah dari backend.

## 4. Error dan Security Harus Terkontrol

BFF adalah titik kontrol untuk:

* auth/session propagation
* request validation
* error normalization
* observability

## 5. BFF Tidak Boleh Menjadi Monolit Tak Terkendali

BFF harus tetap tipis, modular, dan terstruktur. Jangan menjadikannya tempat semua logic dilempar.

---

# 🏗️ Posisi BFF dalam Arsitektur

```text
UI (RSC / Client Component)
  → Next.js BFF (Route Handler / Server Layer)
  → UseCase / BFF Service / Repository Adapter
  → Backend APIs / External Services / Kafka-facing services
```

## Rule penting

* UI tidak memanggil service internal sensitif secara langsung bila BFF dibutuhkan
* BFF menjadi boundary antara UI dan backend ecosystem

---

# 🧠 Tanggung Jawab BFF

## ✅ Boleh

* request validation
* auth/session extraction
* token/header propagation terkontrol
* orchestration antar service
* response aggregation
* response shaping untuk UI
* caching strategy
* observability (log/metrics/trace)
* timeout, fallback, dan retry terbatas
* idempotency support untuk operasi tertentu

## ❌ Dilarang

* domain business logic inti yang seharusnya milik backend/domain service
* logic yang terlalu besar dan sulit diuji
* proxy mentah semua backend tanpa kontrol
* forward semua header/request tanpa whitelist
* expose detail internal backend ke frontend

---

# 🧱 Struktur Folder yang Direkomendasikan

Jika proyek menggunakan Next.js sebagai BFF, disarankan pola seperti berikut:

```text
src/
├── app/
│   └── api/
│       └── [feature]/
│           └── route.ts              # Route Handler (HTTP boundary)
│
├── core/
│   └── domains/
│       └── [domain]/
│           ├── entities/
│           ├── usecases/
│           └── repositories/
│
├── infrastructure/
│   ├── networking/
│   ├── repositories/
│   ├── observability/
│   └── security/
│
└── presentation/
    └── features/
```

## Rule

* `route.ts` hanya menjadi HTTP boundary
* orchestration logic tidak boleh menumpuk di route handler
* gunakan use case / service orchestration yang testable

---

# 🔄 Request Flow di BFF

Flow yang disarankan:

```text
Incoming Request
  → Validate Input
  → Resolve Auth Context
  → Resolve UseCase / Orchestrator
  → Call backend(s)
  → Aggregate / Map Response
  → Return safe UI contract
```

---

# 🧾 Contract Design Rules

## Rule 1 — UI-facing Contract

Contract response BFF HARUS didesain untuk kebutuhan UI.

✅ Contoh:

* field yang sudah dirapikan
* status yang sudah dinormalisasi
* data dari beberapa backend digabung menjadi satu response

❌ Dilarang:

* response backend mentah langsung dilempar ke UI tanpa alasan

## Rule 2 — Stable Contract

BFF contract harus lebih stabil daripada backend internal agar UI tidak sering pecah saat backend berubah.

## Rule 3 — DTO dan Mapper Wajib

Gunakan DTO dan mapper secara eksplisit:

```text
Backend Response DTO → Domain/BFF Model → UI Response DTO
```

---

# 🔐 Auth & Session Propagation

## Rule 1 — Auth Diambil di Boundary

Auth/session context diambil di server boundary (BFF), bukan dipercaya dari client state semata.

## Rule 2 — Propagation Terkontrol

Header/token yang diteruskan ke backend HARUS melalui whitelist.

✅ boleh forward:

* authorization
* correlation ID
* locale
* idempotency key (jika relevan)

❌ dilarang:

* forward semua header mentah
* forward cookie tanpa alasan jelas

## Rule 3 — UI Tidak Mengetahui Detail Auth Internal

BFF harus menyembunyikan kompleksitas auth backend dari UI jika memungkinkan.

---

# 🛡️ Security Rules untuk BFF

## Rule 1 — Input Validation Wajib

Semua input dari:

* query
* params
* body
* header
* cookie

HARUS dianggap tidak terpercaya dan divalidasi.

## Rule 2 — Error Normalization

Jangan expose:

* stack trace
* internal URL backend
* error object mentah
* sensitive metadata

## Rule 3 — Redirect Validation

Jika BFF menangani redirect/return URL, validasi open redirect HARUS dilakukan.

## Rule 4 — Rate Limiting / Abuse Protection

Untuk endpoint sensitif, BFF sebaiknya mendukung proteksi abuse sesuai kemampuan platform.

## Rule 5 — Secret Tetap di Server

Secret, API key, private token, dan credential HARUS tetap berada di server/BFF.

---

# ⏱️ Timeout, Retry, Fallback

## Rule 1 — Timeout Wajib

Semua call eksternal dari BFF HARUS punya timeout.

## Rule 2 — Retry Selektif

Retry hanya untuk:

* request aman/idempotent
* error yang memang transient

Jangan retry otomatis untuk operasi transaksional sensitif tanpa desain idempotency yang benar.

## Rule 3 — Fallback

BFF boleh memiliki fallback untuk:

* optional data
* enhancement data
* rekomendasi/non-critical widget

Tetapi fallback tidak boleh menyembunyikan kegagalan kritikal secara diam-diam.

---

# 🧠 Caching Strategy di BFF

## Rule 1 — Cache Sesuai Jenis Data

* data publik/statis → boleh cache lebih agresif
* data user-specific/sensitif → cache hati-hati
* data transaksional → cache minimal atau tidak sama sekali jika berisiko stale

## Rule 2 — Caching Harus Eksplisit

Jangan mengandalkan caching implisit tanpa memahami dampaknya.

## Rule 3 — Hindari Data Leak

Jangan sampai cache response user A dikirim ke user B.

## Rule 4 — Revalidation

Gunakan pendekatan cache/revalidate yang sesuai kebutuhan UI dan karakter data.

---

# 📡 Observability di BFF

## WAJIB ada:

* structured logging
* correlation ID
* metrics endpoint/service latency
* tracing untuk external call
* error reporting

## Log minimal harus memuat:

* route/feature
* correlationId
* upstream target
* response status
* latency

## Trace minimal harus mencakup:

* incoming request span
* upstream service call span
* mapping/fallback span jika penting

Dokumen `08-observability-guideline.md` HARUS menjadi acuan tambahan.

---

# 📊 Performance Rules untuk BFF

## Rule 1 — Hindari Waterfall Jika Tidak Perlu

Jika beberapa call independen, gunakan paralelisasi.

## Rule 2 — Batasi Aggregation Complexity

BFF yang terlalu banyak compose call bisa menambah latency. Komposisi harus tetap terukur.

## Rule 3 — Kembalikan Hanya yang Dibutuhkan UI

Jangan kirim payload besar jika UI tidak perlu.

## Rule 4 — BFF Bukan Tempat Query Mahal Tak Terkendali

Jika orchestration terlalu berat, pertimbangkan backend aggregator/service khusus.

Dokumen `09-performance-guideline.md` HARUS menjadi acuan tambahan.

---

# 🧪 Testing Rules untuk BFF

## WAJIB diuji:

* input validation
* auth behavior
* success path
* upstream failure path
* timeout/fallback behavior
* response mapping
* error normalization
* security-sensitive path

## Jenis test yang disarankan:

* unit test untuk mapper/use case/orchestrator
* integration test untuk route handler dengan mock dependency
* e2e test untuk flow user kritikal yang melewati BFF

Dokumen `04-testing-pattern.md` HARUS menjadi acuan tambahan.

---

# 🧩 BFF dan DI Pattern

Jika BFF menggunakan use case/service orchestration:

* dependency HARUS di-inject
* jangan import implementation konkret langsung ke route handler bila bisa dihindari
* route handler idealnya resolve dependency dari composition root atau memanggil facade terstruktur

Dokumen `06-di-pattern.md` HARUS menjadi acuan tambahan.

---

# 🔄 Event-Driven / Kafka Readiness

BFF boleh berintegrasi dengan arsitektur event-driven secara **tidak langsung** atau sebagai orchestrator awal.

## Rule 1 — BFF Bukan Broker

BFF bukan pengganti Kafka/broker/event processor.

## Rule 2 — Cocok untuk Trigger / Submit / Status Polling

BFF cocok untuk:

* menerima request dari UI
* menghasilkan command/request ke backend service
* mengembalikan acknowledgement/status awal
* menyediakan endpoint polling/read model

## Rule 3 — Async UX Harus Jelas

Jika backend async/event-driven:

* UI harus menerima status yang jelas (`pending`, `processing`, `completed`, `failed`)
* BFF harus mengembalikan contract yang mendukung UX async tersebut

## Rule 4 — Correlation & Idempotency

Untuk flow async/transaksional:

* gunakan correlation ID
* pertimbangkan idempotency key
* jangan lakukan retry buta yang memicu duplikasi event

## Rule 5 — Jangan Memindahkan Event Processing ke BFF

BFF tidak boleh menjadi tempat business workflow async yang seharusnya dijalankan oleh worker/service backend.

---

# 🔁 Idempotency Pattern

Untuk operasi yang berisiko duplicate submission:

* payment submit
* order submit
* binding request tertentu
* action retriable yang sensitif

BFF HARUS mempertimbangkan:

* `Idempotency-Key` atau mekanisme setara
* mapping response duplicate menjadi hasil yang aman/terprediksi
* penyimpanan/validasi idempotency sesuai arsitektur backend

## Rule

Idempotency bukan sekadar header; harus didukung kontrak backend juga.

---

# 🧭 Kapan Menggunakan BFF

## Gunakan BFF jika:

* UI perlu menggabungkan banyak backend
* perlu normalisasi contract untuk frontend
* perlu boundary auth/security yang kuat
* perlu menyembunyikan kompleksitas backend internal
* perlu observability/caching/error normalization yang terkontrol
* ada kebutuhan platform-specific contract (web/mobile/partner)

## Hindari / pertimbangkan ulang jika:

* frontend hanya butuh satu backend sederhana
* BFF hanya menjadi proxy tipis tanpa value
* orchestration terlalu berat dan seharusnya menjadi backend service sendiri
* tim belum siap mengelola kompleksitas tambahan

---

# 🚫 Anti-Pattern (DILARANG KERAS)

❌ BFF hanya menjadi pass-through mentah tanpa value
❌ Menaruh domain business logic inti di route handler
❌ Forward semua header/cookie ke backend
❌ Expose error internal backend langsung ke UI
❌ Menganggap BFF sebagai pengganti backend domain service
❌ Menambahkan terlalu banyak orchestration hingga latency meledak
❌ Retry buta pada operasi transaksional
❌ Cache response user-specific tanpa isolasi
❌ Menyimpan secret di client padahal bisa disimpan di BFF
❌ Menjadikan BFF sebagai event processor utama untuk workflow async

---

# ✅ Best Practice

* gunakan BFF untuk contract UI-centric
* validasi input di boundary
* normalisasi error dan response
* propagasikan auth/header secara whitelist
* gunakan timeout, trace, metrics, dan structured log
* compose backend call seperlunya, bukan berlebihan
* desain async UX yang jelas untuk backend event-driven
* terapkan idempotency untuk operasi sensitif
* jaga BFF tetap modular, tipis, dan testable

---

# ⚠️ Enforcement (Kiro Steering Rule)

Semua AI Agent dan Developer:

* WAJIB menggunakan BFF hanya jika memberi nilai arsitektural yang jelas
* WAJIB menjaga BFF sebagai orchestration layer, bukan domain monolith baru
* WAJIB menambahkan validation, observability, dan error normalization pada endpoint penting
* DILARANG membuat route handler yang berisi logic besar, tidak teruji, atau bocor ke detail backend internal
* DILARANG menambahkan pola yang melemahkan security, traceability, atau performance

Jika ada konflik antara kecepatan implementasi vs disiplin BFF:
👉 **pilih desain yang modular, aman, dan mudah diobservasi**

Jika ada konflik dengan dokumen lain:
👉 gunakan dokumen ini sebagai **sumber kebenaran utama untuk keputusan BFF**

---

# 🏁 Kesimpulan

BFF adalah pola strategis untuk menjembatani UI dan ekosistem backend secara aman, terukur, dan ramah frontend.

Dengan mengikuti panduan ini:

* UI menjadi lebih sederhana
* contract lebih stabil
* security lebih terkontrol
* observability lebih kuat
* integrasi ke arsitektur modern termasuk event-driven menjadi lebih rapi
