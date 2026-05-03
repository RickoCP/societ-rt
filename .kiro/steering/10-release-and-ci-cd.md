---
inclusion: manual
---

# 🚀 Release & CI/CD Guideline (Steering)

Dokumen ini adalah **standar CI/CD dan release management WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Tujuan:

* memastikan setiap perubahan aman untuk production
* menjaga kualitas melalui automation
* mempercepat delivery tanpa mengorbankan stabilitas
* memungkinkan rollback cepat saat incident

---

# 🎯 Tujuan CI/CD

* otomatisasi build, test, dan deploy
* enforce quality gate
* memastikan reproducible build
* meminimalkan human error

---

# ⚖️ Prinsip Utama

## 1. Automation First

Semua proses HARUS otomatis (manual hanya untuk approval tertentu).

## 2. Fail Fast

Pipeline harus gagal secepat mungkin jika ada error.

## 3. Immutable Build

Build artifact harus immutable dan bisa direproduce.

## 4. Safe Release

Setiap release harus bisa rollback dengan cepat.

## 5. Traceability

Setiap release harus bisa ditelusuri (commit, author, perubahan).

---

# 🧱 Pipeline Stages (WAJIB)

Pipeline minimal terdiri dari:

1. **Install**
2. **Lint**
3. **Type Check**
4. **Unit Test**
5. **Coverage Check**
6. **Build**
7. **Security Scan (opsional tapi disarankan)**
8. **Deploy**

---

# 🧪 Quality Gate (STRICT)

Pipeline HARUS gagal jika:

* lint error
* TypeScript error
* test gagal
* coverage < 80%
* build gagal

🚫 Dilarang bypass pipeline

---

# 🧾 Branching Strategy

## Default

* `main` → production
* `develop` (opsional) → staging
* `feature/*` → development
* `hotfix/*` → urgent fix

## Rule

* tidak boleh commit langsung ke `main`
* semua perubahan via Pull/Merge Request

---

# 🔀 Pull Request / Merge Request

## WAJIB:

* lulus semua pipeline
* melewati review checklist (`07-review-checklist.md`)
* minimal 1 approval (atau sesuai policy tim)

---

# 🏷️ Versioning (SemVer)

Gunakan **Semantic Versioning**:

* MAJOR → breaking change
* MINOR → fitur baru
* PATCH → bug fix

Contoh:

```text
v1.2.3
```

---

# 📦 Build Strategy

## Rule

* gunakan `output: standalone` untuk Next.js
* build harus deterministic
* jangan gunakan environment yang berbeda antara build dan runtime tanpa kontrol

## Artifact

* Docker image atau build output HARUS bisa diredeploy ulang

---

# 🐳 Docker (Jika Digunakan)

## Rule

* gunakan multi-stage build
* minimalkan image size
* jangan expose secret di image

---

# 🌍 Environment

## Environment standar:

* development
* staging
* production

## Rule

* config dipisahkan via environment variables
* tidak ada hardcoded config

---

# 🚀 Deployment Strategy

## 1. Standard Deploy

* deploy otomatis setelah merge ke branch tertentu

## 2. Blue-Green / Canary (Disarankan)

* deploy ke environment paralel
* switch traffic setelah valid

## 3. Rollback

HARUS tersedia:

* rollback cepat ke versi sebelumnya
* tidak bergantung pada rebuild manual

---

# 🔐 CI/CD Security

## Rule

* secret disimpan di secret manager (GitLab CI/CD, Vercel, dll)
* tidak commit `.env` sensitif
* gunakan least privilege untuk token CI

---

# 📊 Monitoring setelah Deploy

Setelah deploy WAJIB:

* cek error rate
* cek performance (LCP, TTFB)
* cek log anomaly

---

# 🧪 Release Validation Checklist

Sebelum release:

* [ ] semua test lulus
* [ ] tidak ada critical bug
* [ ] tidak ada security issue
* [ ] performance tidak menurun signifikan
* [ ] observability aktif

---

# 🔔 Alerting & Incident

## Rule

* alert untuk error spike
* alert untuk service down
* alert untuk latency tinggi

## Incident Handling

* rollback jika perlu
* root cause analysis
* buat postmortem

---

# 🚫 Anti-Pattern

❌ deploy tanpa test
❌ bypass pipeline
❌ commit langsung ke main
❌ tidak ada rollback plan
❌ hardcode config
❌ secret di repo

---

# ✅ Best Practice

* gunakan CI/CD penuh
* enforce quality gate
* gunakan feature branch
* gunakan automated deploy
* gunakan rollback strategy

---

# ⚠️ Enforcement (Kiro)

* WAJIB semua perubahan lewat pipeline
* WAJIB lulus quality gate
* DILARANG bypass CI/CD
* WAJIB menjaga release stability

Jika ada konflik antara kecepatan vs keamanan:
👉 pilih yang **aman & stabil**

---

# 🏁 Kesimpulan

CI/CD adalah fondasi delivery modern.

Dengan guideline ini:

* release lebih aman
* bug lebih cepat terdeteksi
* deployment lebih konsisten
* sistem siap skala enterprise
