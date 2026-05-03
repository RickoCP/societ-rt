---
inclusion: always
---

# 🔐 Security Guideline (Steering)

Dokumen ini adalah **standar keamanan WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Semua implementasi HARUS mengikuti dokumen ini untuk menjaga:

* kerahasiaan data
* integritas sistem
* keamanan sesi dan autentikasi
* perlindungan dari serangan umum web
* kepatuhan terhadap secure engineering practice

Dokumen ini berlaku untuk seluruh layer: `app`, `presentation`, `core`, dan `infrastructure`.

---

# 🎯 Tujuan Security Guideline

Panduan ini dibuat untuk:

* mencegah XSS, CSRF, injection, open redirect, dan kebocoran data
* memastikan auth dan session management aman
* memastikan konfigurasi Next.js aman untuk production
* mengurangi technical debt yang berisiko terhadap keamanan
* menjadi **single source of truth** untuk secure coding

---

# ⚖️ Prinsip Utama

## 1. Security by Default

Semua fitur baru HARUS aman secara default, bukan ditambal belakangan.

## 2. Least Privilege

Setiap akses, token, dan permission HARUS dibatasi seminimal mungkin.

## 3. Defense in Depth

Keamanan HARUS diterapkan berlapis:

* browser
* client
* middleware
* API/BFF
* backend
* observability

## 4. Secure by Design

Keamanan HARUS menjadi bagian dari desain arsitektur, bukan hanya validasi di UI.

## 5. Fail Securely

Saat error terjadi, sistem HARUS gagal dengan aman:

* tidak membocorkan secret
* tidak membuka akses tanpa validasi
* tidak mengembalikan internal detail ke user

---

# 🧭 Security Responsibility per Layer

## Core

✅ Boleh:

* domain validation
* business rules terkait authorization decision bila bagian dari domain

❌ Dilarang:

* akses token storage langsung
* akses cookie/browser API
* implementasi auth provider

## Infrastructure

✅ Boleh:

* token adapter
* cookie adapter
* http adapter
* sanitization helper
* logging dan observability security event

❌ Dilarang:

* menaruh secret hardcoded
* bypass validation/security middleware

## Presentation

✅ Boleh:

* input validation untuk UX
* render error aman
* invoke use case

❌ Dilarang:

* menyimpan refresh token di localStorage
* render HTML mentah tanpa sanitasi
* memanggil API sensitif langsung tanpa flow yang disetujui

## App / Middleware

✅ Boleh:

* route protection
* redirect validation
* header security
* session presence check

❌ Dilarang:

* business logic kompleks
* authorization decision yang seharusnya ada di server domain/API

---

# 🔑 Authentication & Session Rules

## Rule 1 — Access Token dan Refresh Token

### Wajib:

* gunakan mekanisme penyimpanan yang aman
* prioritaskan **HttpOnly cookie** untuk token sensitif
* gunakan `Secure` pada production
* gunakan `SameSite` yang sesuai (minimal `Lax`, prefer `Strict` jika flow memungkinkan)

### Dilarang:

* menyimpan refresh token di `localStorage`
* menulis token sensitif ke query string
* menaruh token di source code

## Rule 2 — Cookie Security

Cookie untuk auth HARUS mempertimbangkan:

* `HttpOnly: true` untuk token sensitif
* `Secure: true` di HTTPS/production
* `SameSite: Lax` atau `Strict`
* expiry jelas
* path dibatasi sesuai kebutuhan

## Rule 3 — Session Validation

* session presence check di middleware hanya validasi awal
* validasi final tetap dilakukan di server/API
* UI tidak boleh mengasumsikan user valid hanya karena token ada

## Rule 4 — Logout

Logout HARUS:

* menghapus cookie/token
* menghapus state sensitif di client
* menghapus cache/query sensitif bila ada

---

# 🛡️ Authorization Rules

## Rule 1 — Jangan Percaya Client

* seluruh authorization HARUS divalidasi ulang di server/API
* role/permission di client hanya untuk UX, bukan sumber kebenaran final

## Rule 2 — Resource Access

* akses resource harus berbasis ownership/permission yang tervalidasi
* jangan hanya memeriksa `isLoggedIn`

## Rule 3 — Sensitive Actions

Aksi sensitif seperti:

* update data penting
* perubahan akun
* transaksi
* binding/unbinding
* approval

HARUS memiliki validasi server-side tambahan sesuai konteks.

---

# 🌐 API / BFF Security

## Rule 1 — Semua Input Tidak Dipercaya

Semua input dari:

* query param
* route param
* request body
* header
* cookie

HARUS dianggap tidak terpercaya.

## Rule 2 — Validation Wajib

Gunakan schema validation untuk input eksternal.

