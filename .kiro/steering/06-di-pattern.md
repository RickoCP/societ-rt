---
inclusion: always
---

# 🧩 Dependency Injection Pattern (Steering)

Dokumen ini adalah **standar Dependency Injection (DI) WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Proyek ini menggunakan **Awilix** sebagai DI container utama.

Semua dependency HARUS mengikuti panduan ini untuk menjaga:

* loose coupling
* testability
* scalability
* boundary layer tetap bersih
* konsistensi registrasi dan resolusi dependency

Dokumen ini berlaku untuk seluruh layer yang menggunakan dependency: `infrastructure`, `presentation`, dan komposisi aplikasi.

---

# 🎯 Tujuan Dependency Injection

Panduan ini dibuat untuk:

* memisahkan kontrak dari implementasi
* menghindari coupling langsung antar modul
* mempermudah mocking dalam test
* memastikan implementasi bisa diganti tanpa mengubah caller
* menjaga composition root tetap terpusat dan terkontrol

---

# ⚖️ Prinsip Utama

## 1. Composition Root Terpusat

Semua registration dependency HARUS dilakukan secara terpusat di:

```text
src/infrastructure/di/
```

## 2. Resolve via Container, bukan Import Implementasi

Caller HARUS menerima dependency dari DI, bukan import implementasi konkret secara langsung.

## 3. Core Mengenal Kontrak, Bukan Implementasi

Layer `core` hanya boleh mengenal interface/protocol.

## 4. Infrastructure Mengikat Kontrak ke Implementasi

Layer `infrastructure` bertanggung jawab untuk meregistrasikan implementasi konkret terhadap kontraknya.

## 5. Dependency Flow Harus Konsisten dengan Arsitektur

DI tidak boleh digunakan untuk melanggar boundary layer.

---

# 🏗️ Struktur DI yang Direkomendasikan

```text
src/infrastructure/di/
├── container.ts
└── registry/
    ├── moduleContainer.ts
    ├── repositoryContainer.ts
    ├── useCasesContainer.ts
    ├── viewModelContainer.ts
    ├── loggingContainer.ts
    └── index.ts
```

## Tanggung jawab file:

* `container.ts` → root container
* `moduleContainer.ts` → shared modules/protocol implementation
* `repositoryContainer.ts` → repository implementation registration
* `useCasesContainer.ts` → use case registration
* `viewModelContainer.ts` → viewModel registration
* `loggingContainer.ts` → logger/analytics registration
* `index.ts` → orchestration register semua module

---

# 🔐 Aturan Layer dan Dependency

## Core

❌ Dilarang:

* import container
* resolve dependency langsung
* mengetahui Awilix

## Infrastructure

✅ Boleh:

* register dependency
* bind contract → implementation
* define composition root

## Presentation

✅ Boleh:

* resolve viewModel dari DI bila pola proyek mengharuskan demikian
* menerima dependency hasil injection

❌ Dilarang:

* import implementation infra langsung ke screen/component
* membuat repository/use case dengan `new` manual di UI

---

# 🧱 Registration Rules

## Rule 1 — Semua dependency baru WAJIB diregistrasikan

Jika membuat:

* repository baru
* use case baru
* viewModel baru
* adapter/protocol implementation baru

maka registration HARUS ditambahkan di registry yang sesuai.

## Rule 2 — Nama registration konsisten

Gunakan naming convention camelCase.

Contoh:

* `httpProtocol`
* `paymentRepository`
* `updatePaymentUseCase`
* `usePaymentViewModel`
* `analyticsProtocol`

## Rule 3 — Satu registration, satu tanggung jawab jelas

Jangan daftarkan dependency dengan nama ambigu.

❌ Buruk:

* `service`
* `utils`
* `handler`

✅ Baik:

* `validateTokenUseCase`
* `paymentRepository`
* `authCookieAdapter`

---

# 🪢 Lifetime Rules (Penting)

Awilix mendukung beberapa lifecycle. Gunakan dengan disiplin.

## 1. Singleton

Gunakan untuk dependency yang aman dibagi selama lifecycle aplikasi.

Contoh cocok:

* config object
* logger
* analytics adapter
* stateless repository implementation
* stateless use case

## 2. Scoped

Gunakan bila lifecycle perlu dibatasi per request / per scope tertentu.

Contoh cocok:

* request-bound dependency
* context yang membawa header/request metadata

## 3. Transient

Gunakan bila instance baru memang diperlukan setiap resolve.

Contoh cocok:

* object yang menyimpan mutable state lokal per pemakaian

## Rule penting

Jika ragu:

* default aman biasanya **singleton** untuk dependency stateless
* gunakan **scoped** untuk context request-specific
* hindari transient berlebihan tanpa alasan

---

# 🧠 Factory Function Pattern (WAJIB)

Semua dependency utama disarankan berbentuk **factory function** agar DI-friendly.

Contoh pattern:

```ts
export const NamaUseCaseImpl = ({
  namaRepository,
}: {
  namaRepository: NamaRepository;
}): NamaUseCase => ({
  execute: async params => {
    return namaRepository.getData(params);
  },
});
```

## Rule:

* dependency diterima via parameter object
* jangan ambil dependency dari global scope
* jangan import container ke dalam use case/repository

---

# 🗂️ Registration Pattern

## Module / Protocol

```ts
container.register({
  httpProtocol: asFunction(HttpAdapter).singleton(),
});
```

## Repository

```ts
container.register({
  paymentRepository: asFunction(PaymentRepositoryImpl).singleton(),
});
```

## Use Case

