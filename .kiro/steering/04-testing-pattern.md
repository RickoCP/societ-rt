---
inclusion: always
---

# 🧪 Testing Pattern (Steering)

Dokumen ini adalah **standar testing WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Semua implementasi HARUS mengikuti pola testing ini untuk menjaga:

* kualitas kode
* kestabilan fitur
* keamanan refactor
* kepercayaan saat release
* konsistensi engineering practice

Dokumen ini berlaku untuk seluruh testing strategy pada proyek berbasis **Next.js + Clean Architecture + DDD**.

---

# 🎯 Tujuan Testing

Panduan ini dibuat untuk:

* memastikan business logic tervalidasi dengan baik
* mencegah regression saat refactor
* memvalidasi boundary antar layer
* memastikan UI kritikal berjalan sesuai ekspektasi
* memastikan fitur sensitif terlindungi oleh automated tests

---

# ⚖️ Prinsip Utama

## 1. Test Pyramid (WAJIB)

Prioritas testing HARUS mengikuti piramida berikut:

1. **Unit Test** → mayoritas
2. **Integration Test** → secukupnya untuk boundary penting
3. **E2E Test** → minimum tapi fokus pada happy path + critical path

## 2. Test the Right Thing

* Unit test untuk logic
* Integration test untuk kolaborasi antar modul
* E2E test untuk flow user penting

## 3. Fast, Deterministic, Isolated

Test HARUS:

* cepat
* konsisten
* tidak bergantung pada network sungguhan
* tidak flaky

## 4. Testing is Part of Definition of Done

Fitur belum selesai jika testing yang relevan belum tersedia.

## 5. Risk-based Testing

Semakin kritikal fitur, semakin tinggi coverage dan kedalaman testing yang dibutuhkan.

---

# 🏗️ Testing Scope per Layer

## Core

WAJIB diuji dengan **unit test**.

Cakupan:

* entity helper / pure function
* mapper
* use case
* domain validation
* domain utility

## Infrastructure

WAJIB diuji dengan **unit test** atau **integration test ringan**.

Cakupan:

* repository implementation
* adapter
* helper infra
* response processing
* error mapping

## Presentation

Diuji dengan:

* unit test untuk komponen penting
* unit test untuk ViewModel
* integration test untuk screen flow jika diperlukan

## App / Middleware

WAJIB diuji jika berisi:

* auth guard
* redirect validation
* route normalization
* security-related behavior

---

# 📐 Testing Pyramid & Prioritas

## 1. Unit Test (WAJIB, prioritas tertinggi)

Digunakan untuk menguji unit kecil secara terisolasi.

Contoh target:

* `UseCase`
* `Mapper`
* `DomainResult`
* `ProcessResponse`
* helper validation
* Zustand slice
* ViewModel logic

## 2. Integration Test

Digunakan untuk menguji interaksi antar bagian.

Contoh target:

* repository + http adapter mock
* screen + viewModel + mocked DI
* middleware helper + route input
* server action / route handler dengan mock dependency

## 3. E2E Test

Digunakan untuk memvalidasi alur end-to-end user yang paling penting.

Contoh target:

* login flow
* checkout/payment flow
* binding/unbinding flow
* redirect after login
* locale switching
* error fallback path penting

---

# 🧰 Tooling yang Direkomendasikan

## Unit / Integration

* **Jest**
* **React Testing Library**

## E2E

* **Playwright**

## Tambahan

* mock/stub internal dependency via DI
* tidak boleh mengandalkan API sungguhan untuk test otomatis default

---

# 📊 Coverage Policy (WAJIB)

## Minimum global coverage

* Statements: **>= 80%**
* Branches: **>= 80%**
* Functions: **>= 80%**
* Lines: **>= 80%**

## Coverage lebih tinggi WAJIB untuk:

* use case kritikal
* auth/security logic
* payment / transaksi
* redirect validation
* middleware helper
* repository error handling

## Rule penting

* coverage tinggi **tidak boleh** dicapai dengan test palsu atau meaningless assertion
* kualitas test lebih penting daripada sekadar angka coverage

---

# ✅ Apa yang WAJIB Diuji

## Use Case

WAJIB ada test untuk:

* happy path
* error path
* edge case penting
* dependency failure

## Mapper

WAJIB ada test untuk:

* field mapping benar
* fallback/default handling bila ada
* response shape abnormal bila relevan

