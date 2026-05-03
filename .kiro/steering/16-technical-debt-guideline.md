---
inclusion: manual
---

# 🧯 Technical Debt Guideline (Steering)

Dokumen ini adalah **standar pengelolaan technical debt WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Technical debt adalah kompromi desain/implementasi yang diambil untuk mempercepat delivery namun berpotensi menimbulkan biaya di masa depan.

Tujuan:

* membuat debt **terlihat, terukur, dan terkelola**
* mencegah akumulasi debt tak terkendali
* menyeimbangkan **speed vs quality** secara sadar
* memastikan rencana pelunasan (remediation) jelas

---

# 🎯 Tujuan

* mengidentifikasi dan mencatat debt secara sistematis
* memprioritaskan debt berdasarkan dampak bisnis & risiko
* merencanakan perbaikan secara bertahap
* mengintegrasikan debt ke dalam lifecycle delivery

---

# ⚖️ Prinsip Utama

## 1. Debt is Explicit

Semua technical debt HARUS terdokumentasi (tidak boleh “diam-diam”).

## 2. Intentional over Accidental

Debt boleh diambil jika **disadari & dicatat**, bukan karena kelalaian.

## 3. Pay It Down Continuously

Debt harus dilunasi bertahap, bukan ditumpuk.

## 4. Risk-based Prioritization

Prioritas berdasarkan risiko terhadap:

* security
* reliability
* performance
* delivery speed

## 5. Traceable & Measurable

Setiap debt punya:

* owner
* severity
* scope
* rencana perbaikan

---

# 🧩 Klasifikasi Technical Debt

## 1. Code Debt

* code smell
* duplikasi tinggi
* kompleksitas berlebih

## 2. Architecture Debt

* pelanggaran Clean Architecture
* coupling tinggi antar layer
* BFF menjadi monolith tak terkendali

## 3. Testing Debt

* coverage rendah
* test tidak stabil/flaky
* tidak ada test untuk flow kritikal

## 4. Security Debt

* penggunaan pattern tidak aman
* tidak ada sanitization/validation
* secret exposure risk

## 5. Performance Debt

* bundle besar
* query tidak efisien
* caching tidak optimal

## 6. Observability Debt

* tidak ada logging/tracing
* sulit debug incident

## 7. DevOps/CI Debt

* pipeline lambat/tidak stabil
* tidak ada quality gate

---

# 🧾 Debt Record (WAJIB)

Setiap debt HARUS dicatat menggunakan template berikut:

```md
# TD-XXX: Judul Debt

## Tanggal
YYYY-MM-DD

## Area
Code | Architecture | Testing | Security | Performance | Observability | DevOps

## Deskripsi
Apa masalahnya?

## Dampak
Apa risikonya terhadap sistem/bisnis?

## Severity
Low | Medium | High | Critical

## Root Cause
Kenapa debt ini muncul?

## Rencana Perbaikan
Apa yang akan dilakukan?

## Target
Kapan akan diperbaiki?

## Owner
Siapa yang bertanggung jawab?

## Status
Open | In Progress | Resolved | Accepted Risk
```

---

# 📊 Prioritization Matrix

Gunakan kombinasi:

* **Impact (Low → Critical)**
* **Likelihood (Low → High)**

## Prioritas Tinggi:

* Security + High impact
* Payment/auth flow
* Crash/availability issue

## Prioritas Menengah:

* maintainability issue
* test coverage gap

## Prioritas Rendah:

* minor refactor
* cosmetic improvement

---

# 🔄 Lifecycle Technical Debt

```text
Identified → Recorded → Prioritized → Planned → Fixed → Verified → Closed
```

## Rule

* debt tidak boleh berhenti di “identified”
* harus masuk backlog atau ADR jika besar

---

# 🧠 Kapan Debt Boleh Diambil

Debt boleh diambil jika:

* deadline bisnis mendesak
* kompleksitas solusi tinggi
* ada rencana perbaikan jelas

## WAJIB:

* dokumentasikan debt
* jelaskan trade-off di spec/ADR

---

# 🚫 Kapan Debt Tidak Boleh Diambil

❌ security risk tinggi
❌ melanggar compliance
❌ merusak data integrity
❌ membuat sistem tidak bisa diobservasi

---

# 🧩 Integrasi dengan Workflow

## Dengan Spec (15)

* debt harus dicatat sebagai bagian dari spec jika diketahui sejak awal

## Dengan ADR (16)

* keputusan yang menghasilkan debt → WAJIB dicatat di ADR

## Dengan Review (07)

* reviewer HARUS menandai debt

## Dengan CI/CD (10)

* debt tertentu bisa dijadikan quality gate (coverage, lint, dsb)

---

# 🧪 Testing Debt Rule

Jika test tidak dibuat karena keterbatasan waktu:

* WAJIB buat task debt
* WAJIB prioritas tinggi untuk flow kritikal

---

# 🔐 Security Debt Rule

Security debt harus:

* diprioritaskan tinggi
* segera ditindaklanjuti
* tidak boleh diabaikan lama

---

# 📉 Metrics & Tracking

Disarankan tracking:

* jumlah debt aktif
* debt per kategori
* waktu rata-rata penyelesaian
* debt critical outstanding

---

# 🚫 Anti-Pattern

❌ debt tidak didokumentasikan
❌ debt dianggap “nanti saja” tanpa rencana
❌ menumpuk debt tanpa batas
❌ tidak ada owner
❌ tidak ada prioritas

---

# ✅ Best Practice

* dokumentasikan semua debt
* prioritaskan berdasarkan risiko
* lunasi secara bertahap
* gunakan refactor kecil tapi konsisten
* review debt secara berkala

---

# ⚠️ Enforcement (Kiro)

* WAJIB mencatat technical debt
* WAJIB menandai pelanggaran arsitektur sebagai debt
* DILARANG mengabaikan debt kritikal

Jika ada konflik antara speed vs debt:
👉 pilih **debt yang terkontrol, bukan chaos**

---

# 🏁 Kesimpulan

Technical debt tidak bisa dihindari, tapi harus dikelola.

Dengan guideline ini:

* debt menjadi terukur
* risiko berkurang
* sistem tetap sehat
* tim tetap produktif