Wajib:

* validasi tipe
* validasi required field
* validasi range/format/enum
* sanitasi seperlunya

## Rule 3 — Output Aman

* jangan expose stack trace
* jangan return internal error detail ke client
* gunakan error mapping yang aman dan konsisten

## Rule 4 — Timeout dan Retry

* semua call eksternal HARUS memiliki timeout
* retry hanya untuk kasus aman/idempotent
* jangan retry membabi buta untuk operasi sensitif/transaksional

## Rule 5 — Header Forwarding

* forward header hanya yang diperlukan
* jangan forward seluruh header secara buta
* sanitasi/whitelist header penting seperti authorization, correlation ID, locale, dsb

---

# 🧼 XSS Protection

## Rule 1 — Hindari HTML Mentah

🚫 Dilarang:

* render HTML mentah tanpa sanitasi
* menggunakan `dangerouslySetInnerHTML` tanpa sanitization layer

## Rule 2 — Sanitization Wajib

Jika harus render HTML, WAJIB:

* gunakan sanitization helper terpusat
* gunakan allowlist tag dan attribute minimum

## Rule 3 — Escaping by Default

* prioritaskan render text biasa
* jangan inject data user ke HTML/JS/CSS secara langsung

## Rule 4 — URL Injection

* validasi URL sebelum dipakai di `href`, redirect, atau navigation
* tolak `javascript:` dan schema berbahaya lainnya

---

# 🔁 CSRF Protection

## Rule 1 — Cookie-based Session Wajib Proteksi CSRF

Jika menggunakan cookie untuk auth/session:

* gunakan `SameSite`
* pertimbangkan CSRF token untuk state-changing requests jika flow membutuhkannya
* jangan menerima state-changing request tanpa proteksi memadai

## Rule 2 — State-Changing Method

Operasi berikut harus dianggap sensitif:

* `POST`
* `PUT`
* `PATCH`
* `DELETE`

Harus memiliki proteksi sesuai model auth yang dipakai.

---

# 🧪 Input Validation & Output Encoding

## Rule 1 — Validation di Banyak Layer

Validation ideal dilakukan di:

* UI → untuk UX
* BFF/API → wajib
* domain/use case → jika bagian dari business rule

## Rule 2 — Jangan Gunakan Regex Berisiko

* hindari regex yang rentan catastrophic backtracking
* gunakan pola yang sederhana dan aman
* review regex kompleks sebelum merge

## Rule 3 — Encoding Sesuai Context

Encoding harus sesuai konteks:

* HTML context
* URL context
* attribute context
* JS context

Jangan gunakan satu pendekatan untuk semua konteks.

---

# 🔀 Redirect & Navigation Security

## Rule 1 — Open Redirect Dilarang

Redirect target HARUS divalidasi.

Wajib:

* hanya izinkan path internal yang valid
* tolak URL absolut yang tidak diizinkan
* tolak string yang dimulai dengan `//`
* tolak schema seperti `http:`, `https:`, `javascript:` bila tidak sesuai allowlist

## Rule 2 — Return URL

Jika menggunakan parameter `redirect`, `returnUrl`, atau sejenisnya:

* validasi ketat sebelum dipakai
* fallback ke route aman jika invalid

---

# 🧱 Security Headers

Aplikasi production HARUS mempertimbangkan header berikut:

* `X-Content-Type-Options: nosniff`
* `Referrer-Policy`
* `X-Frame-Options` atau CSP `frame-ancestors`
* `Permissions-Policy`
* `Content-Security-Policy` (sesuai kebutuhan aplikasi)

## Rule:

* header security dikonfigurasi terpusat
* perubahan CSP harus direview karena bisa mempengaruhi analytics/script pihak ketiga

---

# 🔐 Environment Variables & Secrets

## Rule 1 — Secret Tidak Boleh Bocor ke Client

Hanya variable dengan prefix `NEXT_PUBLIC_` yang boleh tersedia di client.

🚫 Dilarang:

* expose secret server ke browser
* hardcode credential
* commit `.env` sensitif ke repository

## Rule 2 — Access Secret

* akses secret hanya dari server-side context
* gunakan wrapper/config module bila perlu untuk validasi env saat startup

## Rule 3 — Environment Validation

Wajib ada validasi env penting saat aplikasi start:

* API host
* auth config
* analytics config
* feature flags penting

---

# 🗃️ Data Protection & Privacy

## Rule 1 — Minimal Data Exposure

* kirim data ke client seminimal mungkin
* jangan expose field sensitif yang tidak dibutuhkan UI

## Rule 2 — Logging Aman

🚫 Dilarang log:

* access token
* refresh token
* OTP
* password
* CVV / data kartu sensitif
* PII sensitif tanpa masking

