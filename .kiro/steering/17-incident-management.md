---
inclusion: manual
---

# 🚑 Incident Management Guideline (Steering)

Dokumen ini adalah **standar penanganan incident WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Incident adalah kejadian yang mengganggu layanan (downtime, degradasi performa, error spike, security issue, dll) dan berdampak ke user atau bisnis.

Tujuan:

* menurunkan **MTTR (Mean Time To Recovery)**
* meminimalkan dampak ke user
* memastikan respons yang cepat, terkoordinasi, dan terukur
* menghasilkan pembelajaran melalui **postmortem tanpa menyalahkan individu (blameless)**

---

# 🎯 Tujuan

* mendeteksi incident secepat mungkin
* merespons dengan prosedur yang jelas
* memulihkan layanan dengan aman
* menganalisis akar masalah (root cause)
* mencegah kejadian berulang

---

# ⚖️ Prinsip Utama

## 1. Customer First

Prioritas utama adalah memulihkan layanan untuk user.

## 2. Blameless Culture

Fokus pada perbaikan sistem, bukan menyalahkan individu.

## 3. Clear Roles & Communication

Setiap incident memiliki peran yang jelas dan komunikasi terpusat.

## 4. Data-driven Decision

Gunakan observability (logs, metrics, traces) untuk keputusan.

## 5. Learn & Improve

Setiap incident menghasilkan aksi perbaikan (follow-up).

---

# 🚨 Klasifikasi Severity

Gunakan klasifikasi berikut:

## Sev-1 (Critical)

* layanan utama tidak dapat digunakan (total outage)
* dampak luas ke banyak user
* potensi kerugian bisnis besar

## Sev-2 (High)

* fitur utama terganggu
* sebagian besar user terdampak
* tidak ada workaround mudah

## Sev-3 (Medium)

* fitur tertentu terganggu
* dampak terbatas
* ada workaround

## Sev-4 (Low)

* minor bug / cosmetic
* tidak mengganggu flow utama

---

# 🧭 Peran dalam Incident

## 1. Incident Commander (IC)

* memimpin respons incident
* menentukan prioritas dan keputusan
* menjaga fokus tim

## 2. Tech Lead / Resolver

* melakukan investigasi teknis
* mengimplementasikan perbaikan

## 3. Communication Lead

* mengelola komunikasi internal/eksternal
* update status ke stakeholder

## 4. Scribe (Opsional)

* mencatat timeline dan aksi selama incident

---

# 🔄 Lifecycle Incident

```text
Detection → Triage → Response → Mitigation → Recovery → Postmortem → Follow-up
```

---

# 🔍 1. Detection

Incident dapat terdeteksi melalui:

* alert (Grafana, Sentry, dsb)
* monitoring dashboard
* laporan user/customer support
* log anomaly

## Rule

* sistem HARUS memiliki alert untuk error spike, latency, dan downtime

---

# ⚠️ 2. Triage

Langkah awal:

* identifikasi severity
* tentukan scope dampak
* assign Incident Commander
* aktifkan channel komunikasi (Slack/War Room)

---

# 🛠️ 3. Response

Langkah respons:

* kumpulkan data (log, trace, metrics)
* identifikasi area terdampak
* tentukan hipotesis awal

## Rule

* jangan langsung “menebak” tanpa data

---

# 🧯 4. Mitigation

Tujuan: mengurangi dampak secepat mungkin

Contoh:

* rollback release
* disable fitur
* fallback ke service lain
* rate limit sementara

## Rule

* mitigasi cepat lebih penting daripada solusi sempurna

---

# 🔁 5. Recovery

* kembalikan layanan ke kondisi normal
* verifikasi sistem stabil
* monitor metrik setelah perbaikan

---

# 🧾 6. Postmortem (WAJIB untuk Sev-1 & Sev-2)

Gunakan format berikut:

```md
# Incident Postmortem: [Judul]

## Ringkasan
Apa yang terjadi?

## Timeline
Urutan kejadian (timestamp jelas)

## Dampak
User terdampak, durasi, severity

## Root Cause
Penyebab utama

## Contributing Factors
Faktor pendukung

## What Went Well
Apa yang berjalan baik

## What Went Wrong
Apa yang perlu diperbaiki

## Action Items
- [ ] perbaikan teknis
- [ ] improvement process
- [ ] monitoring tambahan

## Owner
Penanggung jawab action
```

## Rule

* harus **blameless**
* fokus pada sistem, bukan individu

---

# 🔁 7. Follow-up

Semua action item HARUS:

* dimasukkan ke backlog
* diprioritaskan
* dilacak hingga selesai

---

# 📡 Observability Integration

Incident response bergantung pada:

* logging
* metrics
* tracing

## Rule

* setiap incident harus dapat ditelusuri via correlationId
* dashboard harus tersedia untuk monitoring real-time

Mengacu ke: `08-observability-guideline.md`

---

# 🔐 Security Incident

Jika incident terkait security:

* segera isolasi sistem terdampak
* rotasi credential/token
* audit akses
* eskalasi ke security team

## Rule

* security incident = prioritas tinggi

---

# 🚀 CI/CD & Incident

Jika incident disebabkan oleh release:

* gunakan rollback (lihat `10-release-and-ci-cd.md`)
* hentikan deployment sementara jika perlu

---

# 📊 Metrics Incident

Tracking yang disarankan:

* MTTR (Mean Time To Recovery)
* MTTD (Mean Time To Detect)
* jumlah incident per bulan
* jumlah Sev-1/Sev-2

---

# 🚫 Anti-Pattern

❌ tidak ada alert
❌ tidak ada owner saat incident
❌ komunikasi tidak jelas
❌ tidak ada postmortem
❌ menyalahkan individu
❌ tidak ada follow-up

---

# ✅ Best Practice

* gunakan alert yang jelas & actionable
* assign Incident Commander
* gunakan war room
* rollback cepat jika perlu
* lakukan postmortem blameless
* tracking improvement setelah incident

---

# ⚠️ Enforcement (Kiro)

* WAJIB mengikuti workflow incident
* WAJIB membuat postmortem untuk incident besar
* WAJIB menambahkan observability jika kurang
* DILARANG mengabaikan incident

Jika ada konflik antara cepat vs aman:
👉 pilih **pemulihan cepat & aman**

---

# 🏁 Kesimpulan

Incident tidak bisa dihindari, tapi bisa dikelola.

Dengan guideline ini:

* respon lebih cepat
* dampak lebih kecil
* sistem lebih stabil
* tim lebih matang
