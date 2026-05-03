---
inclusion: always
---

# ✅ Review Checklist (Steering)

Dokumen ini adalah **checklist WAJIB** untuk code review oleh developer dan AI Agent (Kiro).

Checklist ini memastikan setiap perubahan kode:
- sesuai arsitektur
- mengikuti code pattern
- aman secara security
- memiliki testing yang cukup
- siap untuk production

---

# 🎯 Tujuan

Checklist ini digunakan untuk:
- menjaga kualitas kode
- mencegah pelanggaran arsitektur
- memastikan konsistensi antar tim
- membantu Kiro melakukan automated review

---

# 🏗️ 1. Arsitektur

- [ ] Tidak ada pelanggaran dependency rule
- [ ] Core tidak mengakses infrastructure/presentation
- [ ] Tidak ada business logic di UI
- [ ] UseCase digunakan sebagai pusat business logic
- [ ] Tidak ada API call langsung di component
- [ ] Tidak ada logic kompleks di App Router (page/layout)

---

# 🧩 2. Code Pattern

- [ ] Entity bersih (tanpa dependency eksternal)
- [ ] Repository interface di core
- [ ] Repository implementation di infrastructure
- [ ] Mapper digunakan (tidak mapping di UI)
- [ ] DTO tidak bocor ke UI
- [ ] UseCase berbentuk factory function (DI-ready)
- [ ] Tidak ada penggunaan global state untuk business logic

---

# 🔌 3. Dependency Injection

- [ ] Semua dependency menggunakan DI
- [ ] Tidak ada `new` manual untuk dependency utama
- [ ] Registration dilakukan di container
- [ ] Naming DI konsisten (camelCase)
- [ ] Tidak ada penggunaan container di core
- [ ] Lifecycle dependency (singleton/scoped) dipilih dengan benar

---

# 🔐 4. Security

- [ ] Tidak ada hardcoded secret/token
- [ ] Tidak ada penggunaan `dangerouslySetInnerHTML` tanpa sanitasi
- [ ] Redirect sudah divalidasi (tidak open redirect)
- [ ] Input sudah divalidasi
- [ ] Output aman (tidak expose internal error)
- [ ] Tidak ada data sensitif di log
- [ ] Token tidak disimpan di localStorage (untuk refresh token)
- [ ] Header sensitif tidak di-forward sembarangan

---

# 🧪 5. Testing

- [ ] UseCase memiliki unit test
- [ ] Mapper memiliki unit test
- [ ] Repository memiliki test
- [ ] ViewModel memiliki test
- [ ] Feature kritikal memiliki test
- [ ] Edge case dan error case diuji
- [ ] Coverage memenuhi minimum (>= 80%)
- [ ] Tidak ada test yang flaky / tergantung network real

---

# ⚙️ 6. Konfigurasi & Konvensi

- [ ] Menggunakan path alias (tidak relative panjang)
- [ ] Tidak ada penggunaan `any`
- [ ] Tidak ada `@ts-ignore`
- [ ] Lolos TypeScript strict mode
- [ ] Lolos ESLint tanpa warning
- [ ] Format sesuai Prettier
- [ ] Naming convention konsisten

---

# 🎨 7. UI & UX

- [ ] Tidak ada hardcoded text (gunakan i18n)
- [ ] Loading state ditangani
- [ ] Error state ditangani
- [ ] Empty state ditangani (jika relevan)
- [ ] Tidak ada broken UI state
- [ ] Aksesibilitas dasar terpenuhi (button, label, role)

---

# 🚀 8. Performance

- [ ] Tidak ada unnecessary re-render
- [ ] Tidak ada API call berulang tanpa kontrol
- [ ] React Query digunakan dengan benar (cache, retry, dsb)
- [ ] Lazy loading digunakan jika perlu
- [ ] Tidak ada bundle bloat signifikan
- [ ] Tidak ada penggunaan hook yang berlebihan

---

# 📡 9. Logging & Observability

- [ ] Error dilog dengan aman
- [ ] Tidak expose stack trace ke UI
- [ ] Event penting tercatat
- [ ] Tidak ada log data sensitif
- [ ] Correlation ID digunakan jika relevan

---

# 🛡️ 10. Security Critical Check (WAJIB untuk fitur sensitif)

Untuk fitur seperti:
- auth
- payment
- binding
- transaksi
- redirect

WAJIB memastikan:

- [ ] Unauthorized access ditolak
- [ ] Invalid token ditangani dengan benar
- [ ] Redirect tidak bisa dimanipulasi
- [ ] Input abnormal tidak menyebabkan crash
- [ ] Tidak ada data sensitif bocor ke UI

---

# 🚫 Anti-Pattern Check

- [ ] Tidak ada API call di component
- [ ] Tidak ada business logic di ViewModel
- [ ] Tidak ada import langsung infra ke core
- [ ] Tidak ada DTO langsung ke UI
- [ ] Tidak ada penggunaan `@ts-ignore`
- [ ] Tidak ada hardcoded config/URL
- [ ] Tidak ada side effect di tempat yang tidak semestinya

---

# ⚠️ Final Decision

## ✅ Approve jika:
- Semua checklist terpenuhi
- Tidak ada pelanggaran critical
- Code readable dan maintainable

## ❌ Reject jika:
- Melanggar arsitektur
- Tidak ada test untuk logic penting
- Ada issue security
- Code sulit dipahami / tidak konsisten

---

# 🏁 Kesimpulan

Checklist ini adalah **guardrail utama** untuk menjaga kualitas proyek.

Semua perubahan kode HARUS melewati checklist ini sebelum merge ke branch utama.

Jika ragu:
👉 pilih solusi yang paling aman, paling konsisten, dan paling sesuai arsitektur