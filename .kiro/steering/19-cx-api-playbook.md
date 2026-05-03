---
inclusion: manual
---

# 🔌 CX Platform API Development Playbook (Steering)

Dokumen ini adalah **standar pengembangan API WAJIB** untuk CX Platform — experience orchestration layer antara channels (mobile, web, bots) dan backend systems (ESB, core systems).

Berlaku untuk semua API yang dikembangkan di CX Platform.

Tujuan:

* konsistensi behavior API antar channel
* keamanan kuat untuk API yang publicly exposed
* performa dan skalabilitas tinggi
* mengurangi duplikasi antar channel-specific implementations
* pemisahan tanggung jawab yang jelas antara Gateway, CX, dan ESB

---

# 🏗️ Arsitektur & Request Flow

```text
Channel (Mobile, Web, Bots)
  → API Gateway (Kong)
  → BFF
  → CX Platform (Go services)
  → ESB
  → Core Systems
```

## Tanggung Jawab per Layer

### API Gateway (Kong)

* validasi authentication & generate CX Token
* rate limiting & protection
* request filtering

### CX Platform (Go services)

* experience orchestration
* aggregasi backend services
* personalisasi & response shaping

### ESB

* system orchestration
* integrasi dengan core systems
* transaction integrity

---

# 🧰 Technology Stack

* Backend: **Go (Golang)**
* API style: **REST**
* Gateway: **Kong**
* Authentication: **OAuth2.1 dengan JWT**
* Tracing: **OpenTelemetry**
* Cache: **Redis / Valkey**
* CI/CD: **GitLab**
* Testing: **go test, Testcontainers, contract validation**

---

# 📁 Project Structure (WAJIB)

```text
/cmd/server
/internal/handler
/internal/service
/internal/repository
/internal/model
/internal/middleware
/pkg/config
/pkg/logger
```

---

# 🔐 Authentication & Authorization

* Gunakan **OAuth2.1 dengan JWT**
* Token divalidasi di API Gateway
* CX Platform menerima token yang sudah tervalidasi
* Jangan implementasi auth logic di CX layer — itu tanggung jawab Gateway

---

# 🔍 Correlation ID & Distributed Tracing (WAJIB)

Setiap request HARUS membawa correlation ID.

## Headers Wajib

* `trace-id`
* `traceparent`
* `tracestate`
* `x-device-id`
* `x-app-version`
* `x-correlation-id`

## Rules

* Jika correlation ID tidak ada, generate di Gateway
* HARUS dipropagasi ke semua call CX dan ESB
* HARUS di-log di setiap service
* Gunakan **OpenTelemetry SDK**

---

# 🎯 API Design Standards (WAJIB)

## RESTful Principles

* Gunakan **nouns, bukan verbs**
  * ✅ `GET /offers/{id}`
  * ❌ `GET /getOffer`
* HTTP methods yang benar:
  * `GET` → Retrieve
  * `POST` → Create / Action
  * `PUT` → Full update
  * `PATCH` → Partial update
  * `DELETE` → Remove
* JSON untuk semua API
* Naming: **camelCase**

## Mandatory Headers

* `Authorization` → Bearer token
* `x-correlation-id` → Traceability
* `x-device-id` → Device context
* `x-app-version` → Client version
* `Idempotency-Key` → Wajib untuk operasi kritikal (payments, recharge)

## Pagination

* Gunakan parameter yang konsisten
* Prefer **cursor-based** approach

## Idempotency

* WAJIB untuk payment dan recharge flows
* Gunakan header `Idempotency-Key`

---

# 🚨 Error Handling (WAJIB)

## Error Response Format

```json
{
  "errors": [
    {
      "code": "PAYMENT_FAILED",
      "message": "Payment could not be processed",
      "correlationId": "xyz-123"
    }
  ]
}
```

## Rules

* DILARANG expose internal errors ke client
* WAJIB sertakan correlation ID di setiap error response
* Error code HARUS stabil dan eksplisit
* Message HARUS aman untuk konsumen

---

# 🔄 Versioning & Deprecation

## Default: Schema Evolution (Additive Changes)

Tambah field baru tanpa breaking change.

## Breaking Changes: New Version

Gunakan path versioning (`/v1/...` → `/v2/...`).

## Deprecation Rules

* HARUS ditandai secara eksplisit
* HARUS dikomunikasikan ke semua consumer
* HARUS di-track
* HARUS ada target removal plan
* Sertakan headers: `Deprecation`, `Sunset`, `Link`

---

# 🧪 Testing Strategy (WAJIB)

## Unit Tests

* Minimum coverage: **85%**
* Tidak boleh ada external dependencies

## Contract Tests

* Validasi kontrak CX ke ESB

## Integration Tests

* Validasi DB, cache, messaging
* Gunakan **Testcontainers**

## Functional Tests

* Validasi end-to-end API
* Jalankan sebagai smoke tests saat deployment

## CI/CD Rule

* Pipeline HARUS gagal jika test apapun gagal

---

# 🛡️ Resilience & Fault Tolerance (WAJIB)

## A. Timeouts

* WAJIB untuk semua external calls

## B. Retry Policy

* Hanya untuk transient failures (timeouts, 5xx)
* Maximum **3 attempts** dengan exponential backoff
* DILARANG retry untuk business errors

## C. Circuit Breaker

* Cegah cascading failures
* Konfigurasi: MaxRequests, Interval, Timeout

---

# 🚦 Rate Limiting & Throttling

Di-enforce di **API Gateway**.

| Type | Use Case | Example |
|------|----------|---------|
| Per User | Logged-in APIs | 100 req/min |
| Per Device | Mobile apps | 60 req/min |
| Per IP | Public APIs, anti-bot | 100 req/min |
| Per API | Critical endpoints (payments, OTP) | 10-50 req/min |

---

# 💾 Caching Strategy

Cache di CX layer. CX BUKAN source of truth. Gunakan **Valkey**.

## Boleh di-cache

* Default catalog & offers
* Dashboard aggregation (short TTL)

## DILARANG di-cache

* Payments, Balance, Real-time transactional data

---

# 📡 Logging & Observability

* Structured logging (JSON)
* Correlation ID di setiap log
* OpenTelemetry untuk distributed tracing
* RED metrics (Rate, Error, Duration)
* DILARANG log token, password, OTP, data sensitif

---

# 🚫 Anti-Pattern

❌ Expose internal errors ke client
❌ API tanpa correlation ID
❌ Retry untuk business errors
❌ Cache data transaksional real-time
❌ Auth logic di CX layer
❌ Breaking change tanpa versioning
❌ External call tanpa timeout
❌ Test coverage di bawah 85%
❌ Log credential atau data sensitif

---

# ✅ Best Practice

* Ikuti RESTful standards
* Correlation ID di semua request
* Timeout, retry, circuit breaker untuk semua outbound calls
* Cache hanya data yang sesuai
* Test berlapis (unit, contract, integration, functional)
* Versioning untuk breaking changes
* Deprecation yang jelas dan terkomunikasi
* Structured logging dengan OpenTelemetry

---

# ⚠️ Enforcement (Kiro)

* WAJIB mengikuti API design standards
* WAJIB implementasi correlation ID
* WAJIB implementasi resilience (timeout, retry, circuit breaker)
* WAJIB test coverage >= 85%
* DILARANG expose internal errors
* DILARANG cache data transaksional
* DILARANG breaking change tanpa versioning

Jika ada konflik antara kecepatan vs standar:
👉 pilih **standar yang aman dan konsisten**
