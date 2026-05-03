---
inclusion: manual
---

# 🧭 Specs Workflow (Steering)

Dokumen ini adalah **standar workflow spesifikasi WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Workflow ini mengatur bagaimana sebuah fitur/initiative berjalan dari:
**idea → spec → design → implementation → testing → release → observability**

Tujuan:

* memastikan setiap fitur terdefinisi dengan jelas sebelum coding
* mengurangi ambiguity & rework
* menyelaraskan bisnis, engineering, dan QA
* memungkinkan Kiro berperan sebagai co-pilot/auto-reviewer

---

# 🎯 Tujuan Workflow

* memastikan requirement jelas & terukur
* memastikan arsitektur & contract disepakati di awal
* memastikan testing & security dipikirkan sejak awal
* memastikan release aman dan terobservasi

---

# ⚖️ Prinsip Utama

## 1. Spec Before Code

Tidak boleh coding tanpa spesifikasi minimal.

## 2. Shift Left

Security, testing, performance, dan observability dipikirkan di fase awal.

## 3. Single Source of Truth

Satu fitur memiliki satu dokumen spesifikasi utama.

## 4. Small, Iterative Delivery

Fitur dipecah menjadi scope kecil yang bisa dirilis bertahap.

## 5. Traceability

Setiap perubahan bisa ditelusuri dari spec → code → release.

---

# 🧱 Artefak Utama

Untuk setiap fitur/initiative, minimal memiliki:

1. **Problem Statement**
2. **Functional Spec**
3. **Technical Design**
4. **API Contract (jika ada)**
5. **Test Plan**
6. **Release Plan**

---

# 🔄 End-to-End Workflow

```text
Idea
 → Problem Statement
 → Functional Spec
 → Technical Design
 → API Contract
 → Task Breakdown
 → Implementation
 → Testing
 → Review (Checklist)
 → CI/CD
 → Release
 → Monitoring & Observability
 → Feedback & Iteration
```

---

# 🧾 1. Problem Statement

## Tujuan

Menjelaskan masalah yang ingin diselesaikan.

## Isi minimal:

* latar belakang
* pain point
* objective
* success metric (KPI)

---

# 📘 2. Functional Spec

## Tujuan

Menjelaskan apa yang harus dilakukan sistem dari sisi user/business.

## Isi minimal:

* use case
* user flow
* acceptance criteria
* edge case

## Rule:

* tidak membahas detail teknis
* harus bisa dipahami non-engineer

---

# 🧠 3. Technical Design

## Tujuan

Menjelaskan bagaimana sistem akan diimplementasikan.

## Isi minimal:

* arsitektur (mengacu ke 01-project-architecture.md)
* komponen yang terlibat
* data flow
* dependency (API, service, dsb)
* state management
* error handling strategy

## Rule:

* wajib selaras dengan Clean Architecture
* wajib mempertimbangkan security & performance

---

# 🔌 4. API Contract (Jika Ada)

## Tujuan

Mendefinisikan komunikasi antar sistem.

## Isi minimal:

* request DTO
* response DTO
* error response
* status code

## Rule:

* mengikuti 13-api-contract-guideline.md

---

# 🧩 5. Task Breakdown

## Tujuan

Memecah pekerjaan menjadi unit yang bisa diimplementasikan.

## Contoh:

* create use case
* implement repository
* create API route
* create ViewModel
* create UI screen
* write test

## Rule:

* task kecil & terukur
* setiap task bisa direview

---

# 💻 6. Implementation

## Rule:

* mengikuti:

  * 01-project-architecture.md
  * 02-code-pattern.md
  * 06-di-pattern.md
* tidak boleh shortcut arsitektur

---

# 🧪 7. Testing

## Wajib:

* unit test
* integration test (jika perlu)
* e2e test untuk flow kritikal

## Rule:

* mengikuti 04-testing-pattern.md

---

# 🔍 8. Review

## Wajib:

* gunakan 07-review-checklist.md

## Fokus:

* arsitektur
* security
* testing
* readability

---

# 🚀 9. CI/CD & Release

## Rule:

* pipeline harus lulus
* mengikuti 10-release-and-ci-cd.md

---

# 📡 10. Observability & Monitoring

## Wajib:

* logging
* metrics
* tracing

## Rule:

* mengikuti 08-observability-guideline.md

---

# 🔁 11. Feedback & Iteration

## Setelah release:

* monitor error
* monitor performance
* kumpulkan feedback user

## Iterasi:

* update spec jika ada perubahan

---

# 🧠 Template Ringkas Spec

Gunakan template berikut:

```md
# Feature Name

## Problem
...

## Objective
...

## User Flow
...

## Acceptance Criteria
- [ ] ...

## Technical Design
...

## API Contract
...

## Edge Case
...

## Test Plan
...

## Release Plan
...
```

---

# 🚫 Anti-Pattern

❌ coding tanpa spec
❌ spec tidak diupdate saat perubahan
❌ langsung implement tanpa design
❌ tidak ada acceptance criteria
❌ tidak ada test plan

---

# ✅ Best Practice

* selalu mulai dari problem, bukan solusi
* tulis spec singkat tapi jelas
* validasi design sebelum coding
* gunakan checklist untuk review
* iterasi kecil dan cepat

---

# ⚠️ Enforcement (Kiro)

* WAJIB ada spec sebelum implementasi fitur besar
* WAJIB update spec jika ada perubahan signifikan
* DILARANG implementasi tanpa acceptance criteria

Jika ada konflik antara kecepatan vs kejelasan:
👉 pilih **clarity over speed**

---

# 🏁 Kesimpulan

Specs workflow memastikan engineering berjalan terarah.

Dengan workflow ini:

* ambiguity berkurang
* kualitas meningkat
* delivery lebih cepat & aman
* sistem lebih scalable