## Repository

WAJIB ada test untuk:

* success response
* error response
* header / payload formation penting
* mapper dipanggil dengan benar

## ViewModel

WAJIB ada test untuk:

* action/mutation dipanggil benar
* state berubah benar
* success path
* error path
* interaction dengan store bila ada

## Screen / Component penting

WAJIB ada test untuk:

* render state utama
* user interaction utama
* conditional UI penting
* accessibility dasar untuk elemen penting

## Middleware / Redirect Helper

WAJIB ada test untuk:

* authorized flow
* unauthorized flow
* invalid redirect ditolak
* safe fallback route

## Security-sensitive feature

WAJIB ada test untuk:

* unauthorized access ditolak
* invalid token ditangani
* invalid input gagal aman
* sanitization / escape helper bekerja sesuai tujuan

---

# 🧪 Pattern per Jenis Test

# 1. Use Case Test Pattern

## Rule:

* mock repository
* jangan test implementation repository di unit test use case
* verifikasi interaksi dependency

Contoh fokus:

* `repository.getData` dipanggil dengan parameter benar
* hasil `DomainResult` di-unwrapping dengan benar
* error diteruskan / ditangani sesuai kontrak

---

# 2. Repository Test Pattern

## Rule:

* mock `HttpProtocol`
* jangan call network sungguhan
* verifikasi endpoint, method, body, headers, mapper, dan error mapping

Fokus:

* request contract benar
* `handleApiRequest` digunakan konsisten
* hasil akhir sesuai `DomainResult<T>`

---

# 3. Mapper Test Pattern

## Rule:

* pure function test
* satu mapper, satu file test
* test sederhana tapi lengkap untuk field penting

---

# 4. ViewModel Test Pattern

## Rule:

* mock use case
* mock Zustand bila diperlukan
* gunakan `@tanstack/react-query` test setup yang stabil
* reset query cache per test

Wajib memastikan:

* mutation/query tidak bocor antar test
* side effect bisa diprediksi

---

# 5. Component / Screen Test Pattern

## Rule:

* test perilaku, bukan implementasi internal
* query elemen berdasarkan role/text/label jika memungkinkan
* hindari assertion terhadap detail implementation yang rapuh

Prioritas assertion:

1. user-visible behavior
2. callback/effect penting
3. conditional rendering

---

# 6. Middleware / Helper Test Pattern

## Rule:

* test pure helper sebanyak mungkin
* pisahkan helper dari Next.js runtime bila memungkinkan agar mudah diuji
* validasi semua edge case path/redirect

---

# 🔌 Dependency Injection & Mocking Rules

## Rule 1 — Semua dependency eksternal di-mock

Yang perlu di-mock sesuai konteks:

* repository pada use case test
* use case pada viewModel test
* DI resolve pada screen test
* HttpProtocol pada repository test
* analytics/logger bila tidak sedang diuji khusus

## Rule 2 — Jangan Mock yang Sedang Diuji

Contoh:

* jika menguji `NamaUseCase`, jangan mock `NamaUseCase`
* mock hanya dependency-nya

## Rule 3 — Gunakan Mock yang Jelas

Mock HARUS:

* eksplisit
* minimal
* mudah dibaca
* tidak menyembunyikan behavior penting

---

# 🧱 React Query Testing Rules

## Rule 1 — Gunakan QueryClient terisolasi

Setiap test HARUS menggunakan `QueryClient` baru.

## Rule 2 — Nonaktifkan Retry di Test

Untuk menghindari flaky test:

* retry sebaiknya dimatikan dalam test setup

## Rule 3 — Bersihkan Cache

Cache HARUS dibersihkan antar test.

## Rule 4 — Jangan Gunakan Network Nyata

Semua query/mutation harus menggunakan dependency mock.

---

# 🗂️ Zustand Testing Rules

## Rule 1 — Reset State per Test

Store HARUS direset pada setiap test agar tidak bocor state.

## Rule 2 — Test Slice Behavior

Yang diuji:

* initial state
* set action
* reset action
* kombinasi action penting

## Rule 3 — Jangan Simpan Business Logic di Store

Jika logic terlalu kompleks untuk store, pindahkan ke use case/helper.

---

# 🌐 UI & Accessibility Testing Rules

## Rule 1 — Uji Interaksi Utama

Komponen dan screen penting harus diuji untuk:

* click
* input
* submit
* disabled/loading/error state

## Rule 2 — Query Berdasarkan Aksesibilitas

Prioritaskan:

* `getByRole`
* `getByLabelText`
* `getByText`

Hindari penggunaan selector rapuh jika tidak perlu.

## Rule 3 — Loading dan Error State

Jika komponen memiliki loading/error state, keduanya WAJIB diuji.

---

# 🛡️ Security-oriented Testing

Untuk fitur sensitif, test HARUS mencakup:

* route tanpa auth ditolak
* redirect invalid ditolak
* token invalid/expired ditangani
* payload abnormal tidak membuat crash yang tidak aman
* sanitization helper tidak membiarkan konten berbahaya lolos bila relevan

Dokumen `05-security-guideline.md` HARUS dijadikan acuan tambahan untuk test security.

---

# 🚦 CI/CD Quality Gate

## Rule 1 — Pipeline Wajib Menjalankan

* lint
* typecheck
* unit test
* coverage
* e2e test (minimal pada branch/release tertentu sesuai strategi tim)

## Rule 2 — Build Gagal jika

* lint gagal
* typecheck gagal
* test gagal
* coverage di bawah threshold

## Rule 3 — Tidak Boleh Skip Test Tanpa Alasan Kuat

Penggunaan:

* `it.skip`
* `describe.skip`
* `test.only`

HARUS dilarang di branch final/merge request production.

---

# 🧾 Naming & Struktur File Test

## Rule penamaan

* `NamaUseCase.test.ts`
* `NamaRepositoryImpl.test.ts`
* `NamaMapper.test.ts`
* `useNamaViewModel.test.tsx`
* `NamaScreen.test.tsx`
* `middleware-utils.test.ts`

## Lokasi

Disarankan salah satu pendekatan berikut secara konsisten:

### Opsi A — Co-located

File test diletakkan dekat file yang diuji.

### Opsi B — Centralized test folders

Gunakan folder `__tests__/` per domain/feature.

## Rule penting

Pilih satu pola dominan dan konsisten di seluruh codebase.

---

# 🚫 Anti-Pattern (DILARANG KERAS)

❌ Mengandalkan API/network sungguhan untuk unit test
❌ Test yang hanya mengejar coverage tanpa assertion bermakna
❌ Mock berlebihan sampai test tidak lagi memvalidasi perilaku nyata
❌ Snapshot berlebihan untuk komponen kompleks tanpa alasan kuat
❌ Test rapuh yang bergantung pada detail DOM/internal implementation
❌ Satu test menguji terlalu banyak hal sekaligus
❌ Shared mutable state antar test
❌ Membiarkan retry/cache menyebabkan flaky test
❌ Merge code penting tanpa test untuk logic kritikal

---

# ✅ Best Practice

* utamakan unit test pada use case, mapper, helper, dan ViewModel
* gunakan integration test untuk boundary yang penting
* gunakan e2e untuk flow bisnis kritikal
* mock dependency eksternal secara eksplisit
* reset semua state/cache antar test
* uji happy path + error path + edge case
* jadikan test sebagai safety net refactor
* prioritaskan test pada auth, payment, redirect, dan logic kritikal

---

# ⚠️ Enforcement (Kiro Steering Rule)

Semua AI Agent dan Developer:

* WAJIB menambahkan test yang relevan untuk setiap fitur baru atau perubahan signifikan
* WAJIB menjaga coverage minimum sesuai standar
* WAJIB menulis test untuk logic kritikal, middleware, redirect helper, auth flow, dan error handling penting
* DILARANG menambahkan implementasi baru tanpa strategi test yang memadai
* DILARANG membuat test palsu, rapuh, atau meaningless hanya demi coverage

Jika ada konflik antara kecepatan implementasi vs kualitas testing:
👉 **kualitas testing harus diprioritaskan untuk fitur kritikal**

Jika ada konflik dengan dokumen lain:
👉 gunakan dokumen ini sebagai **sumber kebenaran utama untuk keputusan testing**

---

# 🏁 Kesimpulan

Testing bukan aktivitas tambahan, tetapi bagian inti dari engineering quality.

Dengan mengikuti panduan ini:

* refactor menjadi lebih aman
* release menjadi lebih percaya diri
* regression menurun
* quality gate lebih kuat
* proyek lebih siap untuk skala enterprise
