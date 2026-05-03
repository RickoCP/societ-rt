---
inclusion: always
---

# 🧭 Arsitektur Proyek — Clean Architecture + DDD (Steering)

Dokumen ini adalah **engineering guideline wajib** untuk seluruh pengembangan proyek.

Arsitektur yang digunakan adalah **Clean Architecture** dengan pendekatan **Domain-Driven Design (DDD)** pada **Next.js App Router**.

Semua perubahan kode **WAJIB mengikuti aturan dalam dokumen ini**.

---

# 🎯 Tujuan Arsitektur

Arsitektur ini dirancang untuk:

* menjaga **separation of concerns**
* memastikan **dependency flow satu arah**
* meningkatkan **testability dan maintainability**
* mempermudah **scalability dan extensibility**
* mencegah **tight coupling terhadap framework / library**

---

# ⚖️ Prinsip Utama

## 1. Dependency Rule (WAJIB)

Layer dalam **TIDAK BOLEH** bergantung ke layer luar.

```
app → presentation → core
             ↘
        infrastructure
```

## 2. Separation of Concerns

Setiap layer memiliki tanggung jawab spesifik dan tidak boleh overlap.

## 3. Dependency Injection

Semua dependency **WAJIB di-resolve melalui DI container (Awilix)**.

❌ Dilarang:

```ts
import axios from 'axios'
```

✅ Wajib:

```ts
const http = DI.resolve('HttpProtocol')
```

## 4. Protocol-based Abstraction

Core hanya mengenal **interface (protocol)**, bukan implementasi.

## 5. Framework as Detail

Next.js, Axios, Zustand, dsb adalah **detail**, bukan pusat arsitektur.

---

# 🏗️ Struktur Layer

```
src/
├── core/                               # LAYER 1: Business Logic (paling dalam)
│   ├── domains/
│   │   └── [domain]/
│   │       ├── entities/               # Domain entities / value objects
│   │       ├── repositories/           # Repository interface ONLY
│   │       ├── usecases/               # Business logic utama
│   │       ├── errors/                 # Domain error
│   │       └── mappers/                # Mapping logic (optional)
│   │
│   ├── protocols/                      # Interface global (http, storage, dll)
│   └── utils/                          # Pure utilities (no external deps)
│
├── infrastructure/                     # LAYER 2: Implementation
│   ├── di/
│   │   ├── container.ts
│   │   └── registry/
│   │
│   ├── networking/                     # HTTP adapter (axios/fetch)
│   ├── repositories/                   # Repository implementation
│   │   └── [domain]/
│   ├── storage/                        # localStorage/cookie adapter
│   ├── devices/                        # device adapter
│   ├── logging/                        # analytics/logger
│   ├── stateManagement/                # Zustand (shared app state)
│   └── utils/
│
├── presentation/                       # LAYER 3: UI
│   ├── features/
│   │   └── [featureName]/
│   │       ├── screens/                # Page-level UI
│   │       ├── components/             # Feature components
│   │       ├── viewModel/              # UI state orchestration
│   │       ├── mappers/                # View data mapping
│   │       └── validation/             # Form validation
│   │
│   ├── components/                     # Shared components (Atomic Design)
│   │   ├── atoms/
│   │   ├── molecules/
│   │   └── organisms/
│   │
│   ├── hooks/
│   ├── providers/
│   ├── locales/
│   └── utils/
│
└── app/                                # Next.js App Router (composition layer)
    ├── layout.tsx
    ├── page.tsx
    └── [route]/
        └── page.tsx
```

---

# 🧠 Tanggung Jawab Layer

## CORE (Business Rules)

✅ Boleh:

* entity
* value object
* use case
* repository interface
* domain rules

❌ Dilarang:

* React
* Next.js
* API call
* localStorage
* analytics
* library eksternal

---

## INFRASTRUCTURE (Implementation)

✅ Boleh:

* HTTP client (axios/fetch)
* repository implementation
* storage adapter
* analytics
* Zustand store

