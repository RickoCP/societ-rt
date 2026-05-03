---
inclusion: manual
---

# 🧾 Architecture Decision Record (ADR) (Steering)

Dokumen ini adalah **standar Architecture Decision Record (ADR) WAJIB** untuk seluruh developer dan AI Agent (Kiro).

ADR digunakan untuk mendokumentasikan **keputusan arsitektur penting** secara eksplisit, terstruktur, dan dapat ditelusuri.

Tujuan:

* menjaga konsistensi keputusan arsitektur
* menyediakan konteks historis
* menghindari diskusi berulang
* membantu onboarding engineer baru
* mendukung audit dan evolusi sistem

---

# 🎯 Tujuan ADR

* menjawab *why*, bukan hanya *what*
* mendokumentasikan tradeoff
* mencatat alternatif yang dipertimbangkan
* memastikan keputusan dapat dipertanggungjawabkan

---

# ⚖️ Prinsip Utama

## 1. Lightweight but Clear

ADR harus singkat namun jelas.

## 2. One Decision per ADR

Satu ADR hanya membahas satu keputusan.

## 3. Immutable (with Supersession)

ADR tidak diubah setelah disetujui.
Jika ada perubahan → buat ADR baru yang menggantikan.

## 4. Context First

Keputusan harus didukung konteks yang cukup.

## 5. Traceable

Setiap ADR harus dapat dilacak ke:

* issue
* PR
* spec (14-specs-workflow.md)

---

# 🏗️ Kapan Membuat ADR

Buat ADR jika:

* memilih arsitektur penting
* memilih teknologi utama (framework, library)
* menentukan pola (BFF, event-driven, caching, dll)
* membuat keputusan dengan tradeoff signifikan
* mengganti keputusan arsitektur sebelumnya

Tidak perlu ADR untuk:

* keputusan kecil/low impact
* implementasi trivial

---

# 🧱 Struktur ADR

Gunakan format berikut:

```md
# ADR-XXX: Judul Keputusan

## Status
Proposed | Accepted | Rejected | Superseded

## Context
Jelaskan masalah, kebutuhan, dan kondisi saat ini.

## Decision
Keputusan yang diambil.

## Alternatives Considered
Opsi lain yang dipertimbangkan.

## Consequences
Dampak dari keputusan (positif & negatif).

## Trade-offs
Apa yang dikorbankan.

## Implementation Notes
Catatan implementasi jika perlu.

## References
Link ke doc/spec/PR.
```

---

# 📌 Contoh Singkat

```md
# ADR-001: Menggunakan Next.js sebagai BFF

## Status
Accepted

## Context
Frontend membutuhkan orchestration ke banyak backend service.

## Decision
Menggunakan Next.js App Router sebagai BFF.

## Alternatives
- Frontend langsung ke backend
- Dedicated backend gateway

## Consequences
+ Simplifikasi frontend
- Menambah kompleksitas server layer

## Trade-offs
Latency tambahan vs fleksibilitas contract
```

---

# 🔄 Lifecycle ADR

```text
Proposed → Review → Accepted → Implemented → (Superseded jika berubah)
```

## Status Definition

* **Proposed** → sedang didiskusikan
* **Accepted** → disetujui
* **Rejected** → ditolak
* **Superseded** → digantikan ADR baru

---

# 🗂️ Penomoran & Lokasi

## Format

```text
ADR-001
ADR-002
ADR-003
```

## Lokasi

```text
docs/adr/
  ADR-001-nextjs-bff.md
  ADR-002-di-awilix.md
```

## Rule

* nomor urut
* nama file deskriptif

---

# 🔗 Integrasi dengan Dokumen Lain

ADR HARUS terkait dengan:

* `01-project-architecture.md`
* `11-bff-pattern.md`
* `13-api-contract-guideline.md`
* `14-specs-workflow.md`

## Rule

* setiap keputusan besar di spec → HARUS punya ADR

---

# 🧠 Best Practice

* tulis ADR segera setelah keputusan dibuat
* fokus pada *why*
* hindari terlalu panjang
* sertakan tradeoff nyata
* update status jika berubah

---

# 🚫 Anti-Pattern

❌ ADR terlalu panjang seperti proposal
❌ tidak menjelaskan konteks
❌ hanya berisi keputusan tanpa alasan
❌ tidak menyebut alternatif
❌ mengubah ADR lama tanpa supersede
❌ tidak pernah diperbarui statusnya

---

# ⚠️ Enforcement (Kiro)

* WAJIB membuat ADR untuk keputusan arsitektur penting
* WAJIB menyertakan context & tradeoff
* DILARANG membuat keputusan besar tanpa dokumentasi ADR

Jika ada konflik antara kecepatan vs dokumentasi:
👉 pilih **decision clarity over speed**

---

# 🏁 Kesimpulan

ADR adalah alat penting untuk menjaga konsistensi arsitektur.

Dengan ADR:

* keputusan lebih jelas
* tim lebih selaras
* sistem lebih mudah berkembang