```ts
container.register({
  updatePaymentUseCase: asFunction(UpdatePaymentUseCaseImpl).singleton(),
});
```

## ViewModel

```ts
container.register({
  usePaymentViewModel: asFunction(PaymentViewModel),
});
```

---

# 🪝 Resolve Pattern

## Rule 1 — Resolve sedekat mungkin dengan composition boundary

Contoh yang diperbolehkan:

* screen resolve ViewModel
* page/container resolve composition-level dependency

## Rule 2 — Jangan Resolve di Core

`core` tidak boleh tahu container.

## Rule 3 — Jangan Resolve Berulang Tanpa Perlu

Jika dependency bisa di-pass sekali, lakukan itu.

Contoh:

```ts
const vm = DI.resolve('usePaymentViewModel');
```

---

# 🧭 DI di Presentation Layer

Jika proyek ini menggunakan pola:

* screen resolve ViewModel dari DI

maka aturan berikut berlaku:

## Screen

✅ Boleh:

* resolve ViewModel
* memanggil method ViewModel
* render state dari ViewModel

❌ Dilarang:

* resolve repository langsung
* resolve http adapter langsung
* resolve utility infra yang seharusnya tersembunyi di bawah use case/viewModel

## Component kecil / reusable component

Disarankan:

* tidak resolve dependency sendiri
* menerima props dari parent/screen/viewModel

---

# 🔄 DI dan Clean Architecture

DI adalah alat untuk **menegakkan arsitektur**, bukan untuk membypass arsitektur.

## Rule:

* jangan karena bisa di-resolve lalu semua layer bebas mengambil dependency apa pun
* dependency yang di-resolve tetap HARUS sesuai boundary

Contoh:

❌ Salah:

* component presentation resolve `paymentRepository`
* core use case import `container`
* mapper resolve logger dari DI

✅ Benar:

* repository di-inject ke use case
* use case di-inject ke ViewModel
* ViewModel di-resolve di screen/container

---

# 🧪 DI untuk Testing

DI HARUS mempermudah testing, bukan memperumit testing.

## Rule 1 — Mock dependency, bukan implementation yang diuji

Contoh:

* saat test use case → mock repository
* saat test ViewModel → mock use case
* saat test screen → mock resolved ViewModel atau DI resolve

## Rule 2 — Jangan bergantung pada container real jika tidak perlu

Untuk unit test, prioritaskan inject mock langsung.

## Rule 3 — Container override boleh untuk integration test

Jika perlu test integrasi ringan, gunakan registration override yang eksplisit.

---

# 🧰 Configuration & Container Bootstrapping

## Rule 1 — Container initialization harus terpusat

Container HARUS dibuat dan di-bootstrap sekali di tempat yang jelas.

## Rule 2 — Urutan registration konsisten

Disarankan urutan:

1. module/protocol
2. repository
3. use case
4. viewModel
5. logging/other support

## Rule 3 — Hindari side effect saat register

Registration tidak boleh memicu network call atau side effect berat.

---

# 🧾 Naming Convention (WAJIB)

## Registration Key

Gunakan camelCase dengan makna jelas.

Contoh:

* `httpProtocol`
* `storageProtocol`
* `paymentRepository`
* `validateTokenUseCase`
* `useDirectSubmitViewModel`

## Factory / Implementation

Gunakan nama eksplisit:

* `PaymentRepositoryImpl`
* `ValidateTokenUseCaseImpl`
* `PaymentViewModel`
* `AxiosAdapter`

---

# 🚫 Anti-Pattern (DILARANG KERAS)

❌ Import container ke `core`
❌ Resolve dependency di entity/mapper/use case
❌ Import implementation konkret langsung ke UI padahal harus via DI
❌ Registration key ambigu seperti `service`, `helper`, `handler`
❌ Menggunakan DI untuk menyembunyikan pelanggaran arsitektur
❌ Mendaftarkan dependency tanpa lifecycle yang dipikirkan
❌ Side effect berat saat container bootstrap
❌ Component kecil resolve terlalu banyak dependency sendiri
❌ Membuat instance manual (`new`) untuk dependency yang seharusnya dikelola container

---

# ✅ Best Practice

* gunakan composition root terpusat
* register dependency sesuai layer
* gunakan factory function dengan object injection
* pilih lifecycle dengan sadar
* resolve dependency sedekat mungkin ke boundary komposisi
* mock dependency via injection saat testing
* jaga registration naming tetap konsisten dan eksplisit
* gunakan DI untuk memperkuat Clean Architecture, bukan melemahkannya

---

# ⚠️ Enforcement (Kiro Steering Rule)

Semua AI Agent dan Developer:

* WAJIB menggunakan DI untuk seluruh dependency utama
* WAJIB mendaftarkan dependency baru ke registry yang sesuai
* DILARANG import implementation konkret lintas layer jika seharusnya di-inject
* DILARANG menggunakan container di `core`
* WAJIB menjaga consistency antara DI pattern dan Clean Architecture

Jika ada konflik antara kemudahan implementasi vs disiplin DI:
👉 **disiplin DI harus diprioritaskan**

Jika ada konflik dengan dokumen lain:
👉 gunakan dokumen ini sebagai **sumber kebenaran utama untuk keputusan DI**

---

# 🏁 Kesimpulan

Dependency Injection bukan hanya teknik wiring, tetapi fondasi untuk menjaga modularitas, testability, dan scalability.

Dengan mengikuti panduan ini:

* dependency menjadi lebih terkontrol
* implementasi lebih mudah diganti
* testing lebih mudah
* boundary layer tetap bersih
* proyek lebih siap untuk skala enterprise
