---
inclusion: manual
---

# 📡 Observability Guideline (Steering)

Dokumen ini adalah **standar observability WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Observability mencakup:

* logging
* metrics
* tracing
* monitoring
* alerting

Tujuannya agar sistem:

* mudah di-debug
* cepat di-troubleshoot
* terukur performanya
* cepat recover saat terjadi incident (MTTR rendah)

---

# 🎯 Tujuan

* mengetahui apa yang terjadi di sistem secara real-time
* melacak alur request end-to-end
* mengidentifikasi bottleneck dan error
* mempercepat root cause analysis

---

# ⚖️ Prinsip Utama

## 1. Observable by Default

Semua fitur baru HARUS bisa di-observe.

## 2. Correlation First

Semua log, trace, dan metric HARUS bisa dihubungkan.

## 3. No Blind Spot

Tidak boleh ada bagian sistem yang tidak bisa dilacak.

## 4. Low Noise, High Signal

Log harus informatif, bukan spam.

---

# 🧩 Komponen Observability

## 1. Logging

## 2. Metrics

## 3. Tracing

Ketiganya HARUS saling terhubung.

---

# 📝 Logging Guideline

## Rule 1 — Structured Logging (WAJIB)

Gunakan format JSON / structured log:

```ts
logger.info({
  message: 'Payment success',
  userId,
  orderId,
});
```

## Rule 2 — Level Logging

* `info` → event normal
* `warn` → kondisi abnormal
* `error` → failure
* `debug` → dev only

## Rule 3 — Jangan Log Data Sensitif

🚫 Dilarang:

* token
* password
* OTP
* CVV

## Rule 4 — Context Wajib

Setiap log HARUS punya:

* correlationId
* feature/module
* timestamp (auto)

---

# 📊 Metrics Guideline (RED Method)

Gunakan prinsip **RED**:

* Rate → jumlah request
* Error → jumlah error
* Duration → waktu response

## Rule:

* setiap endpoint punya metrics
* setiap use case kritikal punya metrics

---

# 🔍 Tracing Guideline

## Rule 1 — End-to-End Trace

Trace HARUS bisa melacak:

```text
UI → BFF (Next.js) → API → DB / Kafka
```

## Rule 2 — Correlation ID

* generate correlation ID di entry point
* propagate ke seluruh layer

## Rule 3 — Span

Span minimal:

* API call
* use case execution
* external service call

---

# 🧠 Correlation ID (WAJIB)

## Rule:

* dibuat di entry (request pertama)
* dikirim via header
* digunakan di semua log

Contoh header:

```text
x-correlation-id
```

---

# 🚨 Error Monitoring

Gunakan tool seperti:

* Sentry

## Rule:

* semua error penting dikirim ke monitoring
* sanitasi data sebelum dikirim
* grouping error dengan benar

---

# 📈 Dashboard Monitoring

Minimal dashboard harus punya:

* request rate
* error rate
* latency
* top endpoints
* top error

---

# 🔔 Alerting

## Rule:

Alert HARUS dibuat untuk:

* error spike
* latency tinggi
* service down

## Prinsip:

* actionable
* tidak spam

---

# 🧪 Observability dalam Testing

## Rule:

* test tidak boleh bergantung pada log eksternal
* mock logger jika perlu
* validasi bahwa critical event tetap ter-trigger

---

# 🔐 Security & Observability

## Rule:

* log tidak boleh bocor data sensitif
* masking wajib untuk PII
* audit log untuk event penting

---

# 🚫 Anti-Pattern

❌ log terlalu banyak (noise)
❌ tidak ada correlation ID
❌ log string tanpa struktur
❌ tidak ada tracing
❌ tidak ada metrics
❌ error tidak tercatat

---

# ✅ Best Practice

* gunakan structured logging
* gunakan RED metrics
* gunakan distributed tracing
* gunakan correlation ID
* gunakan dashboard + alert

---

# ⚠️ Enforcement (Kiro)

* WAJIB ada logging untuk flow penting
* WAJIB ada metrics untuk endpoint kritikal
* WAJIB ada trace untuk external call
* DILARANG merge tanpa observability pada fitur penting

---

# 🏁 Kesimpulan

Observability adalah fondasi production system.

Tanpa observability:

* debugging sulit
* incident lambat ditangani
* kualitas sistem menurun

Dengan observability:

* sistem transparan
* MTTR turun
* sistem siap scale