❌ Dilarang:

* business rule inti
* logic domain

---

## PRESENTATION (UI)

✅ Boleh:

* component
* screen
* view model
* UI state
* form validation

❌ Dilarang:

* API call langsung
* business logic inti
* repository implementation

### Server-First Rendering (Next.js)

* Default: gunakan **Server Component**
* Gunakan Client Component (`use client`) hanya jika ada interaksi atau state lokal
* Minimalkan penggunaan `use client` untuk menjaga bundle size

### Atomic Design (Shared Components)

Shared components di `presentation/components/` mengikuti Atomic Design:

* `atoms/` → elemen dasar (button, input, label)
* `molecules/` → kombinasi atoms (form field, search bar)
* `organisms/` → komponen kompleks (header, sidebar, card list)

Rule: shared component harus reusable dan tidak mengandung business logic

---

## APP (Routing Layer)

✅ Boleh:

* routing
* layout
* loading
* error boundary

❌ Dilarang:

* business logic
* data mapping kompleks

---

# 🔄 Data Flow (WAJIB)

```
UI (Screen)
  → ViewModel
  → UseCase
  → Repository (interface)
  → Repository Implementation
  → API / Storage
  → DomainResult<T>
  → UI
```

---

# 🔐 Aturan Dependency (STRICT)

| From           | Boleh Akses               |
| -------------- | ------------------------- |
| core           | ❌ tidak boleh ke mana pun |
| infrastructure | core                      |
| presentation   | core                      |
| app            | presentation              |

❌ DILARANG:

* core → infrastructure
* core → presentation
* presentation → infrastructure (langsung)

---

# 🔁 Aturan Mapping Data

* API response = **DTO**
* DTO tidak boleh langsung ke UI
* Mapping dilakukan di repository / mapper

```
DTO → Domain Entity → View Model → UI
```

---

# 🧩 Naming Convention (WAJIB)

Gunakan format berikut:

* GetPaymentUseCase.ts
* PaymentRepository.ts
* PaymentRepositoryImpl.ts
* usePaymentViewModel.ts
* PaymentScreen.tsx
* PaymentCard.tsx

---

# 🚫 Anti-Pattern (DILARANG KERAS)

❌ API call di component:

```ts
useEffect(() => {
  fetch('/api/data')
}, [])
```

❌ Business logic di ViewModel:

```ts
if (amount > 1000000) { ... }
```

❌ Import infra ke core:

```ts
import axios from 'axios'
```

❌ Pakai response API langsung di UI:

```ts
data.response.amount
```

❌ Folder services tanpa batasan jelas

---

# ✅ Best Practice (WAJIB DIIKUTI)

* Semua business logic → use case
* Semua external access → repository
* Semua dependency → DI container
* Semua mapping → mapper
* Page di app/ harus tipis

---

# 🚀 Workflow Membuat Fitur Baru

1. Buat Entity di core/domains
2. Buat Repository Interface
3. Buat UseCase
4. Implementasi di infrastructure
5. Register di DI container
6. Buat ViewModel
7. Buat Screen & Component
8. Hubungkan di app/route

---

# ⚠️ Enforcement (Kiro Steering Rule)

Semua AI Agent dan Developer:

* WAJIB mengikuti struktur ini
* WAJIB mengikuti dependency rule
* WAJIB menggunakan DI
* DILARANG melanggar boundary layer

Jika terjadi konflik:
👉 Ikuti dokumen ini sebagai sumber kebenaran utama

---

# 📌 Catatan

Arsitektur ini bukan hanya struktur folder, tetapi kontrak engineering.

Pelanggaran akan menyebabkan:

* technical debt
* sulit testing
* sulit scaling
* inkonsistensi codebase

---

# 🏁 Kesimpulan

Arsitektur ini memastikan:

* code lebih rapi
* dependency terkontrol
* logic terisolasi
* siap untuk skala enterprise