## Rule 3 — Masking

Data sensitif yang perlu ditampilkan/log HARUS dimasking.

Contoh:

* nomor telepon → `0812****1234`
* email → `ri***@domain.com`

---

# 📡 Logging, Monitoring, dan Audit

## Rule 1 — Security Events

Event berikut HARUS bisa diamati:

* login gagal berulang
* akses ditolak
* token invalid/expired
* request anomali
* validation failure penting
* redirect invalid

## Rule 2 — Correlation ID

* gunakan correlation/request ID untuk tracing request penting
* jangan expose internal detail ke user walau tetap dilog secara internal

## Rule 3 — Error Reporting

* laporkan error ke sistem observability
* sanitasi payload error sebelum dikirim ke observability platform

---

# 🧠 Middleware Security Rules

## Rule 1 — Middleware untuk Guard Awal

Middleware cocok untuk:

* auth presence check
* redirect validation
* locale/basepath normalization
* security headers

Middleware **bukan** tempat:

* business rule kompleks
* permission matrix kompleks
* logic transaksi

## Rule 2 — Jangan Mengandalkan Middleware Saja

Semua proteksi di middleware HARUS dianggap sebagai lapisan tambahan, bukan validasi final.

---

# 🧰 Dependency & Package Security

## Rule 1 — Dependency Minimum

* gunakan package seminimal mungkin
* hindari package tidak aktif / tidak jelas maintainer-nya

## Rule 2 — Audit Dependency

Wajib:

* audit package secara berkala
* update dependency yang memiliki vulnerability signifikan
* review transitive dependency untuk package sensitif

## Rule 3 — Library Berisiko

Library untuk hal berikut harus direview ekstra:

* auth
* crypto
* HTML parsing/sanitization
* file upload
* YAML/XML parsing
* markdown rendering

---

# 📤 File Upload & Download Security

## Rule 1 — Upload Validation

Jika aplikasi mendukung upload:

* validasi ukuran file
* validasi mime type
* jangan percaya extension file saja
* rename file jika perlu
* scan jika alur bisnis menuntut

## Rule 2 — Download Response

* set content-type dengan benar
* hindari content sniffing
* jangan expose file privat tanpa auth/authorization

---

# 🧪 Testing Keamanan (WAJIB)

Minimal yang harus diuji untuk fitur sensitif:

* unauthorized access ditolak
* invalid token ditolak
* redirect invalid ditolak
* input invalid gagal aman
* HTML/user input tidak memicu XSS
* error response tidak membocorkan internal detail

Jika ada middleware auth/redirect helper, wajib ada unit test.

---

# 🚫 Anti-Pattern (DILARANG KERAS)

❌ Menyimpan refresh token di localStorage
❌ Menggunakan `dangerouslySetInnerHTML` tanpa sanitasi
❌ Mengekspos stack trace ke client
❌ Menggunakan redirect URL tanpa validasi
❌ Hardcode secret / token / credential
❌ Logging token, OTP, password, atau data sensitif
❌ Menganggap role di client sebagai sumber otorisasi final
❌ Forward seluruh header ke backend tanpa whitelist
❌ Mengandalkan validasi UI saja
❌ Menonaktifkan mekanisme keamanan demi “biar cepat jalan”

---

# ✅ Best Practice

* gunakan HttpOnly cookie untuk token sensitif
* validasi redirect target secara ketat
* sanitasi HTML sebelum render
* validasi semua input di server/BFF
* mask data sensitif di log
* gunakan security headers
* audit dependency secara berkala
* buat unit test untuk helper security kritikal
* laporkan security event ke observability dengan payload aman

---

# ⚠️ Enforcement (Kiro Steering Rule)

Semua AI Agent dan Developer:

* WAJIB mengikuti panduan keamanan ini
* DILARANG membuat implementasi yang melanggar aturan di dokumen ini
* WAJIB memilih pendekatan paling aman jika ada beberapa opsi implementasi
* WAJIB menolak pola yang memperlemah auth, session, redirect validation, sanitization, atau data protection

Jika terjadi konflik antara kemudahan implementasi vs keamanan:
👉 **Keamanan harus diprioritaskan**

Jika terjadi konflik dengan dokumen lain:
👉 gunakan dokumen ini sebagai **sumber kebenaran utama untuk security decision**

---

# 🏁 Kesimpulan

Security bukan fitur tambahan, tetapi bagian inti dari engineering.

Dengan mengikuti panduan ini:

* auth lebih aman
* session lebih terlindungi
* risiko XSS/CSRF/open redirect menurun
* data lebih terlindungi
* aplikasi lebih siap untuk production dan skala enterprise
